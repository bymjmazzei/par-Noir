/**
 * Owner/public file index helpers.
 *
 * Root and content-class indexes for a pN identity, backed by IndexStorageService
 * (Sheets for Google Drive, portable tables for social-cloud providers).
 */

import { determineContentClass, getFileTypeFromMime } from '../../utils/fileTypeUtils';
import { hashIdentifier, safeLogger } from '../../../utils/logger';

export type DriveToken = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
};

export type ContentClassFolder = 'media' | 'thoughts' | 'collections';

/**
 * Get owner file index (contains all files owned by the user)
 * Now uses Sheets instead of JSON
 */
export async function getOwnerFileIndex(
  token: DriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId?: string
): Promise<any | null> {
  try {
    const { IndexStorageService } = await import('./indexStorageService');
    return IndexStorageService.getOwnerFileIndex(pnIdentifier, token, metadataFolderId, accountId);
  } catch (error) {
    console.error('[getOwnerFileIndex] Error getting owner index:', error);
    return {
      identifier: pnIdentifier,
      files: [],
      updatedAt: new Date().toISOString()
    };
  }
}

/**
 * Sheets index updates are non-blocking for the browse feed (Postgres is authoritative).
 * Run after the HTTP response so publish feels fast.
 */
export function scheduleDriveIndexUpdates(
  token: DriveToken,
  pnIdentifier: string,
  metadataFolderId: string,
  pnFolderId: string,
  fileMetadata: any,
  accountId: string | undefined,
  options: { isNewFile: boolean; isPublic: boolean }
): void {
  const indexOpts = { isNewFile: options.isNewFile, skipPublicPermission: true };
  void Promise.all([
    updateOwnerFileIndex(token, pnIdentifier, metadataFolderId, fileMetadata, accountId, indexOpts),
    options.isPublic
      ? updatePublicFileIndex(
          token,
          pnIdentifier,
          metadataFolderId,
          pnFolderId,
          fileMetadata,
          accountId,
          indexOpts
        )
      : Promise.resolve(),
  ]).catch((err) => {
    safeLogger.warn('[MetadataIndex] Background Sheets index update failed', {
      fileId: fileMetadata?.fileId,
      error: err as Error,
    });
  });
}

/**
 * Update owner file index (includes ALL files, regardless of visibility)
 * Now uses Sheets instead of JSON
 */
