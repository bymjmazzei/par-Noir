/**
 * Background Task Processor
 * Handles non-upload background operations: share settings, metadata, collections, deletions, feeds
 */

import { uploadQueueService, UploadTask } from './uploadQueueService';
import { PNOAuthService } from './pnOAuthService';
import { getEncryptionService } from './encryptionService';
import { createCollection } from './collectionService';
import { FeedService } from './feedService';
import { saveToFeed, removeFromSavedFeed } from './savedFeedService';

import { API_ENDPOINT } from '../config/api';

interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
  };
}

/**
 * Process background task (routes to specific processor)
 */
export async function processBackgroundTask(task: UploadTask): Promise<void> {
  try {
    // Get session and encryption keys
    const session = PNOAuthService.loadSession();
    if (!session?.did) {
      throw new Error('No DID in session for encryption');
    }

    let publicKey = session?.publicKey;
    if (!publicKey && session.accessToken) {
      try {
        const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
        if (userInfo.public_key) {
          publicKey = userInfo.public_key;
          const updatedSession = { ...session, publicKey };
          PNOAuthService.saveSession(updatedSession);
        }
      } catch (err) {
        // Silent fail
      }
    }

    if (!publicKey && (task.type === 'updateShareSettings' || task.type === 'createCollection')) {
      throw new Error('No publicKey available for encryption');
    }

    const accessToken = await PNOAuthService.getValidAccessToken(true);
    if (!accessToken) {
      throw new Error('No valid access token');
    }

    // Route to specific processor
    switch (task.type) {
      case 'updateShareSettings':
        await processShareSettingsUpdate(task, session, accessToken);
        break;
      case 'updateMetadata':
        await processMetadataUpdate(task, accessToken);
        break;
      case 'createCollection':
        await processCollectionCreation(task);
        break;
      case 'deleteFile':
        await processFileDeletion(task, accessToken);
        break;
      case 'bulkDelete':
        await processBulkDeletion(task, accessToken);
        break;
      case 'addToFeed':
        await processAddToFeed(task);
        break;
      case 'saveToFeed':
        await processSaveToFeed(task, accessToken);
        break;
      default:
        throw new Error(`Unknown background task type: ${task.type}`);
    }

    uploadQueueService.updateTaskStatus(task.id, 'completed');
    uploadQueueService.notifyTaskFinished(task.id);
  } catch (error: any) {
    console.error(`[BackgroundTaskProcessor] Task ${task.id} failed:`, error);
    uploadQueueService.updateTaskStatus(task.id, 'failed', error?.message || 'Operation failed');
    uploadQueueService.notifyTaskFinished(task.id);
  }
}

/**
 * Helper: Resolve fileId to thumbnail fileId
 * If fileId is a main file, finds the thumbnail that references it via mainFileId
 * If fileId is already a thumbnail, returns it
 */
async function resolveToThumbnailFileId(fileId: string, accessToken: string): Promise<string> {
  try {
    // Try to get metadata for fileId
    const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      // If metadata exists, fileId is a thumbnail (or has metadata) - return it
      return fileId;
    }
    
    // If not found, fileId might be a main file
    // The API GET endpoint will handle the resolution, so just return fileId
    // The API will resolve it to thumbnail if needed
    return fileId;
  } catch (error: any) {
    console.warn(`[resolveToThumbnailFileId] Failed to resolve ${fileId}, using as-is:`, error?.message || error);
    return fileId; // Fallback to original fileId
  }
}

/**
 * Process share settings update
 */
