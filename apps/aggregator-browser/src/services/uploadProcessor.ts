/**
 * Upload Processor
 * Orchestrates parallel operations for uploads using workers and queue
 */

import { uploadQueueService, UploadTask } from './uploadQueueService';
import { workerManager } from './workerManager';
import { PNOAuthService } from './pnOAuthService';
import { getEncryptionService } from './encryptionService';
import { renderTextPostToBlob } from './textPostService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
 * Process upload task
 */
export async function processUploadTask(task: UploadTask): Promise<void> {
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

    if (!publicKey) {
      throw new Error('No publicKey available for encryption');
    }

    const accessToken = await PNOAuthService.getValidAccessToken(true);
    if (!accessToken) {
      throw new Error('No valid access token');
    }

    // Process based on task type
    if (task.type === 'file') {
      await processFileUpload(task, session, publicKey, accessToken);
    } else if (task.type === 'textPost') {
      await processTextPostUpload(task, session, publicKey, accessToken);
    } else if (task.type === 'multiPage') {
      await processMultiPageUpload(task, session, publicKey, accessToken);
    } else if (task.type === 'pdf') {
      await processPDFUpload(task, session, publicKey, accessToken);
    } else {
      throw new Error(`Unknown task type: ${task.type}`);
    }

    uploadQueueService.updateTaskStatus(task.id, 'completed');
    uploadQueueService.notifyTaskFinished(task.id);
  } catch (error: any) {
    console.error(`[UploadProcessor] Task ${task.id} failed:`, error);
    uploadQueueService.updateTaskStatus(task.id, 'failed', error?.message || 'Upload failed');
    uploadQueueService.notifyTaskFinished(task.id);
  }
}

/**
 * Process file upload (images, videos, etc.)
 */
