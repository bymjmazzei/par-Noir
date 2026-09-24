import { PNOAuthService } from './pnOAuthService';
import { EncryptionManager } from '@par-noir/identity-crypto/browser';
import { getEncryptionService } from '../services/encryptionService';
import { ownerFetch } from './ownerApiFetch';
import { publishPublicShare } from './publicSharePublish';
import type { PublicShareGenerationResult } from '@par-noir/aggregator-domain';

interface CollectionData {
  collectionFileIds: string[];
  title?: string;
  description?: string;
  thumbnailTokens?: Record<string, string>; // Map of fileId -> publicToken JSON string
}

export async function createCollection(
  collectionData: CollectionData,
  accountId: string,
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string[];
    tags?: string[];
    isPublic?: boolean;
    isNSFW?: boolean;
    isNoteCollection?: boolean; // Flag to distinguish note collections from regular collections
    expiresAt?: string | null;
    contentClass?: 'collection';
    headProof?: unknown;
    penDocId?: string;
    templateId?: string;
    penClassId?: string;
    penCategoryId?: string;
    penTemplateKind?: 'template' | 'remix';
    basedOnTemplateId?: string;
    penIrRef?: unknown;
    licensing?: unknown;
  }
): Promise<{ fileId: string; success: boolean; error?: string }> {
  try {
    const accessToken = await PNOAuthService.getValidAccessToken();
    if (!accessToken) {
      throw new Error('No valid access token');
    }

    const session = PNOAuthService.loadSession();
    if (!session?.did) {
      throw new Error('No DID in session for encryption');
    }

    let publicKey = session?.publicKey;
    if (!publicKey && session.did.startsWith('did:key:')) {
      publicKey = session.did.substring(8);
    }

    if (!publicKey) {
      throw new Error('No publicKey available for encryption');
    }

    // Create collection data file (similar to note files)
    const collectionFileData = {
      collection: collectionData,
      version: '1.0',
      createdAt: new Date().toISOString()
    };
    
    const fileName = `collection-${Date.now()}.collection`;
    const fileContent = JSON.stringify(collectionFileData);
    const file = new File([fileContent], fileName, { type: 'application/json' });

    // Encrypt file
    const fileArrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileArrayBuffer);
    const encryptionManager = new EncryptionManager();
    const encrypted = await encryptionManager.encrypt(
      fileData,
      session.did,
      publicKey
    );

    // Create encrypted file package
    const packageData = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      salt: encrypted.salt,
      metadata: {
        originalName: fileName,
        originalSize: file.size,
        originalMimeType: file.type,
      },
    };

    const isPublic = metadata?.isPublic === true;
    let generation: PublicShareGenerationResult | undefined = undefined;
    try {
      const encryptionService = getEncryptionService();
      generation = await encryptionService.generateShareToken(
        packageData,
        {
          id: session.did,
          publicKey: publicKey
        }
      );
    } catch (tokenError: any) {
      if (isPublic) {
        throw new Error(
          `Failed to publish share material: ${tokenError?.message || tokenError}`
        );
      }
      console.error('Share token generation failed:', tokenError);
    }

    // Upload encrypted file (same format as regular file uploads)
    const encryptedBlob = new Blob([JSON.stringify(packageData)], { type: 'application/json' });
    
    // Convert encrypted blob to base64
    const base64File = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read encrypted file'));
      reader.readAsDataURL(encryptedBlob);
    });

    const encryptedFileName = `${fileName}.encrypted`;
    const uploadResponse = await ownerFetch(
      'POST',
      '/api/drive/files',
      {
        fileData: base64File,
        fileName: encryptedFileName,
        mimeType: 'application/json', // Encrypted files are stored as JSON
        accountId: accountId
      },
      { authToken: accessToken }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      throw new Error(`Failed to upload collection file: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.file?.id;

    if (!fileId) {
      throw new Error('Upload succeeded but no file ID returned');
    }

    let publicToken: string | undefined;
    let publicContentRef: { backend: string; objectId: string; publicUrl: string } | undefined;
    let feedPreviewFields: Record<string, unknown> = {};
    if (isPublic) {
      if (!generation) {
        throw new Error('Cannot publish collection publicly without share generation');
      }
      try {
        const published = await publishPublicShare({
          generation,
          accessToken,
          accountId,
          envelopeFileName: `public-envelope-${fileId}.json`,
        });
        publicToken = published.publicToken;
        publicContentRef = published.publicContentRef;
        if (!publicToken || !publicContentRef) {
          throw new Error('Cannot publish collection publicly without publicToken and publicContentRef');
        }
      } catch (shareErr: any) {
        throw new Error(
          `Failed to publish share material: ${shareErr?.message || shareErr}`
        );
      }

      try {
        const { publishFeedPreviewsForPublicVisual } = await import('./feedPreviewMakePublic');
        feedPreviewFields = await publishFeedPreviewsForPublicVisual({
          encryptedPackage: packageData as {
            encrypted: string;
            iv: string;
            salt: string;
            metadata: {
              originalName: string;
              originalSize: number;
              originalMimeType: string;
            };
          },
          fileId,
          accessToken,
          accountId,
          session: { did: session.did, publicKey },
          fileType: metadata?.isNoteCollection ? 'note-collection' : 'collection',
          name: metadata?.title || collectionData.title || 'Collection',
          collectionFileIds: collectionData.collectionFileIds,
          planId: 'floor',
        });
      } catch (previewErr: any) {
        throw new Error(
          `Failed to publish feed preview: ${previewErr?.message || previewErr}`
        );
      }
    }

    // Create metadata entry
    const penProvenance: Record<string, unknown> = {};
    if (metadata?.headProof != null) penProvenance.headProof = metadata.headProof;
    if (metadata?.penDocId) penProvenance.penDocId = metadata.penDocId;
    if (metadata?.templateId) penProvenance.templateId = metadata.templateId;
    if (metadata?.penClassId) penProvenance.penClassId = metadata.penClassId;
    if (metadata?.penCategoryId) penProvenance.penCategoryId = metadata.penCategoryId;
    if (metadata?.penTemplateKind) penProvenance.penTemplateKind = metadata.penTemplateKind;
    if (metadata?.basedOnTemplateId) {
      penProvenance.basedOnTemplateId = metadata.basedOnTemplateId;
    }
    if (metadata?.penIrRef) penProvenance.penIrRef = metadata.penIrRef;
    if (metadata?.licensing) penProvenance.licensing = metadata.licensing;

    const metadataResponse = await ownerFetch('PUT', `/api/aggregator/metadata-index/${fileId}`, {
      name: metadata?.title || collectionData.title || 'Collection',
      description: metadata?.description || collectionData.description || '',
      keywords: metadata?.keywords || [],
      tags: metadata?.tags || [],
      fileType: 'collection',
      contentClass: 'collection',
      isPublic,
      publicToken,
      publicContentRef,
      uploadDate: new Date().toISOString(),
      collection: {
        collectionFileIds: collectionData.collectionFileIds
      },
      isNSFW: metadata?.isNSFW || false,
      isNoteCollection: metadata?.isNoteCollection || false, // Mark if this is a note collection
      ...(Object.prototype.hasOwnProperty.call(metadata || {}, 'expiresAt')
        ? { expiresAt: metadata?.expiresAt ?? null, persistOnDiscover: false }
        : {}),
      ...feedPreviewFields,
      ...penProvenance,
    });

    if (!metadataResponse.ok) {
      console.warn('Failed to create metadata entry');
    }

    return { fileId, success: true };
  } catch (error: any) {
    console.error('Collection creation error:', error);
    return { fileId: '', success: false, error: error.message || 'Unknown error' };
  }
}

