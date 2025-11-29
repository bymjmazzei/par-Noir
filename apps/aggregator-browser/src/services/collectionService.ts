import { PNOAuthService } from './pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../utils/encryptionService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface CollectionData {
  collectionFileIds: string[];
  title?: string;
  description?: string;
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

    // Create collection data file (similar to thought files)
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

    // Generate share token
    let shareToken: any = undefined;
    try {
      const encryptionService = getEncryptionService();
      shareToken = await encryptionService.generateShareToken(
        packageData,
        {
          id: session.did,
          publicKey: publicKey
        }
      );
    } catch (tokenError: any) {
      console.error('Share token generation failed:', tokenError);
    }

    // Upload encrypted file
    const formData = new FormData();
    const encryptedBlob = new Blob([JSON.stringify(packageData)], { type: 'application/json' });
    formData.append('file', encryptedBlob, `${fileName}.encrypted`);
    formData.append('accountId', accountId);

    const uploadResponse = await fetch(`${apiEndpoint}/api/drive/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload collection file');
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.file?.id;

    if (!fileId) {
      throw new Error('Upload succeeded but no file ID returned');
    }

    // Create metadata entry
    const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        name: metadata?.title || collectionData.title || 'Collection',
        description: metadata?.description || collectionData.description || '',
        keywords: metadata?.keywords || [],
        tags: metadata?.tags || [],
        fileType: 'collection',
        isPublic: metadata?.isPublic ?? true,
        publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
        uploadDate: new Date().toISOString(),
        collection: {
          collectionFileIds: collectionData.collectionFileIds
        },
        isNSFW: metadata?.isNSFW || false,
      }),
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