export async function updateOwnerFileIndex(
  token: DriveToken,
  pnIdentifier: string,
  metadataFolderId: string,
  fileMetadata: any,
  accountId?: string,
  options?: { isNewFile?: boolean; skipPublicPermission?: boolean }
): Promise<void> {
  const { IndexStorageService } = await import('./indexStorageService');
  const { isPortableStorageProvider } = await import('./storageProviderUtils');
  const accessToken = token.access_token;

  // Determine contentClass from fileMetadata before creating index entry
  const { determineContentClass } = await import('../../utils/fileTypeUtils');
  const metadataAny = fileMetadata as any;
  const contentClass = determineContentClass({
    fileType: metadataAny.fileType,
    collection: metadataAny.collection,
    textPost: metadataAny.textPost,
    thought: metadataAny.thought,
    isThoughtThumbnail: metadataAny.isThoughtThumbnail,
    isPartOfCollection: metadataAny.isPartOfCollection
  });

  // Convert companion metadata to index entry format
  const indexEntry: any = {
    fileId: fileMetadata.fileId,
    backend: fileMetadata.backend,
    backendFileId: fileMetadata.backendFileId ?? fileMetadata.googleDriveFileId,
    backendAccountId: fileMetadata.backendAccountId,
    googleDriveFileId: fileMetadata.googleDriveFileId ?? fileMetadata.backendFileId,
    fileName: fileMetadata.fileName,
    originalName: fileMetadata.originalName,
    mimeType: fileMetadata.mimeType,
    size: fileMetadata.size,
    visibility: fileMetadata.visibility,
    uploadedAt: fileMetadata.uploadedAt,
    owner: fileMetadata.owner,
    tags: fileMetadata.tags || [],
    description: fileMetadata.description,
    publicToken: fileMetadata.publicToken,
    engagement: fileMetadata.engagement,
    inReplyTo: fileMetadata.inReplyTo,
    repostOf: fileMetadata.repostOf,
    isPartOf: fileMetadata.isPartOf,
    indexingPermissions: fileMetadata.indexingPermissions,
    contentClass: contentClass,
    isThoughtThumbnail: metadataAny.isThoughtThumbnail,
    mainFileId: metadataAny.mainFileId,
    thumbnailFileId: metadataAny.thumbnailFileId,
    collectionFileIds: metadataAny.collectionFileIds ?? metadataAny.collection?.collectionFileIds
  };

  const existingEntry = options?.isNewFile
    ? null
    : await IndexStorageService.getFileById(
        pnIdentifier,
        'owner',
        fileMetadata.fileId,
        token,
        metadataFolderId,
        accountId
      );

  if (existingEntry) {
    if (!indexEntry.publicToken && existingEntry.publicToken) {
      indexEntry.publicToken = existingEntry.publicToken;
    }

    if (existingEntry.engagement) {
      indexEntry.engagement = {
        views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
        likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
        comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
        shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
        lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt
      };
    }

    await IndexStorageService.updateFile(
      pnIdentifier,
      'owner',
      fileMetadata.fileId,
      indexEntry,
      token,
      metadataFolderId,
      accountId
    );
  } else {
    await IndexStorageService.addFile(
      pnIdentifier,
      'owner',
      indexEntry,
      token,
      metadataFolderId,
      accountId
    );
  }

  const contentTypeFolderName = indexEntry.contentClass === 'thought' ? 'thoughts' : indexEntry.contentClass === 'collection' ? 'collections' : indexEntry.contentClass;
  const isPortable = await isPortableStorageProvider(pnIdentifier);

  if (isPortable && contentTypeFolderName) {
    const ccFolder = contentTypeFolderName as ContentClassFolder;
    const existingCcEntry = options?.isNewFile
      ? null
      : await IndexStorageService.getFileById(
          pnIdentifier,
          'owner',
          fileMetadata.fileId,
          token,
          metadataFolderId,
          accountId,
          ccFolder
        );
    if (existingCcEntry) {
      await IndexStorageService.updateFile(
        pnIdentifier,
        'owner',
        fileMetadata.fileId,
        indexEntry,
        token,
        metadataFolderId,
        accountId,
        ccFolder
      );
    } else {
      await IndexStorageService.addFile(
        pnIdentifier,
        'owner',
        indexEntry,
        token,
        metadataFolderId,
        accountId,
        ccFolder
      );
    }
    return;
  }

  let contentTypeFolderId: string | null = null;
  const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const contentTypeFolderResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (contentTypeFolderResponse.ok) {
    const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
    if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
      contentTypeFolderId = contentTypeFolderData.files[0].id;
    } else {
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: contentTypeFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [metadataFolderId] })
      });
      if (createRes.ok) {
        const createData = await createRes.json() as { id: string };
        contentTypeFolderId = createData.id;
      }
    }
  }

  if (contentTypeFolderId) {
    const ccFolder = contentTypeFolderName as ContentClassFolder;
    const existingCcEntry = options?.isNewFile
      ? null
      : await IndexStorageService.getFileById(
          pnIdentifier,
          'owner',
          fileMetadata.fileId,
          token,
          contentTypeFolderId,
          accountId,
          ccFolder
        );
    if (existingCcEntry) {
      await IndexStorageService.updateFile(
        pnIdentifier,
        'owner',
        fileMetadata.fileId,
        indexEntry,
        token,
        contentTypeFolderId,
        accountId,
        ccFolder
      );
    } else {
      await IndexStorageService.addFile(
        pnIdentifier,
        'owner',
        indexEntry,
        token,
        contentTypeFolderId,
        accountId,
        ccFolder
      );
    }
  }
}

/**
 * Get public file index
 * Now uses Sheets instead of JSON
 */
