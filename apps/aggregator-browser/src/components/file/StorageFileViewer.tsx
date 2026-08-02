/**
 * File viewer components for the aggregator-browser storage panel.
 */
import React, { useState, useEffect } from 'react';
import { Lock, X } from 'lucide-react';
import { PNOAuthService } from '../../services/pnOAuthService';
import { EncryptionManager } from '../../utils/encryptionManager';
import { fetchStorageFile } from '../../services/storageApiClient';
import { API_ENDPOINT } from '../../config/api';
import type { DriveFile } from '../storage/storageTypes';
import type { EncryptedFilePackage } from '../../services/encryptionService';

export const FileViewerModal: React.FC<{ file: DriveFile; fileMetadataMap: Map<string, any>; onClose: () => void; onDownload: () => void }> = ({ file, fileMetadataMap, onClose, onDownload }) => {
  const [thoughtTitle, setThoughtTitle] = useState<string | null>(null);
  const [isLoadingTitle, setIsLoadingTitle] = useState(false);

  // Check if this is a thought file
  const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
  const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                    (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
  const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');

  // Load thought title
  useEffect(() => {
    if (!isThought && !isThoughtThumbnail) {
      return;
    }

    const loadThoughtTitle = async () => {
      setIsLoadingTitle(true);
      try {
        // First check metadata map
        const metadata = fileMetadataMap.get(file.id);
        if (metadata?.title) {
          setThoughtTitle(metadata.title);
          setIsLoadingTitle(false);
          return;
        }

        // CRITICAL: Thumbnails have the metadata, not main files
        // No need to check main file metadata - thumbnail metadata is the source of truth

        // Try to load from API metadata
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setIsLoadingTitle(false);
          return;
        }

        // CRITICAL: Thumbnails have the metadata, not main files
        // If this is a thumbnail, use file.id directly (thumbnail has metadata)
        // If this is a main file, the API GET endpoint will resolve it to thumbnail
        const fileIdToCheck = file.id;
        
        const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileIdToCheck}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const metadata = await response.json();
          if (metadata.metadata?.title) {
            setThoughtTitle(metadata.metadata.title);
          } else if (metadata.metadata?.textPost?.content || metadata.metadata?.thought?.content) {
            // Extract title from content (first line or first 50 chars)
            const content = metadata.metadata.textPost?.content || metadata.metadata.thought?.content || '';
            const firstLine = content.split('\n')[0].trim();
            setThoughtTitle(firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine || 'Thought');
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[FileViewerModal] Failed to load thought title:', err);
      } finally {
        setIsLoadingTitle(false);
      }
    };

    loadThoughtTitle();
  }, [file.id, file.name, isThought, isThoughtThumbnail, fileMetadataMap]);

  // Get display title
  const displayTitle = thoughtTitle || (isThought || isThoughtThumbnail ? 'Thought' : null);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="relative max-w-7xl max-h-[90vh] w-full h-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with title */}
        {(displayTitle || isLoadingTitle) && (
          <div className="absolute top-4 left-4 right-16 z-10">
            <h2 className="text-white text-lg font-medium truncate">
              {isLoadingTitle ? 'Loading...' : displayTitle}
            </h2>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-neutral-800/80 rounded-lg text-white hover:bg-neutral-700 transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
        
        {/* File viewer */}
        {file.accountId ? (
          <div className="flex-1 w-full flex items-center justify-center">
            <FileViewer 
              file={file}
              accountId={file.accountId}
              backend={(file as { provider?: string }).provider || 'google_drive'}
              onDownload={onDownload}
            />
          </div>
        ) : (
          <div className="text-center text-white">
            <p>Preview not available</p>
            <button
              onClick={onDownload}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Download File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// File viewer component that handles authenticated file loading
export const FileViewer: React.FC<{ file: DriveFile; accountId: string; backend: string; onDownload: () => void }> = ({ file, accountId, backend, onDownload }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Determine file type from name (for encrypted files, check original extension)
  const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
  const isImage = file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
  const isVideo = file.mimeType?.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
  const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');

  useEffect(() => {
    const loadFile = async () => {
      try {
        // Skip loading files that are still uploading
        if (file.id.startsWith('uploading_')) {
          if (import.meta.env.DEV) console.log('[FileViewer] Skipping load for uploading file:', file.id);
          setLoading(false);
          setError(false);
          return;
        }

        setLoading(true);
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setError(true);
          setLoading(false);
          return;
        }

        const session = PNOAuthService.loadSession();
        const pnIdentifier = session?.pnIdentifier;
        if (!pnIdentifier) {
          setError(true);
          setLoading(false);
          return;
        }

        const response = await fetchStorageFile(accessToken, pnIdentifier, backend, file.id, {
          accountId
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          if (import.meta.env.DEV) console.error(`[FileViewer] Failed to load file: ${response.status} - ${errorText}`);
          setError(true);
          setLoading(false);
          return;
        }

        if (isEncrypted) {
          // Decrypt encrypted file
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            setError(true);
            setLoading(false);
            return;
          }

          const pnId = session.did;
          let publicKey = session?.publicKey;
          
          // If publicKey is missing, try to refresh it from userinfo
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
          
          // Fallback: extract from DID if it's in did:key format
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8);
          }
          
          if (!publicKey) {
            setError(true);
            setLoading(false);
            return;
          }

          // Encrypted files are stored as JSON strings, so read as text first
          const encryptedText = await response.text();
          
          let encryptedPackage: EncryptedFilePackage;
          
          try {
            encryptedPackage = JSON.parse(encryptedText);
          } catch (parseError) {
            throw new Error('File is not a valid encrypted package');
          }
          
          // Decrypt file
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
          } catch (decryptError: any) {
            throw decryptError;
          }

          // Create blob from decrypted data
          const originalMimeType = encryptedPackage.metadata?.originalMimeType || file.mimeType || 'application/octet-stream';
          const decryptedBlob = new Blob([decryptedData as BlobPart], {
            type: originalMimeType
          });

          const url = URL.createObjectURL(decryptedBlob);
          setFileUrl(url);
          setError(false);
        } else {
          // Non-encrypted file: use directly
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setFileUrl(url);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[FileViewer] Failed to load file:', err);
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

