/**
 * File Storage Aggregator Component (Browser App)
 * Uses API endpoints instead of direct Google Drive access
 */

import React, { useState, useEffect, useRef } from 'react';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, X, Edit, Eye, Grid, List, Plus, Cloud, MoreVertical, Share2 } from 'lucide-react';
import { PNOAuthService } from '../services/pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';

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

// Thumbnail component that handles authenticated loading
const ThumbnailImage: React.FC<{ fileId: string; accountId: string; fileName: string; alt: string; className?: string }> = ({ fileId, accountId, fileName, alt, className = 'w-full h-full object-cover' }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // Check if file is encrypted
  // Note: Files uploaded through the dashboard are stored with .encrypted extension
  // But they're actually JSON packages, so we check the extension
  const isEncrypted = fileName.toLowerCase().endsWith('.encrypted');
  
  console.log(`[ThumbnailImage] Component rendered for file: ${fileName}, isEncrypted: ${isEncrypted}, fileId: ${fileId}`);

  useEffect(() => {
    console.log(`[ThumbnailImage] useEffect triggered for file: ${fileName}, isEncrypted: ${isEncrypted}`);
    let blobUrl: string | null = null;
    
    const loadThumbnail = async () => {
      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          console.warn('[ThumbnailImage] No access token available');
          setError(true);
          return;
        }

        if (isEncrypted) {
          // For encrypted files: download, decrypt, and generate thumbnail
          console.log(`[ThumbnailImage] Decrypting encrypted file for thumbnail: ${fileName}`);
          
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            console.error('[ThumbnailImage] No DID in session for decryption');
            setError(true);
            return;
          }

          // Files are encrypted with DID:publicKey
          // OAuth provides both DID and publicKey via userinfo endpoint
          const pnId = session.did; // Use DID as the id (matching dashboard's authenticatedUser.id)
          let publicKey = session?.publicKey;
          
          // Fallback: extract from DID if it's in did:key format
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8); // Remove "did:key:" prefix
            console.log('[ThumbnailImage] Using publicKey extracted from DID');
          }
          
          if (!publicKey) {
            console.error('[ThumbnailImage] No publicKey available for decryption. OAuth should provide public_key in userinfo response.');
            setError(true);
            return;
          }
          
          console.log(`[ThumbnailImage] Using for decryption - pnId: ${pnId.substring(0, 30)}..., publicKey: ${publicKey.substring(0, 30)}...`);

          // Download encrypted file (it's stored as JSON string)
          const fileUrl = `${apiEndpoint}/api/drive/files/${fileId}?accountId=${accountId}&download=true`;
          console.log(`[ThumbnailImage] Downloading encrypted file: ${fileUrl}`);
          
          const response = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          console.log(`[ThumbnailImage] Download response status: ${response.status}, content-type: ${response.headers.get('content-type')}`);

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[ThumbnailImage] Download failed: ${response.status} - ${errorText}`);
            throw new Error(`Failed to download file: ${response.status}`);
          }

          // Encrypted files are stored as JSON strings, so read as text first
          const encryptedText = await response.text();
          console.log(`[ThumbnailImage] Downloaded text length: ${encryptedText.length}, preview: ${encryptedText.substring(0, 100)}`);
          
          let encryptedPackage: EncryptedFilePackage;
          
          try {
            encryptedPackage = JSON.parse(encryptedText);
            console.log(`[ThumbnailImage] Parsed encrypted package:`, {
              hasEncrypted: !!encryptedPackage.encrypted,
              hasIv: !!encryptedPackage.iv,
              hasSalt: !!encryptedPackage.salt,
              hasMetadata: !!encryptedPackage.metadata,
              encryptedLength: encryptedPackage.encrypted?.length,
              metadataName: encryptedPackage.metadata?.originalName
            });
          } catch (parseError) {
            console.error('[ThumbnailImage] Failed to parse encrypted package:', parseError);
            console.error('[ThumbnailImage] Response text:', encryptedText.substring(0, 500));
            throw new Error('File is not a valid encrypted package');
          }
          
          // Decrypt file
          console.log(`[ThumbnailImage] Starting decryption with DID: ${session.did.substring(0, 20)}..., publicKey: ${publicKey.substring(0, 20)}...`);
          
          const encryptionManager = new EncryptionManager();
          let decryptedData: Uint8Array;
          
          try {
            decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
            console.log(`[ThumbnailImage] Decryption successful, decrypted size: ${decryptedData.length} bytes`);
          } catch (decryptError: any) {
            console.error('[ThumbnailImage] Decryption failed:', decryptError);
            console.error('[ThumbnailImage] Decryption error details:', {
              error: decryptError?.message,
              errorName: decryptError?.name,
              hasDid: !!session.did,
              hasPublicKey: !!publicKey,
              didPreview: session.did?.substring(0, 20),
              publicKeyPreview: publicKey?.substring(0, 20)
            });
            throw decryptError;
          }

          // Create thumbnail from decrypted blob
          const decryptedBlob = new Blob([decryptedData], {
            type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
          });

          // Generate thumbnail (resize for images, extract frame for videos)
          const thumbnailBlob = await createThumbnailFromBlob(decryptedBlob, 300, 300);
          blobUrl = URL.createObjectURL(thumbnailBlob);
          setThumbnailUrl(blobUrl);
          setError(false);
        } else {
          // Non-encrypted files: load thumbnail from Google Drive
          const thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true&accountId=${accountId}`;
          console.log(`[ThumbnailImage] Loading thumbnail for ${fileId} from ${thumbnailUrl}`);
          
          const response = await fetch(thumbnailUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          console.log(`[ThumbnailImage] Response status: ${response.status}`);

          if (response.ok) {
            const blob = await response.blob();
            blobUrl = URL.createObjectURL(blob);
            console.log(`[ThumbnailImage] Created blob URL: ${blobUrl.substring(0, 50)}...`);
            setThumbnailUrl(blobUrl);
            setError(false);
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error(`[ThumbnailImage] Failed to load thumbnail: ${response.status} - ${errorText}`);
            setError(true);
          }
        }
      } catch (err) {
        console.error('[ThumbnailImage] Failed to load thumbnail:', err);
        setError(true);
      }
    };

    loadThumbnail();

    // Cleanup blob URL on unmount or when fileId/accountId changes
    return () => {
      if (blobUrl) {
        console.log(`[ThumbnailImage] Cleaning up blob URL for ${fileId}`);
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [fileId, accountId, isEncrypted, fileName]);

// Helper function to create thumbnail from blob
async function createThumbnailFromBlob(blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) {
          resolve(thumbnailBlob);
        } else {
          reject(new Error('Failed to create thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };
    
    img.src = url;
  });
}

  if (error || !thumbnailUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Lock className="h-8 w-8 text-blue-400" />
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
};

// File viewer component that handles authenticated file loading
const FileViewer: React.FC<{ file: DriveFile; accountId: string; onDownload: () => void }> = ({ file, accountId, onDownload }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const isImage = file.mimeType?.startsWith('image/');
  const isVideo = file.mimeType?.startsWith('video/');
  const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true);
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setError(true);
          setLoading(false);
          return;
        }

        const fileUrl = `${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}&download=true`;
        console.log(`[FileViewer] Loading file: ${file.name} from ${fileUrl}`);
        
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        console.log(`[FileViewer] Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[FileViewer] Failed to load file: ${response.status} - ${errorText}`);
          setError(true);
          setLoading(false);
          return;
        }

        if (isEncrypted) {
          // Decrypt encrypted file
          console.log(`[FileViewer] Decrypting encrypted file: ${file.name}`);
          
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            console.error('[FileViewer] No DID in session for decryption');
            setError(true);
            setLoading(false);
            return;
          }

          // Files are encrypted with DID:publicKey
          // OAuth provides both DID and publicKey via userinfo endpoint
          const pnId = session.did; // Use DID as the id (matching dashboard's authenticatedUser.id)
          let publicKey = session?.publicKey;
          
          // Fallback: extract from DID if it's in did:key format
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8); // Remove "did:key:" prefix
            console.log('[FileViewer] Using publicKey extracted from DID');
          }
          
          if (!publicKey) {
            console.error('[FileViewer] No publicKey available for decryption. OAuth should provide public_key in userinfo response.');
            setError(true);
            setLoading(false);
            return;
          }
          
          console.log(`[FileViewer] Using for decryption - pnId: ${pnId.substring(0, 30)}..., publicKey: ${publicKey.substring(0, 30)}...`);

          // Encrypted files are stored as JSON strings, so read as text first
          const encryptedText = await response.text();
          console.log(`[FileViewer] Downloaded text length: ${encryptedText.length}, preview: ${encryptedText.substring(0, 100)}`);
          
          let encryptedPackage: EncryptedFilePackage;
          
          try {
            encryptedPackage = JSON.parse(encryptedText);
            console.log(`[FileViewer] Parsed encrypted package:`, {
              hasEncrypted: !!encryptedPackage.encrypted,
              hasIv: !!encryptedPackage.iv,
              hasSalt: !!encryptedPackage.salt,
              hasMetadata: !!encryptedPackage.metadata
            });
          } catch (parseError) {
            console.error('[FileViewer] Failed to parse encrypted package:', parseError);
            console.error('[FileViewer] Response text:', encryptedText.substring(0, 500));
            throw new Error('File is not a valid encrypted package');
          }
          
          // Decrypt file
          console.log(`[FileViewer] Starting decryption with DID: ${session.did.substring(0, 20)}..., publicKey: ${publicKey.substring(0, 20)}...`);
          
          const encryptionManager = new EncryptionManager();
          let decryptedData: Uint8Array;
          
          try {
            decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
            console.log(`[FileViewer] Decryption successful, decrypted size: ${decryptedData.length} bytes`);
          } catch (decryptError: any) {
            console.error('[FileViewer] Decryption failed:', decryptError);
            console.error('[FileViewer] Decryption error details:', {
              error: decryptError?.message,
              errorName: decryptError?.name,
              hasDid: !!session.did,
              hasPublicKey: !!publicKey
            });
            throw decryptError;
          }

          // Create blob from decrypted data
          const decryptedBlob = new Blob([decryptedData], {
            type: encryptedPackage.metadata.originalMimeType || file.mimeType || 'application/octet-stream'
          });

          const url = URL.createObjectURL(decryptedBlob);
          console.log(`[FileViewer] Created decrypted blob URL for ${file.name}`);
          setFileUrl(url);
        } else {
          // Non-encrypted file: use directly
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          console.log(`[FileViewer] Created blob URL for ${file.name}`);
          setFileUrl(url);
        }
      } catch (err) {
        console.error('[FileViewer] Failed to load file:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (isImage || isVideo) {
      loadFile();
    } else {
      setLoading(false);
    }

    // Cleanup blob URL on unmount
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [file.id, file.name, accountId, isImage, isVideo, isEncrypted]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (error || !fileUrl) {
    return (
      <div className="text-center text-white">
        <Lock className="h-16 w-16 mx-auto mb-4 text-blue-400" />
        <p className="mb-2 text-lg font-semibold">
          {isEncrypted ? 'Encrypted File' : 'Preview not available'}
        </p>
        <p className="mb-4 text-sm text-gray-400">
          {isEncrypted 
            ? 'This file is encrypted and must be downloaded to view.' 
            : 'This file cannot be previewed in the browser.'}
        </p>
        <button
          onClick={onDownload}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Download File
        </button>
      </div>
    );
  }

  if (isImage) {
    return (
      <img
        src={fileUrl}
        alt={file.name}
        className="max-w-full max-h-full object-contain"
        style={{ 
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
        }}
      />
    );
  }

  if (isVideo) {
    return (
      <video
        src={fileUrl}
        controls
        className="max-w-full max-h-full"
      />
    );
  }

  return (
    <div className="text-center text-white">
      <p className="mb-4">Preview not available for this file type</p>
      <button
        onClick={onDownload}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Download File
      </button>
    </div>
  );
};