async function processShareSettingsUpdate(
  task: UploadTask,
  session: any,
  accessToken: string
): Promise<void> {
  const { fileId, accountId, shareVisibility, shareNSFW, indexerToggles, thirdPartyIndexers, nextPermissions: providedNextPermissions, existingMetadata } = task.metadata || {};
  
  if (!fileId || !accountId) {
    throw new Error('Missing required fields: fileId, accountId');
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  // Resolve to thumbnail fileId (main files don't have metadata, only thumbnails do)
  const resolvedThumbnailFileId = await resolveToThumbnailFileId(fileId, accessToken);
  const targetFileId = existingMetadata?.fileId || resolvedThumbnailFileId;
  const isCurrentlyPublic = existingMetadata?.isPublic || false;
  const existingIsNSFW = existingMetadata?.isNSFW === true;
  const makePublic = shareVisibility === 'public';

  // Use provided permissions or calculate from indexerToggles
  let nextPermissions: any = providedNextPermissions || null;
  if (!nextPermissions && thirdPartyIndexers && thirdPartyIndexers.length > 0) {
    const blockedIds = Object.entries(indexerToggles || {})
      .filter(([, enabled]) => !enabled)
      .map(([id]) => id);
    const enabledIds = Object.entries(indexerToggles || {})
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    
    if (blockedIds.length === 0) {
      nextPermissions = {
        mode: 'all',
        blocked: [],
        allowed: enabledIds,
        updatedAt: new Date().toISOString()
      };
    } else if (blockedIds.length === thirdPartyIndexers.length) {
      nextPermissions = {
        mode: 'none',
        blocked: [...blockedIds],
        allowed: [],
        updatedAt: new Date().toISOString()
      };
    } else {
      nextPermissions = {
        mode: 'all',
        blocked: [...blockedIds],
        allowed: enabledIds,
        updatedAt: new Date().toISOString()
      };
    }
  }

  // When making public, we MUST generate publicToken (private files don't have it)
  // When making private, we MUST delete publicToken (remove from server)
  let publicToken: string | undefined = undefined;
  if (makePublic) {
    // Making public: generate publicToken if needed
    // Don't check for existingPublicToken - private files don't have it on server
    uploadQueueService.updateTaskProgress(task.id, 20);
    
    // Generate share token
    try {
      const downloadResponse = await fetch(
        `${API_ENDPOINT}/api/drive/files/${targetFileId}?accountId=${encodeURIComponent(accountId)}&download=true`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      uploadQueueService.updateTaskProgress(task.id, 30);

      if (downloadResponse.ok) {
        const fileBlob = await downloadResponse.blob();
        const fileText = await fileBlob.text();
        
        if (!fileText || fileText.trim().length === 0) {
          throw new Error('Downloaded file is empty');
        }
        
        const encryptedPackage: EncryptedFilePackage = JSON.parse(fileText);
        
        if (!encryptedPackage.encrypted || !encryptedPackage.iv || !encryptedPackage.salt) {
          throw new Error('Invalid encrypted file package structure');
        }
        
        // Generate share token
        if (session?.publicKey) {
          const encryptionService = getEncryptionService();
          const shareToken = await encryptionService.generateShareToken(
            encryptedPackage,
            {
              id: session.did,
              publicKey: session.publicKey
            }
          );
          publicToken = JSON.stringify(shareToken);
        }
      }
    } catch (tokenError: any) {
      console.error('[BackgroundTaskProcessor] Failed to generate share token:', tokenError);
      throw new Error(`Failed to generate share token: ${tokenError.message}`);
    }
  }

  uploadQueueService.updateTaskProgress(task.id, 50);

  // Update metadata
  const accountIdParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
  const updateBody: any = {};

  if (makePublic) {
    updateBody.isPublic = true;
    // CRITICAL: Always include publicToken when making public
    if (!publicToken) {
      throw new Error('Cannot make file public without publicToken');
    }
    updateBody.publicToken = publicToken;
  } else if (makePublic !== isCurrentlyPublic) {
    updateBody.isPublic = false;
    // CRITICAL: Delete publicToken when making private (set to null/undefined)
    updateBody.publicToken = null;
  }
  
  if (makePublic || isCurrentlyPublic) {
    updateBody.isNSFW = shareNSFW;
  } else if (shareNSFW !== existingIsNSFW) {
    updateBody.isNSFW = shareNSFW;
  }
  
  const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${targetFileId}${accountIdParam}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(updateBody),
  });
  
  if (!metadataResponse.ok) {
    const errorText = await metadataResponse.text().catch(() => 'Unknown error');
    throw new Error(`Failed to update file visibility: ${errorText}`);
  }

  uploadQueueService.updateTaskProgress(task.id, 70);

  // Wait for API propagation if making public
  if (makePublic && accountId) {
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  uploadQueueService.updateTaskProgress(task.id, 80);

  // Persist indexer permissions whenever the file is (or will be) public
  if ((makePublic || isCurrentlyPublic) && nextPermissions) {
    const response = await fetch(
      `${API_ENDPOINT}/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          indexingPermissions: nextPermissions
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(errorText || `Failed to update index visibility (${response.status})`);
    }
  }

  uploadQueueService.updateTaskProgress(task.id, 90);
  
  // Set result for callbacks
  uploadQueueService.setTaskResult(task.id, {
    fileId: targetFileId,
    accountId,
    isPublic: makePublic,
    isNSFW: shareNSFW,
    indexingPermissions: nextPermissions
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

/**
 * Process metadata update
 */
async function processMetadataUpdate(
  task: UploadTask,
  accessToken: string
): Promise<void> {
  const { fileId, accountId, metadata: formData } = task.metadata || {};
  
  if (!fileId || !formData) {
    throw new Error('Missing required fields: fileId, metadata');
  }

  // accountId is optional - some contexts (like EditFileModal) don't use accounts

  uploadQueueService.updateTaskProgress(task.id, 10);

  // Parse tags and genre
  const tags = String(formData.tags || '').split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
  const genre = String(formData.genre || '').split(',').map((item: string) => item.trim()).filter((item: string) => item.length > 0);

  uploadQueueService.updateTaskProgress(task.id, 15);

  // Extract subjects
  const { extractSubjects } = await import('../utils/subjectExtractor');
  const subjects = extractSubjects(
    formData.description || '',
    tags,
    tags // keywords same as tags
  );

  // Build location object if provided
  let locationCreated = undefined;
  if (formData.locationName || formData.locationAddress) {
    locationCreated = {
      '@type': 'Place',
      ...(formData.locationName && { name: formData.locationName }),
      ...(formData.locationAddress && {
        address: {
          '@type': 'PostalAddress',
          addressLocality: formData.locationAddress.split(',')[0]?.trim() || '',
          addressRegion: formData.locationAddress.split(',')[1]?.trim() || '',
          addressCountry: formData.locationAddress.split(',')[2]?.trim() || ''
        }
      })
    };
  }

  uploadQueueService.updateTaskProgress(task.id, 20);

  // Validate categories
  const categories = formData.categories || [];
  if (categories.length === 0) {
    throw new Error('At least one category is required');
  }

  // Build update body - include all fields from formData
  const updateBody: any = {
    name: formData.name,
    description: formData.description,
    keywords: tags,
    tags: tags,
  };

  // Add optional fields if present
  if (genre.length > 0) updateBody.genre = genre;
  if (categories.length > 0) {
    updateBody.feedCategories = categories;
    updateBody.category = categories[0];
  }
  if (locationCreated) updateBody.locationCreated = locationCreated;
  if (formData.license) updateBody.license = formData.license;
  if (subjects.length > 0) updateBody.subjects = subjects;

  // Handle EditFileModal-specific fields
  if ('isPublic' in formData) updateBody.isPublic = formData.isPublic;
  if ('visibility' in formData) updateBody.visibility = formData.visibility;
  if ('isNSFW' in formData) updateBody.isNSFW = formData.isNSFW;
  if ('isTopPost' in formData) updateBody.isTopPost = formData.isTopPost;
  if ('title' in formData) updateBody.title = formData.title;

  // Update via API endpoint
  const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(updateBody),
  });

  uploadQueueService.updateTaskProgress(task.id, 80);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update metadata: ${errorText}`);
  }

  const updatedMetadata = await response.json();
  
  uploadQueueService.setTaskResult(task.id, {
    fileId,
    accountId,
    metadata: updatedMetadata.metadata || updatedMetadata
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

/**
 * Process collection creation
 */
async function processCollectionCreation(
  task: UploadTask
): Promise<void> {
  const { collectionData, accountId, metadata: formData } = task.metadata || {};
  
  if (!collectionData || !accountId) {
    throw new Error('Missing required fields: collectionData, accountId');
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  // Parse tags and genre
  const tags = String(formData?.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean);

  uploadQueueService.updateTaskProgress(task.id, 15);

  uploadQueueService.updateTaskProgress(task.id, 30);

  // Create collection using service
  const result = await createCollection(
    {
      collectionFileIds: collectionData.collectionFileIds,
      title: formData?.name || collectionData.title || `Collection of ${collectionData.collectionFileIds.length} files`
    },
    accountId,
    {
      title: formData?.name,
      description: formData?.description,
      keywords: tags,
      tags: tags,
      isPublic: true, // Collections default to public
      isNSFW: false
    }
  );

  uploadQueueService.updateTaskProgress(task.id, 90);

  if (!result.success) {
    throw new Error(result.error || 'Failed to create collection');
  }

  uploadQueueService.setTaskResult(task.id, {
    fileId: result.fileId,
    accountId,
    success: true
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

/**
 * Process file deletion
 */
async function processFileDeletion(
  task: UploadTask,
  accessToken: string
): Promise<void> {
  let { fileId, accountId, isCollection, collectionFileIds, isThoughtCollection } = task.metadata || {};
  
  if (!fileId || !accountId) {
    throw new Error('Missing required fields: fileId, accountId');
  }

  uploadQueueService.updateTaskProgress(task.id, 5);

  // Load metadata if isCollection wasn't determined upfront (non-blocking in UI)
  if (isCollection === undefined) {
    try {
      const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        const metadataObj = metadata.metadata || metadata;
        isCollection = metadataObj.fileType === 'collection' && metadataObj.collection?.collectionFileIds;
        if (isCollection) {
          collectionFileIds = metadataObj.collection.collectionFileIds;
          isThoughtCollection = metadataObj.isThoughtCollection === true;
        }
      }
    } catch (err) {
      console.warn('[BackgroundTaskProcessor] Failed to load metadata for delete check:', err);
    }
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  // Delete associated files if collection
  if (isCollection && collectionFileIds && Array.isArray(collectionFileIds) && collectionFileIds.length > 0) {
    let thoughtCollectionFileId: string | null = null;
    
    // For thought collections, get main file ID from first thumbnail
    if (isThoughtCollection && collectionFileIds.length > 0) {
      try {
        const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${collectionFileIds[0]}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (metadataResponse.ok) {
          const metadata = await metadataResponse.json();
          thoughtCollectionFileId = metadata.metadata?.mainFileId || null;
        }
      } catch (err) {
        console.warn('[BackgroundTaskProcessor] Failed to load metadata for first thumbnail:', err);
      }
    }
    
    uploadQueueService.updateTaskProgress(task.id, 20);
    
    // Delete all thumbnail files
    const totalFiles = collectionFileIds.length + (thoughtCollectionFileId ? 1 : 0);
    let deletedCount = 0;
    
    for (const thumbnailId of collectionFileIds) {
      try {
        const deleteResponse = await fetch(`${API_ENDPOINT}/api/drive/files/${thumbnailId}?accountId=${accountId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (deleteResponse.ok) {
          deletedCount++;
          const progress = 20 + (deletedCount / totalFiles) * 60;
          uploadQueueService.updateTaskProgress(task.id, Math.min(progress, 80));
        }
      } catch (err: any) {
        console.warn(`[BackgroundTaskProcessor] Error deleting thumbnail ${thumbnailId}:`, err);
      }
    }
    
    // Delete main thought-collection file if exists
    if (isThoughtCollection && thoughtCollectionFileId) {
      try {
        const deleteResponse = await fetch(`${API_ENDPOINT}/api/drive/files/${thoughtCollectionFileId}?accountId=${accountId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (deleteResponse.ok) {
          deletedCount++;
        }
      } catch (err: any) {
        console.warn(`[BackgroundTaskProcessor] Error deleting thought-collection file ${thoughtCollectionFileId}:`, err);
      }
    }
    
    uploadQueueService.updateTaskProgress(task.id, 80);
  } else {
    uploadQueueService.updateTaskProgress(task.id, 20);
  }

  // Delete main file
  const response = await fetch(`${API_ENDPOINT}/api/drive/files/${fileId}?accountId=${accountId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  uploadQueueService.updateTaskProgress(task.id, 95);

  if (!response.ok) {
    throw new Error('Failed to delete file');
  }

  uploadQueueService.setTaskResult(task.id, {
    fileId,
    accountId,
    deleted: true
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

/**
 * Process bulk deletion
 */
async function processBulkDeletion(
  task: UploadTask,
  accessToken: string
): Promise<void> {
  const { fileIds, accountId } = task.metadata || {};
  
  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0 || !accountId) {
    throw new Error('Missing required fields: fileIds (array), accountId');
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  let deletedCount = 0;
  const totalFiles = fileIds.length;

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i];
    try {
      const response = await fetch(`${API_ENDPOINT}/api/drive/files/${fileId}?accountId=${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        deletedCount++;
      }
    } catch (err: any) {
      console.warn(`[BackgroundTaskProcessor] Error deleting file ${fileId}:`, err);
    }

    const progress = 10 + ((i + 1) / totalFiles) * 90;
    uploadQueueService.updateTaskProgress(task.id, Math.min(progress, 100));
  }

  uploadQueueService.setTaskResult(task.id, {
    deletedCount,
    totalFiles,
    accountId
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

/**
 * Process add to feed
 */
async function processAddToFeed(
  task: UploadTask
): Promise<void> {
  const { fileId, feedsToAdd, feedsToRemove, addedBy } = task.metadata || {};
  
  if (!fileId || !addedBy) {
    throw new Error('Missing required fields: fileId, addedBy');
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  const feedsToAddArray = feedsToAdd || [];
  const feedsToRemoveArray = feedsToRemove || [];
  const totalOperations = feedsToAddArray.length + feedsToRemoveArray.length;

  if (totalOperations === 0) {
    uploadQueueService.updateTaskProgress(task.id, 100);
    uploadQueueService.setTaskResult(task.id, { success: true, added: 0, removed: 0 });
    return;
  }

  let addedCount = 0;
  let removedCount = 0;
  const errors: string[] = [];

  // Add to feeds
  for (let i = 0; i < feedsToAddArray.length; i++) {
    const feedId = feedsToAddArray[i];
    try {
      await FeedService.addPostToFeed(feedId, fileId, addedBy);
      addedCount++;
    } catch (err: any) {
      const errorMsg = `Failed to add to feed ${feedId}: ${err.message}`;
      console.error(`[BackgroundTaskProcessor] ${errorMsg}`, err);
      errors.push(errorMsg);
    }
    
    const progress = 10 + ((i + 1) / totalOperations) * 40;
    uploadQueueService.updateTaskProgress(task.id, Math.min(progress, 50));
  }

  // Remove from feeds
  for (let i = 0; i < feedsToRemoveArray.length; i++) {
    const feedId = feedsToRemoveArray[i];
    try {
      await FeedService.removePostFromFeed(feedId, fileId, addedBy);
      removedCount++;
    } catch (err: any) {
      const errorMsg = `Failed to remove from feed ${feedId}: ${err.message}`;
      console.error(`[BackgroundTaskProcessor] ${errorMsg}`, err);
      errors.push(errorMsg);
    }
    
    const progress = 50 + ((i + 1) / feedsToRemoveArray.length) * 40;
    uploadQueueService.updateTaskProgress(task.id, Math.min(progress, 90));
  }

  uploadQueueService.updateTaskProgress(task.id, 90);

  // Set result
  uploadQueueService.setTaskResult(task.id, {
    success: errors.length === 0,
    added: addedCount,
    removed: removedCount,
    errors: errors.length > 0 ? errors : undefined
  });

  uploadQueueService.updateTaskProgress(task.id, 100);

  // Throw if all operations failed
  if (addedCount === 0 && removedCount === 0 && totalOperations > 0) {
    throw new Error(`All feed operations failed: ${errors.join('; ')}`);
  }
}

/**
 * Process save to feed
 */
async function processSaveToFeed(
  task: UploadTask,
  accessToken: string
): Promise<void> {
  const { fileId, userPnIdentifier, isSaved } = task.metadata || {};
  
  if (!fileId || !userPnIdentifier) {
    throw new Error('Missing required fields: fileId, userPnIdentifier');
  }

  uploadQueueService.updateTaskProgress(task.id, 10);

  // Save or remove from saved feed
  if (isSaved) {
    // Remove from saved feed
    await removeFromSavedFeed(userPnIdentifier, fileId);
    uploadQueueService.updateTaskProgress(task.id, 60);
  } else {
    // Save to feed
    await saveToFeed(userPnIdentifier, fileId);
    uploadQueueService.updateTaskProgress(task.id, 60);
  }

  // Record engagement (save/unsave)
  try {
    await fetch(`${API_ENDPOINT}/api/engagement/${fileId}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ userPnIdentifier })
    });
  } catch (engagementErr) {
    console.warn('[BackgroundTaskProcessor] Failed to record save engagement:', engagementErr);
    // Don't fail the operation if engagement recording fails
  }

  uploadQueueService.updateTaskProgress(task.id, 90);

  uploadQueueService.setTaskResult(task.id, {
    fileId,
    userPnIdentifier,
    isSaved: !isSaved, // Toggle state
    success: true
  });

  uploadQueueService.updateTaskProgress(task.id, 100);
}

// Register background task processor for taskReady events
uploadQueueService.on('taskReady', (task: UploadTask) => {
  // Only handle background task types (not upload types which are handled by uploadProcessor)
  if (task.type === 'updateShareSettings' || task.type === 'updateMetadata' || 
      task.type === 'createCollection' || task.type === 'deleteFile' || task.type === 'bulkDelete' ||
      task.type === 'addToFeed' || task.type === 'saveToFeed') {
    processBackgroundTask(task).catch(error => {
      console.error('[BackgroundTaskProcessor] Error processing task:', error);
    });
  }
});