export async function getPublicFileIndex(
  token: DriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId?: string
): Promise<any | null> {
  try {
    const { IndexStorageService } = await import('./indexStorageService');
    return IndexStorageService.getPublicFileIndex(pnIdentifier, token, metadataFolderId, accountId);
  } catch (error) {
    console.error('[getPublicFileIndex] Error getting public index:', error);
    return {
      identifier: pnIdentifier,
      files: [],
      updatedAt: new Date().toISOString()
    };
  }
}

/**
 * Convert companion metadata to public metadata (simplified semantic web format)
 */
export function companionToPublicMetadata(companion: any, creatorDid?: string): any {
  const fileType = getFileTypeFromMime(companion.mimeType);
  const schemaType =
    fileType === 'image' ? 'ImageObject' :
    fileType === 'video' ? 'VideoObject' :
    fileType === 'audio' ? 'AudioObject' :
    'CreativeWork';

  const resourceUri = `https://parnoir.com/resource/${companion.fileId}`;
  const didUri = creatorDid || companion.owner.did || `did:key:${companion.owner.identifier}`;

  const SEMANTIC_CONTEXTS = [
    'https://schema.org/',
    'http://purl.org/dc/terms/',
    'http://www.w3.org/ns/prov#',
    'http://xmlns.com/foaf/0.1/',
    'https://www.w3.org/ns/activitystreams#',
    'https://parnoir.com/ns/v1#'
  ];

  return {
    '@context': SEMANTIC_CONTEXTS,
    '@type': schemaType,
    '@id': resourceUri,
    fileId: companion.fileId,
    backend: 'google_drive',
    backendFileId: companion.googleDriveFileId,
    name: companion.originalName || companion.fileName,
    description: companion.description || '',
    keywords: companion.tags || [],
    uploadDate: companion.uploadedAt,
    datePublished: companion.uploadedAt,
    fileType: fileType,
    creator: {
      '@type': 'Person',
      '@id': didUri,
      identifier: {
        '@type': 'PropertyValue',
        name: 'DID',
        value: didUri
      }
    },
    author: {
      did: didUri
    },
    engagement: {
      views: companion.engagement?.views || 0,
      likes: companion.engagement?.likes || 0,
      comments: companion.engagement?.comments || 0,
      shares: companion.engagement?.shares || 0,
      lastUpdated: companion.engagement?.lastUpdated || companion.uploadedAt,
      engagementHistory: companion.engagement?.engagementHistory || []
    },
    publicToken: companion.publicToken,
    isPublic: companion.visibility === 'public',
    indexingPermissions: companion.indexingPermissions
  };
}

/**
 * Remove file from owner index
 */
export async function removeFromOwnerIndex(
  token: DriveToken,
  pnIdentifier: string,
  metadataFolderId: string,
  fileId: string,
  accountId?: string
): Promise<void> {
  const accessToken = token.access_token; // Keep for backward compatibility in fetch calls
  // Get existing owner index
  const index = await getOwnerFileIndex(token, metadataFolderId, pnIdentifier, accountId);

  if (!index || !index.files) {
    // No index or no files, nothing to remove
    return;
  }

  // Find the file to determine its contentClass
  const fileEntry = index.files.find((f: any) => f.googleDriveFileId === fileId || f.fileId === fileId);
  let contentClass: string | null = null;
  if (fileEntry) {
    // Try to determine contentClass from file entry
    const metadataAny = fileEntry as any;
    if (metadataAny.collection?.collectionFileIds?.length) {
      contentClass = 'collection';
    } else if (metadataAny.isThoughtThumbnail || metadataAny.thought || metadataAny.textPost) {
      contentClass = 'thought';
    } else {
      contentClass = 'media';
    }
  }

  // Remove file from root index
  const initialLength = index.files.length;
  index.files = index.files.filter((f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId);

  if (index.files.length === initialLength) {
    // File wasn't in the index, nothing to do
    return;
  }

  index.updatedAt = new Date().toISOString();

  // Save updated root index (Sheets)
  const { IndexSheetsService } = await import('../indexSheetsService');
  const ownerSheetId = await IndexSheetsService.getIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId);
  await IndexSheetsService.setAllFiles(token, ownerSheetId, index.files, pnIdentifier, accountId, index.updatedAt, 'owner');

  // Also remove from content class-specific index if we know the contentClass (thought→thoughts, collection→collections)
  if (contentClass) {
    const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
    const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const contentTypeFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (contentTypeFolderResponse.ok) {
      const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
      if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
        const contentTypeFolderId = contentTypeFolderData.files[0].id;

        // Get content class-specific owner index
        const contentClassIndex = await getContentClassOwnerIndex(token, contentTypeFolderId, pnIdentifier, contentTypeFolderName as ContentClassFolder, accountId);
        if (contentClassIndex && contentClassIndex.files) {
          const contentClassInitialLength = contentClassIndex.files.length;
          contentClassIndex.files = contentClassIndex.files.filter(
            (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
          );

          if (contentClassIndex.files.length !== contentClassInitialLength) {
            contentClassIndex.updatedAt = new Date().toISOString();
            const { IndexSheetsService } = await import('../indexSheetsService');
            const ownerSheetId = await IndexSheetsService.getIndexSheet(token, contentTypeFolderId, 'owner', pnIdentifier, accountId, contentTypeFolderName as ContentClassFolder);
            await IndexSheetsService.setAllFiles(token, ownerSheetId, contentClassIndex.files, pnIdentifier, accountId, contentClassIndex.updatedAt, 'owner');
          }
        }
      }
    }
  }
}