async function processFileUpload(
  task: UploadTask,
  session: any,
  publicKey: string,
  accessToken: string
): Promise<void> {
  if (!task.file) {
    throw new Error('No file provided');
  }

  const file = task.file;
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  uploadQueueService.updateTaskProgress(task.id, 5);

  // Step 1: Encrypt file and generate thumbnail in parallel
  uploadQueueService.updateTaskStatus(task.id, 'processing');
  uploadQueueService.updateTaskProgress(task.id, 10);

  const fileArrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(fileArrayBuffer);

  // Parallel: Encrypt file + Generate thumbnail (if needed)
  const [encrypted, thumbnailBlob] = await Promise.all([
    workerManager.encrypt(fileData, session.did, publicKey),
    isImage || isVideo
      ? generateThumbnailForFile(file, isImage)
      : Promise.resolve<Blob | null>(null)
  ]);

  uploadQueueService.updateTaskProgress(task.id, 40);

  // Create encrypted file package
  const packageData: EncryptedFilePackage = {
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    metadata: {
      originalName: file.name,
      originalSize: file.size,
      originalMimeType: file.type,
    },
  };

  // Generate share token
  let shareToken: any = undefined;
  try {
    const encryptionService = getEncryptionService();
    shareToken = await encryptionService.generateShareToken(packageData, {
      id: session.did,
      publicKey: publicKey
    });
  } catch (tokenError) {
    console.warn('Share token generation failed:', tokenError);
  }

  uploadQueueService.updateTaskProgress(task.id, 50);

  // Step 2: Upload file and thumbnail in parallel
  uploadQueueService.updateTaskStatus(task.id, 'uploading');

  const encryptedBlob = new Blob([JSON.stringify(packageData)], { type: 'application/json' });
  const base64File = await blobToBase64(encryptedBlob);

  const uploadPromises: Promise<any>[] = [
    uploadFile(base64File, `${file.name}.encrypted`, accessToken, task.accountId)
  ];

  // Upload thumbnail if we have one
  let thumbnailFileId: string | undefined;
  let thumbnailShareToken: any = undefined;
  if (thumbnailBlob) {
    uploadPromises.push(
      (async () => {
        const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
        const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
        const encryptedThumbnail = await workerManager.encrypt(thumbnailData, session.did, publicKey);
        
        const thumbnailPackage: EncryptedFilePackage = {
          encrypted: encryptedThumbnail.encrypted,
          iv: encryptedThumbnail.iv,
          salt: encryptedThumbnail.salt,
          metadata: {
            originalName: `thumb_${file.name}`,
            originalSize: thumbnailBlob.size,
            originalMimeType: 'image/jpeg',
          },
        };

        let token: any = undefined;
        try {
          const encryptionService = getEncryptionService();
          token = await encryptionService.generateShareToken(thumbnailPackage, {
            id: session.did,
            publicKey: publicKey
          });
        } catch (tokenError) {
          console.warn('Thumbnail share token generation failed:', tokenError);
        }

        const thumbnailBase64 = await blobToBase64(new Blob([JSON.stringify(thumbnailPackage)], { type: 'application/json' }));
        const uploadResult = await uploadFile(thumbnailBase64, `thumb_${file.name}.encrypted`, accessToken, task.accountId);
        // Return both the upload result and the token so we can use both
        return { uploadResult, thumbnailShareToken: token };
      })()
    );
  }

  const uploadResults = await Promise.all(uploadPromises);
  const fileId = uploadResults[0]?.id;
  if (uploadResults.length > 1) {
    const thumbnailResult = uploadResults[1] as { uploadResult?: any; thumbnailShareToken?: any };
    thumbnailFileId = thumbnailResult.uploadResult?.id;
    thumbnailShareToken = thumbnailResult.thumbnailShareToken;
  }

  uploadQueueService.updateTaskProgress(task.id, 90);

  // Step 3: Create metadata
  // CRITICAL: Only create metadata for the THUMBNAIL, not the main file
  // Main files are excluded from feeds - only thumbnails appear
  // The thumbnail metadata should reference the main file via mainFileId for downloads
  
  const fileType = isPDF ? 'document'
    : isImage ? 'image'
    : isVideo ? 'video'
    : file.type.startsWith('audio/') ? 'audio'
    : 'document';

  // Only create thumbnail metadata if we have a thumbnail
  if (thumbnailFileId) {
    // CRITICAL: Always store publicToken if thumbnailShareToken exists (even for private files)
    // This ensures the token is available when the file is later made public
    const publicTokenString = thumbnailShareToken ? JSON.stringify(thumbnailShareToken) : undefined;
    if (!publicTokenString) {
      console.warn('[UploadProcessor] Warning: Thumbnail metadata created without publicToken - thumbnail will not be decryptable in public feed');
    } else {
      console.log('[UploadProcessor] Creating thumbnail metadata with publicToken:', {
        thumbnailFileId,
        hasPublicToken: !!publicTokenString,
        isPublic: task.metadata?.isPublic || false
      });
    }
    
    try {
      await createMetadata(thumbnailFileId, {
        name: `thumb_${file.name}`,
        description: task.metadata?.description || '',
        keywords: task.metadata?.keywords || [],
        tags: task.metadata?.tags || [],
        fileType: 'image', // Thumbnails are always images
        isPublic: task.metadata?.isPublic || false,
        publicToken: publicTokenString,
        uploadDate: new Date().toISOString(),
        isNSFW: task.metadata?.isNSFW || false,
        mainFileId: fileId, // Reference to main file for downloads
      }, accessToken);
      console.log('[UploadProcessor] Thumbnail metadata created successfully');
    } catch (metadataError: any) {
      console.error('[UploadProcessor] Failed to create thumbnail metadata:', metadataError);
      throw new Error(`Failed to create thumbnail metadata: ${metadataError.message}`);
    }
  } else {
    // Fallback: if no thumbnail, create metadata for main file (shouldn't happen for images/videos)
    await createMetadata(fileId, {
      name: file.name,
      description: task.metadata?.description || '',
      keywords: task.metadata?.keywords || [],
      tags: task.metadata?.tags || [],
      fileType,
      isPublic: task.metadata?.isPublic || false,
      publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
      uploadDate: new Date().toISOString(),
      isNSFW: task.metadata?.isNSFW || false,
    }, accessToken);
  }

  uploadQueueService.setTaskResult(task.id, {
    fileId,
    thumbnailFileId,
    thumbnailShareToken,
  });
}