interface DriveAccount {
  provider: string;
  accountId: string;
  email?: string;
  displayName?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  isPublic?: boolean;
  accountId?: string; // Track which account this file belongs to
}

interface FileStorageAggregatorProps {
  authenticatedUser?: {
    id: string;
    pnName?: string;
    publicKey?: string;
    nickname?: string;
    accessToken?: string;
  } | null;
  hideSecureFolderSection?: boolean;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ 
  authenticatedUser, 
  hideSecureFolderSection = false 
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [filesByAccount, setFilesByAccount] = useState<Map<string, DriveFile[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const actionMenuRef = useRef<HTMLDivElement | null>(null);

  // Load cloud accounts
  useEffect(() => {
    const loadAccounts = async () => {
      if (!authenticatedUser?.id) {
        setDriveAccounts([]);
        return;
      }

      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          console.error('[FileStorageAggregator] No valid access token');
          return;
        }

        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${authenticatedUser.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const accounts = data.accounts || [];
          setDriveAccounts(accounts);
          if (accounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accounts[0].accountId);
          }
        }
      } catch (err) {
        console.error('[FileStorageAggregator] Failed to load accounts:', err);
      }
    };

    loadAccounts();
  }, [authenticatedUser?.id, selectedAccountId]);

  // Load files for a specific account
  const loadFilesForAccount = async (accountId: string) => {
    if (!authenticatedUser?.id) {
      console.log('[FileStorageAggregator] Skipping file load - no authenticated user');
      return;
    }

    try {
      console.log(`[FileStorageAggregator] Loading files for account: ${accountId}`);
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        console.error('[FileStorageAggregator] No valid access token available');
        setError('Please connect your pN to view files');
        return;
      }

      // Server will automatically filter to files in the pN folder if no query is provided
      console.log(`[FileStorageAggregator] Making request to: ${apiEndpoint}/api/drive/files?accountId=${accountId}`);
      const response = await fetch(`${apiEndpoint}/api/drive/files?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log(`[FileStorageAggregator] Response status: ${response.status} ${response.statusText}`);

      if (response.status === 401) {
        // Token might be invalid, try refreshing (force refresh even if not expired)
        console.warn('[FileStorageAggregator] Got 401, token may be expired. Attempting refresh...');
        const errorBody = await response.text().catch(() => '');
        console.warn('[FileStorageAggregator] 401 error body:', errorBody);
        
        // Force refresh the token
        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
        if (!refreshedToken) {
          console.error('[FileStorageAggregator] Failed to get refreshed token - refresh token may be invalid or expired');
          setError('Your session has expired. Please unlock your pN again to continue.');
          return;
        }
        
        console.log('[FileStorageAggregator] Retrying with refreshed token...');
        // Retry with refreshed token
        const retryResponse = await fetch(`${apiEndpoint}/api/drive/files?accountId=${accountId}`, {
          headers: {
            'Authorization': `Bearer ${refreshedToken}`
          }
        });
        
        console.log(`[FileStorageAggregator] Retry response status: ${retryResponse.status} ${retryResponse.statusText}`);
        
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text().catch(() => 'Unknown error');
          console.error('[FileStorageAggregator] Retry failed:', errorText);
          throw new Error(`Failed to load files: ${retryResponse.statusText} - ${errorText}`);
        }
        
        const retryData = await retryResponse.json();
        const allFiles = (retryData.files || []).map((file: DriveFile) => ({
          ...file,
          accountId
        }));
        
        // Filter to show only media files (images/videos), excluding metadata, index, encrypted, and system files
        const mediaFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Exclude folders
          if (mimeType === 'application/vnd.google-apps.folder') {
            return false;
          }
          
          // Exclude metadata files
          if (name.endsWith('.metadata.json') || name === '_metadata') {
            return false;
          }
          
          // Exclude index files
          if (name.includes('file-index.json') || name.includes('index.json')) {
            return false;
          }
          
          // Exclude system files/folders (but allow actual media files that might start with _)
          if ((name.startsWith('_') || name === 'metadata') && !mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
            // Check if it's a media file by extension even if MIME type doesn't match
            const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
            const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
            const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
            if (!hasImageExt && !hasVideoExt) {
              return false;
            }
          }
          
          // Check MIME types
          const isImageMime = mimeType.startsWith('image/');
          const isVideoMime = mimeType.startsWith('video/');
          
          // Check file extensions (including encrypted files which have .encrypted suffix)
          // Remove .encrypted suffix first to check original extension
          const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
          const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
          const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
          
          // Include if it's an image/video by MIME type OR by file extension
          // This allows encrypted files to show if they have image/video extensions
          return isImageMime || isVideoMime || hasImageExt || hasVideoExt;
        });
        
        // Debug: log all files and what was filtered
        console.log(`[FileStorageAggregator] All files from API (${allFiles.length}):`, allFiles.map(f => ({
          name: f.name,
          mimeType: f.mimeType,
          size: f.size
        })));
        
        if (allFiles.length > mediaFiles.length) {
          const filteredOut = allFiles.filter(f => !mediaFiles.some(mf => mf.id === f.id));
          console.log(`[FileStorageAggregator] Filtered out ${filteredOut.length} files:`, filteredOut.map(f => ({
            name: f.name,
            mimeType: f.mimeType
          })));
        }
        
        console.log(`[FileStorageAggregator] Media files (${mediaFiles.length}):`, mediaFiles.map(f => ({
          name: f.name,
          mimeType: f.mimeType
        })));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} total files, filtered to ${mediaFiles.length} media files for account ${accountId}`);
        setFilesByAccount(prev => {
          const next = new Map(prev);
          next.set(accountId, mediaFiles);
          return next;
        });
        setError(null); // Clear any previous errors
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const allFiles = (data.files || []).map((file: DriveFile) => ({
          ...file,
          accountId // Tag each file with its account ID
        }));
        
        // Filter to show only media files (images/videos), excluding metadata, index, encrypted, and system files
        const mediaFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Exclude folders
          if (mimeType === 'application/vnd.google-apps.folder') {
            return false;
          }
          
          // Exclude metadata files
          if (name.endsWith('.metadata.json') || name === '_metadata') {
            return false;
          }
          
          // Exclude index files
          if (name.includes('file-index.json') || name.includes('index.json')) {
            return false;
          }
          
          // Exclude system files/folders (but allow actual media files that might start with _)
          if ((name.startsWith('_') || name === 'metadata') && !mimeType.startsWith('image/') && !mimeType.startsWith('video/')) {
            // Check if it's a media file by extension even if MIME type doesn't match
            const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
            const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
            const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
            if (!hasImageExt && !hasVideoExt) {
              return false;
            }
          }
          
          // Check MIME types
          const isImageMime = mimeType.startsWith('image/');
          const isVideoMime = mimeType.startsWith('video/');
          
          // Check file extensions (including encrypted files which have .encrypted suffix)
          // Remove .encrypted suffix first to check original extension
          const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
          const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
          const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
          
          // Include if it's an image/video by MIME type OR by file extension
          // This allows encrypted files to show if they have image/video extensions
          return isImageMime || isVideoMime || hasImageExt || hasVideoExt;
        });
        
        // Debug: log all files and what was filtered
        console.log(`[FileStorageAggregator] All files from API (${allFiles.length}):`, allFiles.map(f => ({
          name: f.name,
          mimeType: f.mimeType,
          size: f.size
        })));
        
        if (allFiles.length > mediaFiles.length) {
          const filteredOut = allFiles.filter(f => !mediaFiles.some(mf => mf.id === f.id));
          console.log(`[FileStorageAggregator] Filtered out ${filteredOut.length} files:`, filteredOut.map(f => ({
            name: f.name,
            mimeType: f.mimeType
          })));
        }
        
        console.log(`[FileStorageAggregator] Media files (${mediaFiles.length}):`, mediaFiles.map(f => ({
          name: f.name,
          mimeType: f.mimeType
        })));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} total files, filtered to ${mediaFiles.length} media files for account ${accountId}`);
        setFilesByAccount(prev => {
          const next = new Map(prev);
          next.set(accountId, mediaFiles);
          return next;
        });
        setError(null); // Clear any previous errors
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[FileStorageAggregator] Request failed (${response.status}):`, errorText);
        throw new Error(`Failed to load files: ${response.statusText} - ${errorText}`);
      }
    } catch (err: any) {
      console.error('[FileStorageAggregator] Failed to load files:', err);
      // Only set error if it's a real error, not just empty files
      if (err.message && !err.message.includes('No valid access token')) {
        setError(err.message || 'Failed to load files');
      }
    }
  };

  // Load files for all accounts
  useEffect(() => {
    if (driveAccounts.length > 0 && authenticatedUser?.id) {
      // Load files for each account sequentially to avoid race conditions
      const loadAllFiles = async () => {
        setIsLoading(true);
        setError(null); // Clear previous errors
        try {
          for (const account of driveAccounts) {
            try {
              await loadFilesForAccount(account.accountId);
            } catch (err) {
              // Log error but continue loading other accounts
              console.error(`[FileStorageAggregator] Failed to load files for account ${account.accountId}:`, err);
            }
          }
        } finally {
          setIsLoading(false);
        }
      };
      loadAllFiles();
    }
  }, [driveAccounts.length, authenticatedUser?.id]);


  // Handle file download
  const handleDownload = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const response = await fetch(`${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        throw new Error('Failed to download file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
      console.error('[FileStorageAggregator] Download error:', err);
    }
  };

  // Handle file delete
  const handleDelete = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const response = await fetch(`${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        await loadFilesForAccount(accountId); // Reload files for this account
        setOpenMenuFor(null);
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
      console.error('[FileStorageAggregator] Delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setOpenMenuFor(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasConnectedBackends = driveAccounts.length > 0;

  const handleUploadForAccount = async (accountId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !authenticatedUser?.id) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Convert file to base64
      const base64File = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const response = await fetch(`${apiEndpoint}/api/drive/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          fileData: base64File,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          accountId: accountId
        })
      });

      if (response.ok) {
        // Reload files for this account
        await loadFilesForAccount(accountId);
        const input = fileInputRefs.current.get(accountId);
        if (input) input.value = '';
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed: ${errorText}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
      console.error('[FileStorageAggregator] Upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Show warning if no accounts */}
      {driveAccounts.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <span className="text-yellow-400 text-sm">No cloud storage accounts connected. Connect in the dashboard.</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File List - One section per account */}
      {hasConnectedBackends && (
        <div className="space-y-6">
          {driveAccounts.map((account, index) => {
            const accountFiles = filesByAccount.get(account.accountId) || [];

            return (
              <div key={account.accountId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Cloud className="h-5 w-5 text-blue-400" />
                    <span className="text-white font-semibold truncate max-w-xs">
                      {account.email || account.displayName || `Drive ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        // Disconnect - just remove from UI for now (would need API endpoint)
                        setDriveAccounts(prev => prev.filter(a => a.accountId !== account.accountId));
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Disconnect
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        loadFilesForAccount(account.accountId);
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                      title="Refresh Files"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <input
                      type="file"
                      ref={(el) => {
                        if (el) {
                          fileInputRefs.current.set(account.accountId, el);
                        } else {
                          fileInputRefs.current.delete(account.accountId);
                        }
                      }}
                      className="hidden"
                      disabled={isLoading}
                      onChange={(e) => handleUploadForAccount(account.accountId, e)}
                    />
                    <button
                      onClick={() => {
                        setSelectedAccountId(account.accountId);
                        const input = fileInputRefs.current.get(account.accountId);
                        input?.click();
                      }}
                      disabled={isLoading}
                      className="p-2 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
                      title="Upload File"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded transition-colors ${
                        viewMode === 'list'
                          ? 'bg-blue-600 text-white'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title="List View"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-blue-600 text-white'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title="Grid View"
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {accountFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                    <p className="text-text-secondary">No files found for this account</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {accountFiles.map((file) => {
                const isImage = file.mimeType?.startsWith('image/');
                const isVideo = file.mimeType?.startsWith('video/');
                const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
                
                console.log(`[FileStorageAggregator] Processing file for thumbnail: ${file.name}, mimeType: ${file.mimeType}, isImage: ${isImage}, isVideo: ${isVideo}, isEncrypted: ${isEncrypted}`);
                
                // For encrypted files, check if they're media files by extension
                let isMediaFile = isImage || isVideo;
                if (isEncrypted) {
                  const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  isMediaFile = hasImageExt || hasVideoExt;
                  console.log(`[FileStorageAggregator] Encrypted file check: nameWithoutEncrypted=${nameWithoutEncrypted}, hasImageExt=${hasImageExt}, hasVideoExt=${hasVideoExt}, isMediaFile=${isMediaFile}`);
                }
                
                console.log(`[FileStorageAggregator] Final decision for ${file.name}: isMediaFile=${isMediaFile}, will render ThumbnailImage=${isMediaFile}`);

                return (
                  <div
                    key={file.id}
                    className="bg-neutral-800/50 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group cursor-pointer"
                    onClick={() => setViewingFile(file)}
                  >
                    <div className="relative aspect-square bg-neutral-700/50 overflow-hidden">
                      {isMediaFile ? (
                        <ThumbnailImage 
                          fileId={file.id}
                          accountId={file.accountId || account.accountId}
                          fileName={file.name}
                          alt={file.name}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock className="h-8 w-8 text-blue-400" />
                        </div>
                      )}
                      {file.isPublic && (
                        <div className="absolute top-2 right-2 bg-green-500/80 rounded-full p-1">
                          <Globe className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {isMediaFile && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Eye className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-white text-xs truncate mb-1" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {(parseInt(file.size || '0') / 1024).toFixed(1)} KB
                      </p>

                      <div className="flex items-center justify-end mt-2 pt-2 border-t border-neutral-700">
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuFor(openMenuFor === file.id ? null : file.id);
                            }}
                            className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded"
                            title="File actions"
                            disabled={isLoading}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openMenuFor === file.id && (
                            <div
                              ref={actionMenuRef}
                              className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-30 py-1"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuFor(null);
                                  handleDownload(file, account.accountId);
                                }}
                                className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                disabled={isLoading}
                              >
                                <Download className="h-4 w-4" />
                                <span>Download</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuFor(null);
                                  handleDelete(file, account.accountId);
                                }}
                                className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
                                disabled={isLoading}
                              >
                                <X className="h-4 w-4" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                    );
                  })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accountFiles.map((file) => {
                const isImage = file.mimeType?.startsWith('image/');
                const isVideo = file.mimeType?.startsWith('video/');
                const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
                
                // For encrypted files, check if they're media files by extension
                let isMediaFile = isImage || isVideo;
                if (isEncrypted) {
                  const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  isMediaFile = hasImageExt || hasVideoExt;
                }

                return (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                    onClick={() => setViewingFile(file)}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {isMediaFile ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                          <ThumbnailImage 
                            fileId={file.id}
                            accountId={file.accountId || account.accountId}
                            fileName={file.name}
                            alt={file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-white text-sm truncate">
                            {file.name}
                          </p>
                          {file.isPublic && (
                            <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                          )}
                        </div>
                        <p className="text-text-secondary text-xs">
                          {account.accountId || 'google_drive'} • {(parseInt(file.size || '0') / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end space-x-2">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuFor(openMenuFor === file.id ? null : file.id);
                          }}
                          className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 bg-neutral-700/50 hover:bg-neutral-700 text-text-secondary hover:text-text-primary"
                          title="File actions"
                          disabled={isLoading}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuFor === file.id && (
                          <div
                            ref={actionMenuRef}
                            className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-30 py-1"
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuFor(null);
                                handleDownload(file, account.accountId);
                              }}
                              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                              disabled={isLoading}
                            >
                              <Download className="h-4 w-4" />
                              <span>Download</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuFor(null);
                                handleDelete(file, account.accountId);
                              }}
                              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
                              disabled={isLoading}
                            >
                              <X className="h-4 w-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                    );
                  })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingFile(null)}
        >
          <div 
            className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewingFile(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-neutral-800/80 rounded-lg text-white hover:bg-neutral-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            
            {viewingFile.accountId ? (
              <FileViewer 
                file={viewingFile}
                accountId={viewingFile.accountId}
                onDownload={() => handleDownload(viewingFile, viewingFile.accountId)}
              />
            ) : (
              <div className="text-center text-white">
                <p>Preview not available</p>
                <button
                  onClick={() => viewingFile.accountId && handleDownload(viewingFile, viewingFile.accountId)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Download File
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