/**
 * Remove file from public index
 */
export async function removeFromPublicIndex(
  token: DriveToken,
  pnIdentifier: string,
  metadataFolderId: string,
  fileId: string,
  accountId?: string
): Promise<void> {
  try {
  const accessToken = token.access_token; // Keep for backward compatibility in fetch calls
  // Get existing public index to find the file and determine contentClass
  const index = await getPublicFileIndex(token, metadataFolderId, pnIdentifier, accountId);

  if (!index || !index.files) {
    // No index or no files, nothing to remove
    return;
  }

  // Find the file to determine its contentClass
  const fileEntry = index.files.find((f: any) => f.googleDriveFileId === fileId || f.fileId === fileId);
  let contentClass: string | null = null;
  if (fileEntry) {
    // Try to determine contentClass from file entry
    const metadataAny = fileEntry as any;
    if (metadataAny.collection?.collectionFileIds?.length) {
      contentClass = 'collection';
    } else if (metadataAny.isThoughtThumbnail || metadataAny.thought || metadataAny.textPost) {
      contentClass = 'thought';
    } else {
      contentClass = 'media';
    }
  }

  // Remove file from root index
  const initialLength = index.files.length;
  index.files = index.files.filter((f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId);

  if (index.files.length === initialLength) {
    // File wasn't in the index, nothing to do
    return;
  }

  index.updatedAt = new Date().toISOString();

  const { IndexStorageService } = await import('./indexStorageService');
  const { isPortableStorageProvider } = await import('./storageProviderUtils');
  await IndexStorageService.setAllFiles(
    pnIdentifier,
    'public',
    index.files,
    token,
    metadataFolderId,
    accountId,
    index.updatedAt
  );
  const isPortableRemove = await isPortableStorageProvider(pnIdentifier);
  if (!isPortableRemove) {
    const { IndexSheetsService } = await import('../indexSheetsService');
    const publicSheetId = await IndexSheetsService.getIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId);
    await setPublicPermissionOnDriveFile(accessToken, publicSheetId);
  }

  if (contentClass) {
    const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
    if (isPortableRemove) {
      const contentClassIndex = await IndexStorageService.getContentClassPublicIndex(
        pnIdentifier,
        contentTypeFolderName as ContentClassFolder,
        token,
        metadataFolderId,
        accountId
      );
      if (contentClassIndex?.files) {
        const before = contentClassIndex.files.length;
        contentClassIndex.files = contentClassIndex.files.filter(
          (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
        );
        if (contentClassIndex.files.length !== before) {
          contentClassIndex.updatedAt = new Date().toISOString();
          await IndexStorageService.setAllFiles(
            pnIdentifier,
            'public',
            contentClassIndex.files,
            token,
            metadataFolderId,
            accountId,
            contentClassIndex.updatedAt,
            contentTypeFolderName as ContentClassFolder
          );
        }
      }
      return;
    }
    const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const contentTypeFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (contentTypeFolderResponse.ok) {
      const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
      if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
        const contentTypeFolderId = contentTypeFolderData.files[0].id;

        const contentClassIndex = await getContentClassPublicIndex(token, contentTypeFolderId, pnIdentifier, contentTypeFolderName as ContentClassFolder, accountId);
        if (contentClassIndex && contentClassIndex.files) {
          const contentClassInitialLength = contentClassIndex.files.length;
          contentClassIndex.files = contentClassIndex.files.filter(
            (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
          );

          if (contentClassIndex.files.length !== contentClassInitialLength) {
            contentClassIndex.updatedAt = new Date().toISOString();
            await IndexStorageService.setAllFiles(
              pnIdentifier,
              'public',
              contentClassIndex.files,
              token,
              metadataFolderId,
              accountId,
              contentClassIndex.updatedAt,
              contentTypeFolderName as ContentClassFolder
            );
            if (!isPortableRemove) {
              const { IndexSheetsService } = await import('../indexSheetsService');
              const publicSheetId = await IndexSheetsService.getIndexSheet(token, contentTypeFolderId, 'public', pnIdentifier, accountId, contentTypeFolderName as ContentClassFolder);
              await setPublicPermissionOnDriveFile(accessToken, publicSheetId);
            }
          }
        }
      }
    }
  }
  } catch (error) {
    const { isIndexSheetNotFoundError } = await import('../indexSheetsService');
    if (isIndexSheetNotFoundError(error)) {
      safeLogger.warn('[removeFromPublicIndex] Public index sheet missing; skipping removal', {
        fileIdHash: hashIdentifier(fileId),
      });
      return;
    }
    throw error;
  }
}

/**
 * Update public file index
 */
export async function updatePublicFileIndex(
  token: DriveToken,
  pnIdentifier: string,
  metadataFolderId: string,
  pnFolderId: string,
  fileMetadata: any,
  accountId?: string,
  options?: { isNewFile?: boolean; skipPublicPermission?: boolean }
): Promise<void> {
  const accessToken = token.access_token;
  const { IndexStorageService } = await import('./indexStorageService');
  const { isPortableStorageProvider } = await import('./storageProviderUtils');
  const isPortablePublic = await isPortableStorageProvider(pnIdentifier);

  const existingRootEntry = options?.isNewFile
    ? null
    : await IndexStorageService.getFileById(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        token,
        metadataFolderId,
        accountId
      );

  const metadataAny = fileMetadata as any;
  const contentClass = determineContentClass({
    fileType: metadataAny.fileType,
    collection: metadataAny.collection,
    textPost: metadataAny.textPost,
    thought: metadataAny.thought,
    isThoughtThumbnail: metadataAny.isThoughtThumbnail,
    isPartOfCollection: metadataAny.isPartOfCollection
  });
  const contentTypeFolderName =
    contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;

  if (fileMetadata.visibility === 'public') {
    const indexEntry: any = {
      fileId: fileMetadata.fileId,
      googleDriveFileId: fileMetadata.googleDriveFileId,
      fileName: fileMetadata.fileName,
      originalName: fileMetadata.originalName,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size,
      visibility: fileMetadata.visibility,
      uploadedAt: fileMetadata.uploadedAt,
      owner: fileMetadata.owner,
      tags: fileMetadata.tags || [],
      description: fileMetadata.description,
      indexingPermissions: fileMetadata.indexingPermissions,
      contentClass,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      mainFileId: metadataAny.mainFileId,
      thumbnailFileId: metadataAny.thumbnailFileId,
      inReplyTo: fileMetadata.inReplyTo,
      repostOf: fileMetadata.repostOf,
      engagement: fileMetadata.engagement
    };

    const isNewPublicFile = !existingRootEntry;

    if (existingRootEntry) {
      const existingAny = existingRootEntry as any;
      if (existingAny.engagement) {
        indexEntry.engagement = {
          views: indexEntry.engagement?.views ?? existingAny.engagement.views ?? 0,
          likes: indexEntry.engagement?.likes ?? existingAny.engagement.likes ?? 0,
          comments: indexEntry.engagement?.comments ?? existingAny.engagement.comments ?? 0,
          shares: indexEntry.engagement?.shares ?? existingAny.engagement.shares ?? 0,
          lastUpdated:
            indexEntry.engagement?.lastUpdated ||
            existingAny.engagement.lastUpdated ||
            fileMetadata.uploadedAt
        };
      }
      await IndexStorageService.updateFile(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        indexEntry,
        token,
        metadataFolderId,
        accountId
      );
    } else {
      await IndexStorageService.addFile(
        pnIdentifier,
        'public',
        indexEntry,
        token,
        metadataFolderId,
        accountId
      );
    }

    if (isNewPublicFile) {
      try {
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        if (serviceAccountEmail) {
          const permissionsResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions?fields=permissions(emailAddress)`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            }
          );

          let hasPermission = false;
          if (permissionsResponse.ok) {
            const permissionsData = (await permissionsResponse.json()) as {
              permissions?: Array<{ emailAddress?: string }>;
            };
            hasPermission =
              permissionsData.permissions?.some(
                (p: any) => p.emailAddress === serviceAccountEmail
              ) ?? false;
          }

          if (!hasPermission) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'user',
                emailAddress: serviceAccountEmail
              })
            });
          }
        }
      } catch (shareError: any) {
        console.warn(
          `[Upload] Failed to share folder with service account:`,
          shareError?.message || shareError
        );
      }
    }
  } else if (existingRootEntry) {
    await IndexStorageService.removeFile(
      pnIdentifier,
      'public',
      fileMetadata.fileId,
      token,
      metadataFolderId,
      accountId
    );
  }

  if (!isPortablePublic && !options?.skipPublicPermission) {
    const { IndexSheetsService } = await import('../indexSheetsService');
    const publicSheetId = await IndexSheetsService.getIndexSheet(
      token,
      metadataFolderId,
      'public',
      pnIdentifier,
      accountId
    );
    await setPublicPermissionOnDriveFile(accessToken, publicSheetId);
  }

  let contentTypeFolderId: string | null = null;

  const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const contentTypeFolderResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }
  );

  if (contentTypeFolderResponse.ok) {
    const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
    if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
      contentTypeFolderId = contentTypeFolderData.files[0].id;
    } else {
      // Folder missing (e.g. connected before content-class folders existed): create it
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contentTypeFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [metadataFolderId]
        })
      });
      if (createRes.ok) {
        const createData = (await createRes.json()) as { id: string };
        contentTypeFolderId = createData.id;
      }
    }
  }

  if (!contentTypeFolderName) {
    return;
  }

  const ccFolder = contentTypeFolderName as ContentClassFolder;
  const contentClassFolderId = isPortablePublic ? metadataFolderId : contentTypeFolderId;
  if (!contentClassFolderId) {
    return;
  }

  const existingContentClassEntry = options?.isNewFile
    ? null
    : await IndexStorageService.getFileById(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        token,
        contentClassFolderId,
        accountId,
        ccFolder
      );

  if (fileMetadata.visibility === 'public') {
    const contentClassIndexEntry: any = isPortablePublic
      ? {
          ...companionToPublicMetadata(fileMetadata, fileMetadata.owner.did),
          fileId: fileMetadata.fileId,
          googleDriveFileId: fileMetadata.googleDriveFileId,
          fileName: fileMetadata.fileName,
          originalName: fileMetadata.originalName,
          mimeType: fileMetadata.mimeType,
          size: fileMetadata.size,
          visibility: fileMetadata.visibility,
          uploadedAt: fileMetadata.uploadedAt,
          owner: fileMetadata.owner,
          tags: fileMetadata.tags || [],
          description: fileMetadata.description,
          thumbnail: fileMetadata.thumbnail,
          indexingPermissions: fileMetadata.indexingPermissions
        }
      : {
          fileId: fileMetadata.fileId,
          googleDriveFileId: fileMetadata.googleDriveFileId,
          fileName: fileMetadata.fileName,
          originalName: fileMetadata.originalName,
          mimeType: fileMetadata.mimeType,
          size: fileMetadata.size,
          visibility: fileMetadata.visibility,
          uploadedAt: fileMetadata.uploadedAt,
          owner: fileMetadata.owner,
          tags: fileMetadata.tags || [],
          description: fileMetadata.description,
          indexingPermissions: fileMetadata.indexingPermissions,
          contentClass,
          isThoughtThumbnail: metadataAny.isThoughtThumbnail,
          mainFileId: metadataAny.mainFileId,
          thumbnailFileId: metadataAny.thumbnailFileId,
          engagement: fileMetadata.engagement
        };

    if (existingContentClassEntry) {
      const existingAny = existingContentClassEntry as any;
      if (existingAny.engagement) {
        contentClassIndexEntry.engagement = {
          views: contentClassIndexEntry.engagement?.views ?? existingAny.engagement.views ?? 0,
          likes: contentClassIndexEntry.engagement?.likes ?? existingAny.engagement.likes ?? 0,
          comments: contentClassIndexEntry.engagement?.comments ?? existingAny.engagement.comments ?? 0,
          shares: contentClassIndexEntry.engagement?.shares ?? existingAny.engagement.shares ?? 0,
          lastUpdated:
            contentClassIndexEntry.engagement?.lastUpdated ||
            existingAny.engagement.lastUpdated ||
            fileMetadata.uploadedAt
        };
      }
      await IndexStorageService.updateFile(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        contentClassIndexEntry,
        token,
        contentClassFolderId,
        accountId,
        ccFolder
      );
    } else {
      await IndexStorageService.addFile(
        pnIdentifier,
        'public',
        contentClassIndexEntry,
        token,
        contentClassFolderId,
        accountId,
        ccFolder
      );
    }
  } else if (existingContentClassEntry) {
    await IndexStorageService.removeFile(
      pnIdentifier,
      'public',
      fileMetadata.fileId,
      token,
      contentClassFolderId,
      accountId,
      ccFolder
    );
  }

  if (!isPortablePublic && contentTypeFolderId && !options?.skipPublicPermission) {
    const { IndexSheetsService } = await import('../indexSheetsService');
    const contentClassPublicSheetId = await IndexSheetsService.getIndexSheet(
      token,
      contentTypeFolderId,
      'public',
      pnIdentifier,
      accountId,
      ccFolder
    );
    await setPublicPermissionOnDriveFile(accessToken, contentClassPublicSheetId);
  }
}

/**
 * Set public (anyone reader) permission on a Drive file (e.g. public index Sheet).
 */
export async function setPublicPermissionOnDriveFile(accessToken: string, fileId: string): Promise<void> {
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
  } catch (e: any) {
    console.warn('[setPublicPermissionOnDriveFile]', e?.message || e);
  }
}

/**
 * Get content class-specific public index (Sheets)
 */
export async function getContentClassPublicIndex(
  token: DriveToken,
  folderId: string,
  pnIdentifier: string,
  contentClass: ContentClassFolder,
  accountId?: string
): Promise<any | null> {
  try {
    const { IndexStorageService } = await import('./indexStorageService');
    return IndexStorageService.getContentClassPublicIndex(
      pnIdentifier,
      contentClass,
      token,
      folderId,
      accountId
    );
  } catch (e) {
    console.warn('[getContentClassPublicIndex]', e);
    return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
  }
}

/**
 * Get content class-specific owner index (Sheets)
 */
export async function getContentClassOwnerIndex(
  token: DriveToken,
  folderId: string,
  pnIdentifier: string,
  contentClass: ContentClassFolder,
  accountId?: string
): Promise<any | null> {
  try {
    const { IndexStorageService } = await import('./indexStorageService');
    return IndexStorageService.getContentClassOwnerIndex(
      pnIdentifier,
      contentClass,
      token,
      folderId,
      accountId
    );
  } catch (e) {
    console.warn('[getContentClassOwnerIndex]', e);
    return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
  }
}