/**
 * Process text post upload
 */
async function processTextPostUpload(
  task: UploadTask,
  session: any,
  publicKey: string,
  accessToken: string
): Promise<void> {
  if (!task.textPost) {
    throw new Error('No text post provided');
  }

  uploadQueueService.updateTaskProgress(task.id, 5);

  // Step 1: Prepare thought file and generate thumbnail in parallel
  uploadQueueService.updateTaskStatus(task.id, 'processing');
  uploadQueueService.updateTaskProgress(task.id, 10);

  const thoughtData = {
    textPost: task.textPost,
    version: '1.0',
    createdAt: new Date().toISOString()
  };

  const fileName = `thought-${Date.now()}.thought`;
  const fileContent = JSON.stringify(thoughtData);
  const file = new File([fileContent], fileName, { type: 'application/json' });

  const fileArrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(fileArrayBuffer);

  // Parallel: Encrypt file + Generate thumbnail
  const [encrypted, thumbnailBlob] = await Promise.all([
    workerManager.encrypt(fileData, session.did, publicKey),
    workerManager.renderTextPost(task.textPost, 1.0)
  ]);

  uploadQueueService.updateTaskProgress(task.id, 40);

  // Create encrypted file package
  const packageData: EncryptedFilePackage = {
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    metadata: {
      originalName: fileName,
      originalSize: file.size,
      originalMimeType: 'application/json',
    },
  };

  // Generate share token
  let shareToken: any = undefined;
  try {
    const encryptionService = getEncryptionService();
    shareToken = await encryptionService.generateShareToken(packageData, {
      id: session.did,
      publicKey: publicKey
    });
  } catch (tokenError) {
    console.warn('Share token generation failed:', tokenError);
  }

  uploadQueueService.updateTaskProgress(task.id, 50);

  // Step 2: Upload file and thumbnail in parallel
  uploadQueueService.updateTaskStatus(task.id, 'uploading');

  const encryptedBlob = new Blob([JSON.stringify(packageData)], { type: 'application/json' });
  const base64File = await blobToBase64(encryptedBlob);

  // Encrypt thumbnail
  const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
  const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
  const encryptedThumbnail = await workerManager.encrypt(thumbnailData, session.did, publicKey);

  const thumbnailPackage: EncryptedFilePackage = {
    encrypted: encryptedThumbnail.encrypted,
    iv: encryptedThumbnail.iv,
    salt: encryptedThumbnail.salt,
    metadata: {
      originalName: `thumb_${fileName.replace('.thought', '.png')}`,
      originalSize: thumbnailBlob.size,
      originalMimeType: 'image/png',
    },
  };

  let thumbnailShareToken: any = undefined;
  try {
    const encryptionService = getEncryptionService();
    thumbnailShareToken = await encryptionService.generateShareToken(thumbnailPackage, {
      id: session.did,
      publicKey: publicKey
    });
  } catch (tokenError) {
    console.warn('Thumbnail share token generation failed:', tokenError);
  }

  const thumbnailBase64 = await blobToBase64(new Blob([JSON.stringify(thumbnailPackage)], { type: 'application/json' }));

  const [fileResult, thumbnailResult] = await Promise.all([
    uploadFile(base64File, `${fileName}.encrypted`, accessToken, task.accountId),
    uploadFile(thumbnailBase64, `thumb_${fileName.replace('.thought', '.png')}.encrypted`, accessToken, task.accountId)
  ]);

  const fileId = fileResult?.id;
  const thumbnailFileId = thumbnailResult?.id;

  uploadQueueService.updateTaskProgress(task.id, 90);

  // Step 3: Create metadata for THUMBNAIL only (main file has no metadata - only used for downloads)
  const titleFromContent = (task.textPost.content || '').replace(/<[^>]*>/g, '').split(/\n|<br\s*\/?>/i)[0]?.trim().substring(0, 100) || 'Thought';

  // CRITICAL: Only create metadata for the THUMBNAIL, not the main file
  // Main file is only for owner downloads - it has no metadata entry
  // Thumbnail is the public face of the file and has the ONE metadata entry
  if (thumbnailFileId) {
    await createMetadata(thumbnailFileId, {
      name: `thumb_${fileName.replace('.thought', '.png')}`,
      title: task.metadata?.title || titleFromContent,
      description: task.metadata?.description || task.textPost.content,
      keywords: task.metadata?.keywords || task.metadata?.tags || [],
      tags: task.metadata?.tags || task.metadata?.keywords || [],
      fileType: 'thought-thumbnail',
      isPublic: task.metadata?.isPublic || false,
      isThoughtThumbnail: true,
      mainFileId: fileId, // Reference to main file for downloads
      publicToken: thumbnailShareToken ? JSON.stringify(thumbnailShareToken) : undefined,
      uploadDate: new Date().toISOString(),
      isNSFW: task.metadata?.isNSFW || false,
      textPost: thoughtData.textPost,
      thought: thoughtData.textPost,
    }, accessToken);
  } else {
    // Fallback: if no thumbnail, create metadata for main file (shouldn't happen for thoughts)
    await createMetadata(fileId, {
      name: fileName,
      title: task.metadata?.title || titleFromContent,
      description: task.metadata?.description || task.textPost.content,
      keywords: task.metadata?.keywords || task.metadata?.tags || [],
      tags: task.metadata?.tags || task.metadata?.keywords || [],
      fileType: 'thought',
      isPublic: task.metadata?.isPublic || false,
      publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
      uploadDate: new Date().toISOString(),
      isNSFW: task.metadata?.isNSFW || false,
      textPost: thoughtData.textPost,
      thought: thoughtData.textPost,
    }, accessToken);
  }

  uploadQueueService.setTaskResult(task.id, {
    fileId,
    thumbnailFileId,
    thumbnailShareToken,
  });
}

