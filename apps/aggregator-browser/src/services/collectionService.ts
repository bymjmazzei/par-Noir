import { PNOAuthService } from './pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../services/encryptionService';
import { getOwnerApiHeaders } from './ownerApiHeaders';

import { API_ENDPOINT } from '../config/api';

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
    isThoughtCollection?: boolean; // Flag to distinguish thought collections from regular collections
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
    const uploadResponse = await fetch(`${API_ENDPOINT}/api/drive/files`, {
      method: 'POST',
      headers: getOwnerApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileData: base64File,
        fileName: encryptedFileName,
        mimeType: 'application/json', // Encrypted files are stored as JSON
        accountId: accountId
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      throw new Error(`Failed to upload collection file: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const fileId = uploadResult.file?.id;

    if (!fileId) {
      throw new Error('Upload succeeded but no file ID returned');
    }

    // Create metadata entry
    const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
      method: 'PUT',
      headers: getOwnerApiHeaders({ 'Content-Type': 'application/json' }),
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
        isThoughtCollection: metadata?.isThoughtCollection || false, // Mark if this is a thought collection
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