/**
 * Process multi-page upload (for multi-page thoughts)
 */
async function processMultiPageUpload(
  task: UploadTask,
  session: any,
  publicKey: string,
  accessToken: string
): Promise<void> {
  if (!task.pages || task.pages.length === 0) {
    throw new Error('No pages provided');
  }

  uploadQueueService.updateTaskProgress(task.id, 5);
  uploadQueueService.updateTaskStatus(task.id, 'processing');

  // Create thought collection file
  const thoughtCollectionData = {
    textPost: {
      ...task.pages[0],
      pages: task.pages
    },
    version: '1.0',
    createdAt: new Date().toISOString(),
    isMultiPage: true
  };

  const fileName = `thought-collection-${Date.now()}.thought-collection`;
  const fileContent = JSON.stringify(thoughtCollectionData);
  const file = new File([fileContent], fileName, { type: 'application/json' });

  const fileArrayBuffer = await file.arrayBuffer();
  const fileData = new Uint8Array(fileArrayBuffer);

  // Encrypt main file
  const encrypted = await workerManager.encrypt(fileData, session.did, publicKey);
  uploadQueueService.updateTaskProgress(task.id, 20);

  // Generate all thumbnails in parallel
  const thumbnailPromises = task.pages.map((page, index) =>
    workerManager.renderTextPost(page, 1.0).then(blob => ({ index, blob }))
  );

  const thumbnails = await Promise.all(thumbnailPromises);
  uploadQueueService.updateTaskProgress(task.id, 40);

  // Encrypt all thumbnails in parallel
  const encryptedThumbnailPromises = thumbnails.map(async ({ index, blob }) => {
    const thumbnailArrayBuffer = await blob.arrayBuffer();
    const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
    const encryptedThumbnail = await workerManager.encrypt(thumbnailData, session.did, publicKey);
    return { index, encryptedThumbnail, blob };
  });

  const encryptedThumbnails = await Promise.all(encryptedThumbnailPromises);
  uploadQueueService.updateTaskProgress(task.id, 60);

  // Upload main file
  const packageData: EncryptedFilePackage = {
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    metadata: {
      originalName: fileName,
      originalSize: file.size,
      originalMimeType: 'application/json',
    },
  };

  let shareToken: any = undefined;
  try {
    const encryptionService = getEncryptionService();
    shareToken = await encryptionService.generateShareToken(packageData, {
      id: session.did,
      publicKey: publicKey
    });
  } catch (tokenError) {
    console.warn('Share token generation failed:', tokenError);
  }

  uploadQueueService.updateTaskStatus(task.id, 'uploading');
  const base64File = await blobToBase64(new Blob([JSON.stringify(packageData)], { type: 'application/json' }));
  const fileResult = await uploadFile(base64File, `${fileName}.encrypted`, accessToken, task.accountId);
  const thoughtFileId = fileResult?.id;

  uploadQueueService.updateTaskProgress(task.id, 70);

  // Upload all thumbnails in parallel
  const thumbnailUploadPromises = encryptedThumbnails.map(async ({ index, encryptedThumbnail, blob }) => {
    const thumbnailPackage: EncryptedFilePackage = {
      encrypted: encryptedThumbnail.encrypted,
      iv: encryptedThumbnail.iv,
      salt: encryptedThumbnail.salt,
      metadata: {
        originalName: `thumb_${task.metadata?.name || 'thought-collection'}-page-${index + 1}.png`,
        originalSize: blob.size,
        originalMimeType: 'image/png',
      },
    };

    let thumbnailShareToken: any = undefined;
    try {
      const encryptionService = getEncryptionService();
      thumbnailShareToken = await encryptionService.generateShareToken(thumbnailPackage, {
        id: session.did,
        publicKey: publicKey
      });
    } catch (tokenError) {
      console.warn(`Thumbnail share token generation failed for page ${index + 1}:`, tokenError);
    }

    const thumbnailBase64 = await blobToBase64(new Blob([JSON.stringify(thumbnailPackage)], { type: 'application/json' }));
    const thumbnailFileName = `thumb_${task.metadata?.name || 'thought-collection'}-page-${index + 1}.png.encrypted`;
    const result = await uploadFile(thumbnailBase64, thumbnailFileName, accessToken, task.accountId);
    return { index, fileId: result?.id, shareToken: thumbnailShareToken };
  });

  const thumbnailResults = await Promise.all(thumbnailUploadPromises);
  uploadQueueService.updateTaskProgress(task.id, 85);

  // CRITICAL: Thought collections are ONE file entity
  // Create a SEPARATE collection thumbnail file (not one of the page thumbnails)
  // This collection thumbnail uses the first page thumbnail's image as its content
  const thumbnailFileIds = thumbnailResults.map(r => r.fileId).filter(Boolean) as string[];
  const thumbnailTokens: Record<string, string> = {};
  thumbnailResults.forEach(r => {
    if (r.fileId && r.shareToken) {
      thumbnailTokens[r.fileId] = JSON.stringify(r.shareToken);
    }
  });

  let collectionThumbnailFileId: string | undefined;
  let collectionThumbnailShareToken: any = undefined;

  // Create separate collection thumbnail file using first page thumbnail's image
  if (thumbnailResults.length > 0 && thumbnails[0]?.blob) {
    const firstPageBlob = thumbnails[0].blob;
    const collectionThumbnailArrayBuffer = await firstPageBlob.arrayBuffer();
    const collectionThumbnailData = new Uint8Array(collectionThumbnailArrayBuffer);
    const encryptedCollectionThumbnail = await workerManager.encrypt(collectionThumbnailData, session.did, publicKey);
    
    const collectionThumbnailPackage: EncryptedFilePackage = {
      encrypted: encryptedCollectionThumbnail.encrypted,
      iv: encryptedCollectionThumbnail.iv,
      salt: encryptedCollectionThumbnail.salt,
      metadata: {
        originalName: `thumb_${task.metadata?.name || 'thought-collection'}.png`,
        originalSize: firstPageBlob.size,
        originalMimeType: 'image/png',
      },
    };

    try {
      const encryptionService = getEncryptionService();
      collectionThumbnailShareToken = await encryptionService.generateShareToken(collectionThumbnailPackage, {
        id: session.did,
        publicKey: publicKey
      });
    } catch (tokenError) {
      console.warn('Collection thumbnail share token generation failed:', tokenError);
    }

    const collectionThumbnailBase64 = await blobToBase64(new Blob([JSON.stringify(collectionThumbnailPackage)], { type: 'application/json' }));
    const collectionThumbnailFileName = `thumb_${task.metadata?.name || 'thought-collection'}.png.encrypted`;
    const collectionThumbnailResult = await uploadFile(collectionThumbnailBase64, collectionThumbnailFileName, accessToken, task.accountId);
    collectionThumbnailFileId = collectionThumbnailResult?.id;
    
    uploadQueueService.updateTaskProgress(task.id, 90);
  }

  // Create ONE metadata entry for the collection thumbnail (not for page thumbnails)
  if (collectionThumbnailFileId) {
    const page = task.pages![0];
    const titleFromContent = (page.content || '').replace(/<[^>]*>/g, '').split(/\n|<br\s*\/?>/i)[0]?.trim().substring(0, 100) || 'Thought';
    
    await createMetadata(collectionThumbnailFileId, {
      name: `thumb_${task.metadata?.name || 'thought-collection'}.png`,
      title: task.metadata?.title || titleFromContent,
      description: task.metadata?.description || '',
      keywords: task.metadata?.keywords || task.metadata?.tags || [],
      tags: task.metadata?.tags || task.metadata?.keywords || [],
      fileType: 'thought-collection',
      isPublic: false,
      isThoughtThumbnail: true,
      isPartOfCollection: true,
      mainFileId: thoughtFileId, // Reference to main file for downloads
      publicToken: collectionThumbnailShareToken ? JSON.stringify(collectionThumbnailShareToken) : undefined,
      uploadDate: new Date().toISOString(),
      isNSFW: task.metadata?.isNSFW || false,
      // Include collection data - all page thumbnail IDs
      collection: {
        collectionFileIds: thumbnailFileIds
      },
      // Include collection textPost/thought data
      textPost: thoughtCollectionData.textPost,
      thought: thoughtCollectionData.textPost,
    }, accessToken);
    console.log(`[UploadProcessor] Created collection metadata for collection thumbnail ${collectionThumbnailFileId} with ${thumbnailResults.length} pages`);
  }
  
  // Page thumbnails are just visual proxies - NO metadata entries

  uploadQueueService.setTaskResult(task.id, {
    fileId: thoughtFileId,
    thumbnailFileIds,
    thumbnailTokens,
    collectionThumbnailFileId, // The separate collection thumbnail file
    collectionThumbnailShareToken,
  });
}

/**
 * Process PDF upload
 * Note: PDF processing requires pdfjs-dist and DOM, so it runs on main thread
 * but is queued so it doesn't block the UI
 */
async function processPDFUpload(
  task: UploadTask,
  session: any,
  publicKey: string,
  accessToken: string
): Promise<void> {
  if (!task.file) {
    throw new Error('No file provided');
  }

  const pdfFile = task.file;
  
  // Import PDF processing utilities dynamically
  const { processPDFPagesParallel } = await import('../components/FileStorageAggregator');
  
  // Process PDF pages with parallel thumbnail generation
  // This function will generate all thumbnails in parallel and upload them in parallel
  const pdfResult = await processPDFPagesParallel(
    pdfFile,
    task.accountId,
    session,
    publicKey,
    accessToken
  );

  uploadQueueService.updateTaskProgress(task.id, 70);

  // Encrypt and upload main PDF file
  const fileArrayBuffer = await pdfFile.arrayBuffer();
  const fileData = new Uint8Array(fileArrayBuffer);
  const encrypted = await workerManager.encrypt(fileData, session.did, publicKey);

  const packageData: EncryptedFilePackage = {
    encrypted: encrypted.encrypted,
    iv: encrypted.iv,
    salt: encrypted.salt,
    metadata: {
      originalName: pdfFile.name,
      originalSize: pdfFile.size,
      originalMimeType: 'application/pdf',
    },
  };

  let shareToken: any = undefined;
  try {
    const encryptionService = getEncryptionService();
    shareToken = await encryptionService.generateShareToken(packageData, {
      id: session.did,
      publicKey: publicKey
    });
  } catch (tokenError) {
    console.warn('Share token generation failed:', tokenError);
  }

  uploadQueueService.updateTaskStatus(task.id, 'uploading');
  uploadQueueService.updateTaskProgress(task.id, 80);

  const base64File = await blobToBase64(new Blob([JSON.stringify(packageData)], { type: 'application/json' }));
  const fileResult = await uploadFile(base64File, `${pdfFile.name}.encrypted`, accessToken, task.accountId);
  const fileId = fileResult?.id;

  uploadQueueService.updateTaskProgress(task.id, 90);

  // Create metadata for main file
  await createMetadata(fileId, {
    name: pdfFile.name,
    description: task.metadata?.description || '',
    keywords: task.metadata?.keywords || [],
    tags: task.metadata?.tags || [],
    fileType: 'document',
    isPublic: false,
    publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
    uploadDate: new Date().toISOString(),
    isNSFW: task.metadata?.isNSFW || false,
  }, accessToken);

  // Create collection from thumbnails if we have any
  if (pdfResult.thumbnailFileIds.length > 0) {
    const { createCollection } = await import('./collectionService');
    await createCollection(
      {
        collectionFileIds: pdfResult.thumbnailFileIds,
        title: pdfFile.name.replace(/\.pdf$/i, ''),
        thumbnailTokens: pdfResult.thumbnailTokens
      },
      task.accountId,
      {
        isPublic: task.metadata?.isPublic || false,
        isNSFW: task.metadata?.isNSFW || false
      }
    );
  }

  uploadQueueService.setTaskResult(task.id, {
    fileId,
    thumbnailFileIds: pdfResult.thumbnailFileIds,
    thumbnailTokens: pdfResult.thumbnailTokens,
  });
}

/**
 * Helper: Generate thumbnail for file
 */
async function generateThumbnailForFile(file: File, isImage: boolean): Promise<Blob | null> {
  if (isImage) {
    const arrayBuffer = await file.arrayBuffer();
    return workerManager.createImageThumbnail(arrayBuffer, 800, 800);
  }
  // Video thumbnails will be handled on main thread for now
  return null;
}

/**
 * Helper: Upload file to API
 */
async function uploadFile(base64Data: string, fileName: string, accessToken: string, accountId: string): Promise<{ id: string }> {
  const response = await fetch(`${apiEndpoint}/api/drive/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      fileData: base64Data,
      fileName,
      mimeType: 'application/json',
      accountId
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Upload failed: ${errorText}`);
  }

  const result = await response.json();
  const uploadedFile = result.file;

  if (!uploadedFile || !uploadedFile.id) {
    throw new Error('Upload succeeded but no file ID returned');
  }

  return { id: uploadedFile.id };
}

/**
 * Helper: Create metadata entry
 */
async function createMetadata(fileId: string, metadata: any, accessToken: string): Promise<void> {
  await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(metadata)
  });
}

/**
 * Helper: Convert blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

// Listen for task ready events from queue
uploadQueueService.on('taskReady', (task: UploadTask) => {
  processUploadTask(task).catch(error => {
    console.error('[UploadProcessor] Error processing task:', error);
  });
});

