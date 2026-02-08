/**
 * File Storage Aggregator Component (Browser App)
 * Uses API endpoints instead of direct Google Drive access
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, X, Edit, Eye, Grid, List, Plus, Cloud, MoreVertical, Share2, Star, Type, Upload, Minus, Trash2, Layers } from 'lucide-react';
import { PNOAuthService } from '../services/pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../services/encryptionService';
import { createCollection } from '../services/collectionService';
import { uploadQueueService } from '../services/uploadQueueService';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { LICENSE_TYPES } from '../constants/licenses';
import { FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { cleanTitle } from '../utils/cleanTitle';
import { EditMetadataModal, MetadataFormData } from './EditMetadataModal';
import { accountsCacheService } from '../services/accountsCacheService';
import { ThumbnailImage } from './file/ThumbnailImage';
import { useDriveAccounts } from '../hooks/useDriveAccounts';
import type { DriveAccount, DriveFile } from './storage/storageTypes';
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
 * Generate thumbnail from video by extracting first frame
 */
async function createVideoThumbnail(videoFile: File, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoFile);
    
    video.onloadedmetadata = () => {
      // Seek to 1 second or first frame
      video.currentTime = Math.min(1, video.duration / 2);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      let width = video.videoWidth;
      let height = video.videoHeight;
      
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
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, width, height);
      
      canvas.toBlob((thumbnailBlob) => {
        URL.revokeObjectURL(url);
        if (thumbnailBlob) {
          resolve(thumbnailBlob);
        } else {
          reject(new Error('Failed to create video thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for thumbnail'));
    };
    
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
  });
}

/**
 * Upload encrypted thumbnail file
 */
async function uploadThumbnail(
  thumbnailBlob: Blob,
  originalFileName: string,
  encryptionManager: EncryptionManager,
  session: any,
  publicKey: string,
  accessToken: string,
  accountId: string
): Promise<string | undefined> {
  try {
    console.log('🖼️ [Upload] Generating thumbnail...');
    
    // Encrypt thumbnail
    const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
    const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
    const encryptedThumbnail = await encryptionManager.encrypt(
      thumbnailData,
      session.did,
      publicKey
    );
    
    // Create encrypted thumbnail package
    const thumbnailPackage: EncryptedFilePackage = {
      encrypted: encryptedThumbnail.encrypted,
      iv: encryptedThumbnail.iv,
      salt: encryptedThumbnail.salt,
      metadata: {
        originalName: `thumb_${originalFileName}`,
        originalSize: thumbnailBlob.size,
        originalMimeType: 'image/jpeg', // Thumbnails are always JPEG
      },
    };
    
    // Convert to base64
    const thumbnailBlobJson = new Blob([JSON.stringify(thumbnailPackage)], {
      type: 'application/json',
    });
    
    const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = () => reject(new Error('Failed to read thumbnail'));
      reader.readAsDataURL(thumbnailBlobJson);
    });
    
    // Upload encrypted thumbnail
    const thumbnailFileName = `thumb_${originalFileName}.encrypted`;
    const thumbnailResponse = await fetch(`${API_ENDPOINT}/api/drive/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        fileData: thumbnailBase64,
        fileName: thumbnailFileName,
        mimeType: 'application/json',
        accountId: accountId
      })
    });
    
    if (thumbnailResponse.ok) {
      const thumbnailResult = await thumbnailResponse.json();
      const thumbnailFileId = thumbnailResult.file?.id;
      if (thumbnailFileId) {
        console.log('✅ [Upload] Thumbnail uploaded:', thumbnailFileId);
        return thumbnailFileId;
      }
    }
    
    console.warn('⚠️ [Upload] Thumbnail upload failed, continuing without thumbnail');
    return undefined;
  } catch (error: any) {
    console.error('❌ [Upload] Thumbnail generation/upload failed:', error);
    return undefined;
  }
}

// File viewer modal wrapper that handles thought title display
const FileViewerModal: React.FC<{ file: DriveFile; fileMetadataMap: Map<string, any>; onClose: () => void; onDownload: () => void }> = ({ file, fileMetadataMap, onClose, onDownload }) => {
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
        console.error('[FileViewerModal] Failed to load thought title:', err);
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
const FileViewer: React.FC<{ file: DriveFile; accountId: string; onDownload: () => void }> = ({ file, accountId, onDownload }) => {
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
          console.log('[FileViewer] Skipping load for uploading file:', file.id);
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

        const fileUrl = `${API_ENDPOINT}/api/drive/files/${file.id}?accountId=${accountId}&download=true`;
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[FileViewer] Failed to load file: ${response.status} - ${errorText}`);
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

interface FileStorageAggregatorProps {
  authenticatedUser?: {
    id: string;
    pnName?: string;
    publicKey?: string;
    nickname?: string;
    accessToken?: string;
  } | null;
  hideSecureFolderSection?: boolean;
  onOpenTextEditor?: (accountId: string) => void;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ 
  authenticatedUser, 
  hideSecureFolderSection = false,
  onOpenTextEditor
}) => {
  const { userState } = useUserState();
  const [isLoading, setIsLoading] = useState(false);
  const [filesByAccount, setFilesByAccount] = useState<Map<string, DriveFile[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const { accounts: driveAccounts, selectedId: selectedAccountId, setSelectedId: setSelectedAccountId, setAccounts: setDriveAccounts } = useDriveAccounts({
    authenticatedUserId: authenticatedUser?.id,
    userState: { isUnlocked: userState.isUnlocked, pnIdentifier: userState.pnIdentifier },
  });
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showAddMenuFor, setShowAddMenuFor] = useState<string | null>(null);
  const [addMenuPosition, setAddMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [isCollectionMode, setIsCollectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [collectionFileOrder, setCollectionFileOrder] = useState<Map<string, number>>(new Map());
  const [showCollectionMetadataModal, setShowCollectionMetadataModal] = useState(false);
  const [pendingCollectionData, setPendingCollectionData] = useState<{ accountId: string; fileIds: string[] } | null>(null);
  const [showUnencryptedAlert, setShowUnencryptedAlert] = useState(false);
  const [pendingUnencryptedUpload, setPendingUnencryptedUpload] = useState<{ file: File; accountId: string; limitMb: number } | null>(null);
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const addButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Subscribe to upload queue for optimistic UI updates
  useEffect(() => {
    const handleTaskAdded = (task: any) => {
      // Create placeholder file entry for optimistic UI
      if (task.type === 'file' && task.file) {
        const placeholderFile: DriveFile = {
          id: `uploading_${task.id}`, // Temporary ID
          name: task.file.name,
          mimeType: task.file.type || 'application/octet-stream',
          size: `${Math.round(task.file.size / 1024)} KB`,
          accountId: task.accountId,
          isUploading: true,
          uploadProgress: 0,
          uploadTaskId: task.id,
          modifiedTime: new Date().toISOString(),
        };

        setFilesByAccount(prev => {
          const newMap = new Map(prev);
          const accountFiles = newMap.get(task.accountId) || [];
          // Add placeholder at the beginning of the list
          newMap.set(task.accountId, [placeholderFile, ...accountFiles]);
          return newMap;
        });
      } else if (task.type === 'textPost' && task.textPost) {
        // For text posts, create a placeholder with the content preview
        const placeholderFile: DriveFile = {
          id: `uploading_${task.id}`,
          name: task.metadata?.name || task.textPost.content?.substring(0, 50) || 'New Thought',
          mimeType: 'application/json',
          size: '0 KB',
          accountId: task.accountId,
          isUploading: true,
          uploadProgress: 0,
          uploadTaskId: task.id,
          modifiedTime: new Date().toISOString(),
        };

        setFilesByAccount(prev => {
          const newMap = new Map(prev);
          const accountFiles = newMap.get(task.accountId) || [];
          newMap.set(task.accountId, [placeholderFile, ...accountFiles]);
          return newMap;
        });
      }
    };

    const handleTaskUpdated = (task: any) => {
      // Update progress for placeholder files
      if (task.status === 'processing' || task.status === 'uploading') {
        setFilesByAccount(prev => {
          const newMap = new Map(prev);
          const accountFiles = newMap.get(task.accountId) || [];
          const updatedFiles = accountFiles.map(file => {
            if (file.uploadTaskId === task.id) {
              return { ...file, uploadProgress: task.progress };
            }
            return file;
          });
          newMap.set(task.accountId, updatedFiles);
          return newMap;
        });
      } else if (task.status === 'completed' || task.status === 'failed') {
        // Remove placeholder and refresh file list when upload completes or fails
        setFilesByAccount(prev => {
          const newMap = new Map(prev);
          const accountFiles = newMap.get(task.accountId) || [];
          // Remove placeholder file
          const filteredFiles = accountFiles.filter(file => file.uploadTaskId !== task.id);
          newMap.set(task.accountId, filteredFiles);
          return newMap;
        });

        // Refresh file list to get the actual uploaded file (or confirm it's gone if failed)
        if (task.status === 'completed' && task.accountId) {
          // Small delay to ensure server has processed the upload
          setTimeout(() => {
            loadFilesForAccount(task.accountId);
          }, 500);
        }
      }
    };

    const handleTaskProgress = ({ id, progress }: { id: string; progress: number }) => {
      // Update progress for all accounts (we'll need to find which account the task belongs to)
      const task = uploadQueueService.getTask(id);
      if (task) {
        setFilesByAccount(prev => {
          const newMap = new Map(prev);
          const accountFiles = newMap.get(task.accountId) || [];
          const updatedFiles = accountFiles.map(file => {
            if (file.uploadTaskId === id) {
              return { ...file, uploadProgress: progress };
            }
            return file;
          });
          newMap.set(task.accountId, updatedFiles);
          return newMap;
        });
      }
    };

    // Subscribe to upload queue events
    uploadQueueService.on('taskAdded', handleTaskAdded);
    uploadQueueService.on('taskUpdated', handleTaskUpdated);
    uploadQueueService.on('taskProgress', handleTaskProgress);

    // Cleanup - defensive check for .off() method availability
    return () => {
      try {
        if (typeof uploadQueueService.off === 'function') {
          uploadQueueService.off('taskAdded', handleTaskAdded);
          uploadQueueService.off('taskUpdated', handleTaskUpdated);
          uploadQueueService.off('taskProgress', handleTaskProgress);
        } else if (typeof uploadQueueService.removeListener === 'function') {
          uploadQueueService.removeListener('taskAdded', handleTaskAdded);
          uploadQueueService.removeListener('taskUpdated', handleTaskUpdated);
          uploadQueueService.removeListener('taskProgress', handleTaskProgress);
        }
      } catch (error) {
        console.warn('[FileStorageAggregator] Error removing upload queue listeners:', error);
      }
    };
  }, []); // Empty deps - only subscribe once

  // Load files for a specific account
  const loadFilesForAccount = async (accountId: string) => {
    if (!authenticatedUser?.id) {
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        setError('Please connect your pN to view files');
        return;
      }

      // Server will automatically filter to files in the pN folder if no query is provided
      const response = await fetch(`${API_ENDPOINT}/api/drive/files?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        // Token might be invalid, try refreshing (force refresh even if not expired)
        // Force refresh the token
        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
        if (!refreshedToken) {
          setError('Your session has expired. Please unlock your pN again to continue.');
          return;
        }
        
        // Retry with refreshed token
        const retryResponse = await fetch(`${API_ENDPOINT}/api/drive/files?accountId=${accountId}`, {
          headers: {
            'Authorization': `Bearer ${refreshedToken}`
          }
        });
        
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text().catch(() => 'Unknown error');
          throw new Error(`Failed to load files: ${retryResponse.statusText} - ${errorText}`);
        }
        
        const retryData = await retryResponse.json();
        const allFiles = (retryData.files || []).map((file: DriveFile) => ({
          ...file,
          accountId,
          displayName: file.name.replace(/\.encrypted$/i, '')
        }));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} files from API, checking for folders...`);
        const folders = allFiles.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
        console.log(`[FileStorageAggregator] Found ${folders.length} folders:`, folders.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        console.log(`[FileStorageAggregator] All files:`, allFiles.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        
        // Separate thumbnails and main files
        const thumbnails = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thumb_') && name.endsWith('.encrypted');
        });
        
        const mainFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return !name.startsWith('thumb_');
        });
        
        const regularThumbnails = thumbnails;
        
        // Separate thought thumbnails from regular thumbnails
        const thoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return name.startsWith('thumb_thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'));
        });
        
        const nonThoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          // Exclude thought thumbnails
          if (name.startsWith('thumb_thought-')) {
            return false;
          }
          // Exclude PDF page thumbnails (format: thumb_filename-page-N.png.encrypted)
          if (name.match(/thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i)) {
            return false;
          }
          return true;
        });
        
        // Map regular (non-thought) thumbnails to their main files and create display entries
        const thumbnailEntries = nonThoughtThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find main file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          
          // Find the corresponding main file
          const mainFile = mainFiles.find((mf: DriveFile) => {
            const mainFileName = mf.name.replace(/\.encrypted$/i, '');
            return mainFileName === thumbNameWithoutPrefix;
          });
          
          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');
          
          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: mainFile?.id || thumb.id, // Use main file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });
        
        // Map thought thumbnails to thought files
        // Exclude thought-collection files (they're handled separately)
        const thoughtFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thought-') && 
                 (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted')) &&
                 !name.endsWith('.thought-collection.encrypted'); // Exclude thought collections
        });
        
        // Filter out thought-collection files from main files (they should never appear individually)
        const thoughtCollectionFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.endsWith('.thought-collection.encrypted');
        });
        
        console.log(`[FileStorageAggregator] Found ${thoughtCollectionFiles.length} thought-collection files (will be excluded)`);
        
        // Map thought thumbnails to thought files and load metadata to check if they're part of collections
        const thoughtThumbnailEntries = await Promise.all(
          thoughtThumbnails.map(async (thumb: DriveFile) => {
            // Remove "thumb_" prefix, ".encrypted" suffix, and file extension to get base name
            const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
            
            // Find the corresponding thought file by comparing base names (ignoring extension differences)
            const thoughtFile = thoughtFiles.find((tf: DriveFile) => {
              const thoughtFileNameBase = tf.name.replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
              return thoughtFileNameBase === thumbNameBase;
            });
            
            // Check thumbnail metadata to see if it's part of a collection and get fileType
            let isPartOfCollection = false;
            let fileType: string | undefined;
            let mainFileType: string | undefined;
            let mainFileIdFromMetadata: string | undefined;
            try {
              const thumbMetadata = await loadFileMetadata(thumb.id);
              isPartOfCollection = thumbMetadata?.isPartOfCollection === true;
              fileType = thumbMetadata?.fileType; // Capture fileType for filtering
              mainFileIdFromMetadata = thumbMetadata?.mainFileId; // Get mainFileId from metadata
              
              // Also check the main file's type if mainFileId exists (from metadata or thoughtFile)
              const actualMainFileId = mainFileIdFromMetadata || thoughtFile?.id;
              if (actualMainFileId) {
                try {
                  const mainMetadata = await loadFileMetadata(actualMainFileId);
                  mainFileType = mainMetadata?.fileType;
                  console.log(`[FileStorageAggregator] Loaded main file metadata for thumbnail ${thumb.id}: mainFileId=${actualMainFileId}, mainFileType=${mainFileType}`);
                } catch (err) {
                  console.warn(`[FileStorageAggregator] Failed to load main file metadata for ${actualMainFileId}:`, err);
                }
              }
              
              console.log(`[FileStorageAggregator] Thumbnail ${thumb.id} (${thumb.name}): fileType=${fileType}, isPartOfCollection=${isPartOfCollection}, mainFileId=${actualMainFileId}, mainFileType=${mainFileType}`);
            } catch (err) {
              console.warn(`[FileStorageAggregator] Failed to load thumbnail metadata for ${thumb.id}:`, err);
            }
            
            // Clean display name: remove thumb_ prefix and file extension
            let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
            // Remove file extension
            displayName = displayName.replace(/\.[^.]+$/, '');
            
            return {
              ...thumb,
              isThumbnail: true,
              mainFileId: mainFileIdFromMetadata || thoughtFile?.id || thumb.id, // Prefer mainFileId from metadata
              displayName: displayName,
              isPartOfCollection: isPartOfCollection,
              fileType: fileType, // Store fileType for filtering
              mainFileType: mainFileType // Store main file's fileType for filtering
            };
          })
        );
        
        // Detect collections by filename pattern
        const collectionFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('collection-') && name.endsWith('.collection.encrypted');
        });
        
        // Load metadata for collections to get fileType and collection data
        const collectionFilesWithMetadata = await Promise.all(
          collectionFiles.map(async (file: DriveFile) => {
            try {
              const metadata = await loadFileMetadata(file.id);
              const isThoughtCollection = metadata?.isThoughtCollection === true;
              console.log(`[FileStorageAggregator] Loaded collection metadata for ${file.id}:`, {
                name: metadata?.name || metadata?.title,
                isThoughtCollection: isThoughtCollection,
                metadataIsThoughtCollection: metadata?.isThoughtCollection,
                collectionFileIds: metadata?.collection?.collectionFileIds?.length || 0
              });
              return {
                ...file,
                fileType: metadata?.fileType || 'collection',
                collection: metadata?.collection,
                isThoughtCollection: isThoughtCollection, // Preserve thought collection flag
                displayName: metadata?.name || metadata?.title || file.name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '')
              };
            } catch (err) {
              console.warn(`[FileStorageAggregator] Failed to load metadata for collection ${file.id}:`, err);
              return {
                ...file,
                fileType: 'collection',
                displayName: file.name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '')
              };
            }
          })
        );
        
        // Build set of fileIds (thumbnails and thought files) that are part of THOUGHT COLLECTIONS (to exclude them from individual display)
        // Only filter out thoughts that are in thought collections (multi-page thoughts), not regular collections or single thoughts
        // This way manually created collections still show their individual files, and single thoughts are visible
        const thoughtFilesInCollections = new Set<string>();
        const thumbnailIdsInCollections = new Set<string>(); // Track thumbnail IDs that are in thought collections
        
        collectionFilesWithMetadata.forEach((collectionFile: any) => {
          const collectionData = collectionFile.collection;
          if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
            return; // Skip collections without valid collectionFileIds
          }
          
          // Only filter files from thought collections, not regular collections
          // IMPORTANT: Only collections explicitly marked as thought collections should filter their files
          // Regular collections (manually created) and collections without the flag should not filter
          const isThoughtCollection = collectionFile.isThoughtCollection === true;
          
          // FALLBACK: If isThoughtCollection flag is not set, check if ALL collectionFileIds are thought thumbnails
          // This handles cases where the flag wasn't saved correctly or collections created before the flag existed
          let shouldTreatAsThoughtCollection = isThoughtCollection;
          if (!shouldTreatAsThoughtCollection) {
            // Check if all collectionFileIds are thought thumbnails
            const allAreThoughtThumbnails = collectionData.collectionFileIds.every((fileId: string) => {
              return thoughtThumbnailEntries.some((entry: any) => entry.id === fileId);
            });
            if (allAreThoughtThumbnails && collectionData.collectionFileIds.length > 0) {
              shouldTreatAsThoughtCollection = true;
              console.log(`[FileStorageAggregator] Collection ${collectionFile.id} detected as thought collection (fallback: all ${collectionData.collectionFileIds.length} files are thought thumbnails)`);
            }
          }
          
          if (!shouldTreatAsThoughtCollection) {
            console.log(`[FileStorageAggregator] Skipping collection ${collectionFile.id} - not a thought collection (isThoughtCollection: ${isThoughtCollection})`);
            return; // Skip regular collections - their files should still be visible
          }
          
          console.log(`[FileStorageAggregator] Processing thought collection ${collectionFile.id} with ${collectionData.collectionFileIds.length} files`);
          // Check each fileId in the collection - EXCLUDE ALL OF THEM from individual display
          collectionData.collectionFileIds.forEach((fileId: string) => {
            // ALWAYS add the fileId to thumbnailIdsInCollections (for multi-page thoughts, collections use thumbnail fileIds)
            // This ensures the thumbnail itself is excluded
            thumbnailIdsInCollections.add(fileId);
            console.log(`[FileStorageAggregator] Marking thumbnail ${fileId} as part of thought collection (direct exclusion)`);
            
            // Try to find the corresponding thought thumbnail entry to get the mainFileId
            const thoughtThumbnail = thoughtThumbnailEntries.find((entry: any) => entry.id === fileId);
            if (thoughtThumbnail?.mainFileId) {
              thoughtFilesInCollections.add(thoughtThumbnail.mainFileId);
              console.log(`[FileStorageAggregator] Marking thought file ${thoughtThumbnail.mainFileId} as part of thought collection (via thumbnail ${fileId})`);
            } else {
              // If we can't find it in thoughtThumbnailEntries, check if it's a thought file directly
              const fileInCollection = allFiles.find((f: DriveFile) => f.id === fileId);
              if (fileInCollection) {
                const fileName = fileInCollection.name.toLowerCase();
                if (fileName.startsWith('thought-') && (fileName.endsWith('.thought.encrypted') || fileName.endsWith('.png.encrypted'))) {
                  thoughtFilesInCollections.add(fileId);
                  console.log(`[FileStorageAggregator] Marking thought file ${fileId} as part of thought collection (direct file match)`);
                }
              }
            }
          });
        });
        
        console.log(`[FileStorageAggregator] Filtering: ${thoughtThumbnailEntries.length} total thought thumbnails, ${thumbnailIdsInCollections.size} in collections, ${thoughtFilesInCollections.size} thought files in collections`);
        
        // Filter to show thumbnails (representing main files), thought thumbnails, and collections
        // IMPORTANT: Exclude collections from allFiles since they're already added via collectionFilesWithMetadata
        // Exclude thought-collection-thumbnail fileType (these are pages in multi-page thought collections)
        // Single thoughts (fileType: 'image' with isThoughtThumbnail) should remain visible
        const filteredThoughtThumbnailEntries = thoughtThumbnailEntries.filter((entry: any) => {
          // Use fileType from entry (loaded during mapping) or fallback to fileMetadataMap
          const fileType = entry.fileType || fileMetadataMap.get(entry.id)?.fileType;
          const mainFileType = entry.mainFileType || (entry.mainFileId ? fileMetadataMap.get(entry.mainFileId)?.fileType : undefined);
          
          // Also check filename pattern as a fallback - thought collection thumbnails have "-page-" in the name
          const isPageThumbnail = entry.name && /thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i.test(entry.name.toLowerCase());
          
          // Exclude if:
          // 1. fileType is 'thought-collection-thumbnail' (collection thought pages)
          // 2. mainFileType is 'thought-collection' (thumbnails from thought collections)
          // 3. Filename matches page thumbnail pattern (thumb_*-page-N.png.encrypted) AND it's a thought thumbnail
          // 4. Thumbnail ID is in a thought collection (fallback for existing data)
          // 5. mainFileId is in a thought collection (fallback for existing data)
          const isCollectionThought = fileType === 'thought-collection-thumbnail' ||
                                     mainFileType === 'thought-collection' ||
                                     (isPageThumbnail && entry.name.toLowerCase().includes('thumb_thought')) ||
                                     thumbnailIdsInCollections.has(entry.id) || 
                                     thoughtFilesInCollections.has(entry.mainFileId);
          if (isCollectionThought) {
            console.log(`[FileStorageAggregator] Filtering out thought thumbnail ${entry.id} (name: ${entry.name}, fileType: ${fileType}, mainFileId: ${entry.mainFileId}, mainFileType: ${mainFileType}, isPageThumbnail: ${isPageThumbnail}) - collection thought`);
          }
          return !isCollectionThought;
        });
        
        console.log(`[FileStorageAggregator] After filtering: ${filteredThoughtThumbnailEntries.length} thought thumbnails will be displayed`);
        const collectionFileIds = new Set(collectionFiles.map((f: any) => f.id));
        const mediaFiles = thumbnailEntries.concat(filteredThoughtThumbnailEntries).concat(collectionFilesWithMetadata).concat(
          allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Exclude collections - they're already added via collectionFilesWithMetadata
          if (collectionFileIds.has(file.id)) {
            return false;
          }
          
          // Exclude thought files that are part of collections (multi-page thoughts)
          // Check fileType first - collection thoughts have fileType 'thought-collection-page'
          // This prevents showing individual pages when they're already in a collection
          // Media files in collections are NOT excluded (so manually created collections still show their files)
          
          // Check metadata for fileType
          const fileMetadata = fileMetadataMap.get(file.id);
          const fileType = fileMetadata?.fileType;
          
          // Exclude if fileType is 'thought-collection-page' or 'thought-collection' (collection thought pages or main collection file)
          if (fileType === 'thought-collection-page' || fileType === 'thought-collection') {
            return false;
          }
          
          // Fallback: exclude if in thoughtFilesInCollections (for existing data)
          if (thoughtFilesInCollections.has(file.id)) {
            return false;
          }
          
          // Exclude thought-collection files by extension (they should never appear individually)
          if (name.endsWith('.thought-collection.encrypted')) {
            console.log(`[FileStorageAggregator] Filtering out thought-collection file ${file.id} by extension`);
            return false;
          }
          
          // Include thoughts that don't have thumbnails (legacy thoughts)
          // Only include single thoughts (fileType: 'thought'), not collection thoughts
          if (name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'))) {
            // Exclude if it's a collection thought (by fileType check as fallback)
            if (fileType === 'thought-collection-page' || fileType === 'thought-collection') {
              return false;
            }
            
            // Check if this thought has a thumbnail
            // Remove .encrypted suffix and file extension (.thought or .png) to get base name
            const thoughtNameBase = name.replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
            const hasThumbnail = thoughtThumbnails.some((thumb: DriveFile) => {
              // Remove thumb_ prefix, .encrypted suffix, and file extension to get base name
              const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
              return thumbNameBase === thoughtNameBase;
            });
            // Only include thoughts without thumbnails (legacy thoughts)
            return !hasThumbnail;
          }
          
          // Exclude everything else (main files already have thumbnails, collections already included)
          return false;
        })
        );
        
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
          accountId, // Tag each file with its account ID
          // Store original name for display (remove .encrypted suffix)
          displayName: file.name.replace(/\.encrypted$/i, '')
        }));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} files from API, checking for folders...`);
        const folders = allFiles.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
        console.log(`[FileStorageAggregator] Found ${folders.length} folders:`, folders.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        console.log(`[FileStorageAggregator] All files:`, allFiles.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        
        // Separate thumbnails and main files
        const thumbnails = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thumb_') && name.endsWith('.encrypted');
        });
        
        const mainFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return !name.startsWith('thumb_');
        });
        
        const regularThumbnails = thumbnails;
        
        // Separate thought thumbnails from regular thumbnails
        const thoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return name.startsWith('thumb_thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'));
        });
        
        const nonThoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          // Exclude thought thumbnails
          if (name.startsWith('thumb_thought-')) {
            return false;
          }
          // Exclude PDF page thumbnails (format: thumb_filename-page-N.png.encrypted)
          if (name.match(/thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i)) {
            return false;
          }
          return true;
        });
        
        // Map regular (non-thought) thumbnails to their main files and create display entries
        const thumbnailEntries = nonThoughtThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find main file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          
          // Find the corresponding main file
          const mainFile = mainFiles.find((mf: DriveFile) => {
            const mainFileName = mf.name.replace(/\.encrypted$/i, '');
            return mainFileName === thumbNameWithoutPrefix;
          });
          
          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');
          
          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: mainFile?.id || thumb.id, // Use main file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });
        
        // Map thought thumbnails to thought files
        // Exclude thought-collection files (they're handled separately)
        const thoughtFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thought-') && 
                 (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted')) &&
                 !name.endsWith('.thought-collection.encrypted'); // Exclude thought collections
        });
        
        // Filter out thought-collection files from main files (they should never appear individually)
        const thoughtCollectionFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.endsWith('.thought-collection.encrypted');
        });
        
        console.log(`[FileStorageAggregator] Found ${thoughtCollectionFiles.length} thought-collection files (will be excluded)`);
        
        // Map thought thumbnails to thought files and load metadata to check if they're part of collections
        const thoughtThumbnailEntries = await Promise.all(
          thoughtThumbnails.map(async (thumb: DriveFile) => {
            // Remove "thumb_" prefix, ".encrypted" suffix, and file extension to get base name
            const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
            
            // Find the corresponding thought file by comparing base names (ignoring extension differences)
            const thoughtFile = thoughtFiles.find((tf: DriveFile) => {
              const thoughtFileNameBase = tf.name.replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
              return thoughtFileNameBase === thumbNameBase;
            });
            
            // Check thumbnail metadata to see if it's part of a collection and get fileType
            let isPartOfCollection = false;
            let fileType: string | undefined;
            let mainFileType: string | undefined;
            let mainFileIdFromMetadata: string | undefined;
            try {
              const thumbMetadata = await loadFileMetadata(thumb.id);
              isPartOfCollection = thumbMetadata?.isPartOfCollection === true;
              fileType = thumbMetadata?.fileType; // Capture fileType for filtering
              mainFileIdFromMetadata = thumbMetadata?.mainFileId; // Get mainFileId from metadata
              
              // Also check the main file's type if mainFileId exists (from metadata or thoughtFile)
              const actualMainFileId = mainFileIdFromMetadata || thoughtFile?.id;
              if (actualMainFileId) {
                try {
                  const mainMetadata = await loadFileMetadata(actualMainFileId);
                  mainFileType = mainMetadata?.fileType;
                  console.log(`[FileStorageAggregator] Loaded main file metadata for thumbnail ${thumb.id}: mainFileId=${actualMainFileId}, mainFileType=${mainFileType}`);
                } catch (err) {
                  console.warn(`[FileStorageAggregator] Failed to load main file metadata for ${actualMainFileId}:`, err);
                }
              }
              
              console.log(`[FileStorageAggregator] Thumbnail ${thumb.id} (${thumb.name}): fileType=${fileType}, isPartOfCollection=${isPartOfCollection}, mainFileId=${actualMainFileId}, mainFileType=${mainFileType}`);
            } catch (err) {
              console.warn(`[FileStorageAggregator] Failed to load thumbnail metadata for ${thumb.id}:`, err);
            }
            
            // Clean display name: remove thumb_ prefix and file extension
            let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
            // Remove file extension
            displayName = displayName.replace(/\.[^.]+$/, '');
            
            return {
              ...thumb,
              isThumbnail: true,
              mainFileId: mainFileIdFromMetadata || thoughtFile?.id || thumb.id, // Prefer mainFileId from metadata
              displayName: displayName,
              isPartOfCollection: isPartOfCollection,
              fileType: fileType, // Store fileType for filtering
              mainFileType: mainFileType // Store main file's fileType for filtering
            };
          })
        );
        
        // Detect collections by filename pattern
        const collectionFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('collection-') && name.endsWith('.collection.encrypted');
        });
        
        // Load metadata for collections to get fileType and collection data
        const collectionFilesWithMetadata = await Promise.all(
          collectionFiles.map(async (file: DriveFile) => {
            try {
              const metadata = await loadFileMetadata(file.id);
              const isThoughtCollection = metadata?.isThoughtCollection === true;
              console.log(`[FileStorageAggregator] Loaded collection metadata for ${file.id}:`, {
                name: metadata?.name || metadata?.title,
                isThoughtCollection: isThoughtCollection,
                metadataIsThoughtCollection: metadata?.isThoughtCollection,
                collectionFileIds: metadata?.collection?.collectionFileIds?.length || 0
              });
              return {
                ...file,
                fileType: metadata?.fileType || 'collection',
                collection: metadata?.collection,
                isThoughtCollection: isThoughtCollection, // Preserve thought collection flag
                displayName: metadata?.name || metadata?.title || file.name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '')
              };
            } catch (err) {
              console.warn(`[FileStorageAggregator] Failed to load metadata for collection ${file.id}:`, err);
              return {
                ...file,
                fileType: 'collection',
                displayName: file.name.replace(/\.encrypted$/i, '').replace(/\.collection$/i, '')
              };
            }
          })
        );
        
        // Build set of fileIds (thumbnails and thought files) that are part of THOUGHT COLLECTIONS (to exclude them from individual display)
        // Only filter out thoughts that are in thought collections (multi-page thoughts), not regular collections or single thoughts
        // This way manually created collections still show their individual files, and single thoughts are visible
        const thoughtFilesInCollections = new Set<string>();
        const thumbnailIdsInCollections = new Set<string>(); // Track thumbnail IDs that are in thought collections
        
        collectionFilesWithMetadata.forEach((collectionFile: any) => {
          const collectionData = collectionFile.collection;
          if (!collectionData?.collectionFileIds || !Array.isArray(collectionData.collectionFileIds)) {
            return; // Skip collections without valid collectionFileIds
          }
          
          // Only filter files from thought collections, not regular collections
          // IMPORTANT: Only collections explicitly marked as thought collections should filter their files
          // Regular collections (manually created) and collections without the flag should not filter
          const isThoughtCollection = collectionFile.isThoughtCollection === true;
          
          // FALLBACK: If isThoughtCollection flag is not set, check if ALL collectionFileIds are thought thumbnails
          // This handles cases where the flag wasn't saved correctly or collections created before the flag existed
          let shouldTreatAsThoughtCollection = isThoughtCollection;
          if (!shouldTreatAsThoughtCollection) {
            // Check if all collectionFileIds are thought thumbnails
            const allAreThoughtThumbnails = collectionData.collectionFileIds.every((fileId: string) => {
              return thoughtThumbnailEntries.some((entry: any) => entry.id === fileId);
            });
            if (allAreThoughtThumbnails && collectionData.collectionFileIds.length > 0) {
              shouldTreatAsThoughtCollection = true;
              console.log(`[FileStorageAggregator] Collection ${collectionFile.id} detected as thought collection (fallback: all ${collectionData.collectionFileIds.length} files are thought thumbnails)`);
            }
          }
          
          if (!shouldTreatAsThoughtCollection) {
            console.log(`[FileStorageAggregator] Skipping collection ${collectionFile.id} - not a thought collection (isThoughtCollection: ${isThoughtCollection})`);
            return; // Skip regular collections - their files should still be visible
          }
          
          console.log(`[FileStorageAggregator] Processing thought collection ${collectionFile.id} with ${collectionData.collectionFileIds.length} files`);
          // Check each fileId in the collection - EXCLUDE ALL OF THEM from individual display
          collectionData.collectionFileIds.forEach((fileId: string) => {
            // ALWAYS add the fileId to thumbnailIdsInCollections (for multi-page thoughts, collections use thumbnail fileIds)
            // This ensures the thumbnail itself is excluded
            thumbnailIdsInCollections.add(fileId);
            console.log(`[FileStorageAggregator] Marking thumbnail ${fileId} as part of thought collection (direct exclusion)`);
            
            // Try to find the corresponding thought thumbnail entry to get the mainFileId
            const thoughtThumbnail = thoughtThumbnailEntries.find((entry: any) => entry.id === fileId);
            if (thoughtThumbnail?.mainFileId) {
              thoughtFilesInCollections.add(thoughtThumbnail.mainFileId);
              console.log(`[FileStorageAggregator] Marking thought file ${thoughtThumbnail.mainFileId} as part of thought collection (via thumbnail ${fileId})`);
            } else {
              // If we can't find it in thoughtThumbnailEntries, check if it's a thought file directly
              const fileInCollection = allFiles.find((f: DriveFile) => f.id === fileId);
              if (fileInCollection) {
                const fileName = fileInCollection.name.toLowerCase();
                if (fileName.startsWith('thought-') && (fileName.endsWith('.thought.encrypted') || fileName.endsWith('.png.encrypted'))) {
                  thoughtFilesInCollections.add(fileId);
                  console.log(`[FileStorageAggregator] Marking thought file ${fileId} as part of thought collection (direct file match)`);
                }
              }
            }
          });
        });
        
        console.log(`[FileStorageAggregator] Filtering: ${thoughtThumbnailEntries.length} total thought thumbnails, ${thumbnailIdsInCollections.size} in collections, ${thoughtFilesInCollections.size} thought files in collections`);
        
        // Filter to show thumbnails (representing main files), thought thumbnails, and collections
        // IMPORTANT: Exclude collections from allFiles since they're already added via collectionFilesWithMetadata
        // Exclude thought-collection-thumbnail fileType (these are pages in multi-page thought collections)
        // Single thoughts (fileType: 'image' with isThoughtThumbnail) should remain visible
        const filteredThoughtThumbnailEntries = thoughtThumbnailEntries.filter((entry: any) => {
          // Use fileType from entry (loaded during mapping) or fallback to fileMetadataMap
          const fileType = entry.fileType || fileMetadataMap.get(entry.id)?.fileType;
          const mainFileType = entry.mainFileType || (entry.mainFileId ? fileMetadataMap.get(entry.mainFileId)?.fileType : undefined);
          
          // Also check filename pattern as a fallback - thought collection thumbnails have "-page-" in the name
          const isPageThumbnail = entry.name && /thumb_.*-page-\d+\.(png|jpg|jpeg)\.encrypted$/i.test(entry.name.toLowerCase());
          
          // Exclude if:
          // 1. fileType is 'thought-collection-thumbnail' (collection thought pages)
          // 2. mainFileType is 'thought-collection' (thumbnails from thought collections)
          // 3. Filename matches page thumbnail pattern (thumb_*-page-N.png.encrypted) AND it's a thought thumbnail
          // 4. Thumbnail ID is in a thought collection (fallback for existing data)
          // 5. mainFileId is in a thought collection (fallback for existing data)
          const isCollectionThought = fileType === 'thought-collection-thumbnail' ||
                                     mainFileType === 'thought-collection' ||
                                     (isPageThumbnail && entry.name.toLowerCase().includes('thumb_thought')) ||
                                     thumbnailIdsInCollections.has(entry.id) || 
                                     thoughtFilesInCollections.has(entry.mainFileId);
          if (isCollectionThought) {
            console.log(`[FileStorageAggregator] Filtering out thought thumbnail ${entry.id} (name: ${entry.name}, fileType: ${fileType}, mainFileId: ${entry.mainFileId}, mainFileType: ${mainFileType}, isPageThumbnail: ${isPageThumbnail}) - collection thought`);
          }
          return !isCollectionThought;
        });
        
        console.log(`[FileStorageAggregator] After filtering: ${filteredThoughtThumbnailEntries.length} thought thumbnails will be displayed`);
        const collectionFileIds = new Set(collectionFiles.map((f: any) => f.id));
        const mediaFiles = thumbnailEntries.concat(filteredThoughtThumbnailEntries).concat(collectionFilesWithMetadata).concat(
          allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Exclude collections - they're already added via collectionFilesWithMetadata
          if (collectionFileIds.has(file.id)) {
            return false;
          }
          
          // Exclude thought files that are part of collections (multi-page thoughts)
          // Check fileType first - collection thoughts have fileType 'thought-collection-page'
          // This prevents showing individual pages when they're already in a collection
          // Media files in collections are NOT excluded (so manually created collections still show their files)
          
          // Check metadata for fileType
          const fileMetadata = fileMetadataMap.get(file.id);
          const fileType = fileMetadata?.fileType;
          
          // Exclude if fileType is 'thought-collection-page' or 'thought-collection' (collection thought pages or main collection file)
          if (fileType === 'thought-collection-page' || fileType === 'thought-collection') {
            return false;
          }
          
          // Fallback: exclude if in thoughtFilesInCollections (for existing data)
          if (thoughtFilesInCollections.has(file.id)) {
            return false;
          }
          
          // Exclude thought-collection files by extension (they should never appear individually)
          if (name.endsWith('.thought-collection.encrypted')) {
            console.log(`[FileStorageAggregator] Filtering out thought-collection file ${file.id} by extension`);
            return false;
          }
          
          // Include thoughts that don't have thumbnails (legacy thoughts)
          // Only include single thoughts (fileType: 'thought'), not collection thoughts
          if (name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'))) {
            // Exclude if it's a collection thought (by fileType check as fallback)
            if (fileType === 'thought-collection-page' || fileType === 'thought-collection') {
              return false;
            }
            
            // Check if this thought has a thumbnail
            // Remove .encrypted suffix and file extension (.thought or .png) to get base name
            const thoughtNameBase = name.replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
            const hasThumbnail = thoughtThumbnails.some((thumb: DriveFile) => {
              // Remove thumb_ prefix, .encrypted suffix, and file extension to get base name
              const thumbNameBase = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '').replace(/\.(thought|png)$/i, '');
              return thumbNameBase === thoughtNameBase;
            });
            // Only include thoughts without thumbnails (legacy thoughts)
            return !hasThumbnail;
          }
          
          // Exclude everything else (main files already have thumbnails, collections already included)
          return false;
        })
        );
        
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

    // Skip download for files that are still uploading
    if (file.id.startsWith('uploading_') || (file as any).isUploading) {
      console.log('[FileStorageAggregator] Cannot download file that is still uploading');
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Use main file ID if this is a thumbnail, otherwise use file ID
      const fileIdToDownload = file.mainFileId || file.id;
      
      // Get the original filename for download
      let downloadFileName = file.name;
      if (file.isThumbnail) {
        // For thumbnails, try to get the original filename from metadata
        try {
          const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileIdToDownload}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            if (metadata.metadata?.name) {
              downloadFileName = metadata.metadata.name;
            } else {
              // Fallback: reconstruct from display name (add back extension if we can infer it)
              downloadFileName = file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
            }
          } else {
            // Fallback: reconstruct from display name
              downloadFileName = file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          }
        } catch (metadataError) {
          // Fallback: reconstruct from display name
              downloadFileName = file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
        }
      }

      const response = await fetch(`${API_ENDPOINT}/api/drive/files/${fileIdToDownload}?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFileName;
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

  // Edit Metadata state
  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    tags: string;
    genre: string;
    category: FeedCategory | ''; // Keep for backward compatibility
    categories: FeedCategory[]; // New array format
    isNSFW: boolean;
    locationName: string;
    locationAddress: string;
    license: string;
  }>({
    name: '',
    description: '',
    tags: '',
    genre: '',
    category: '',
    categories: [],
    isNSFW: false,
    locationName: '',
    locationAddress: '',
    license: 'all-rights-reserved'
  });
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, any>>(new Map());

  // Share Settings state
  const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);
  const [sharingAccountId, setSharingAccountId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'private'>('private');
  const [shareNSFW, setShareNSFW] = useState<boolean>(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [thirdPartyIndexers, setThirdPartyIndexers] = useState<any[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [indexingPermissionsState, setIndexingPermissionsState] = useState<any>(null);
  const [isLoadingIndexers, setIsLoadingIndexers] = useState(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);

  // Load file metadata
  const loadFileMetadata = async (fileId: string) => {
    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return null;

      const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const metadata = await response.json();
        const finalMetadata = metadata.metadata || metadata;
        
        // Debug logging for collections to check isThoughtCollection flag
        if (finalMetadata?.fileType === 'collection') {
          console.log(`[FileStorageAggregator] loadFileMetadata for collection ${fileId}:`, {
            rawResponse: metadata,
            finalMetadata: finalMetadata,
            hasIsThoughtCollection: 'isThoughtCollection' in finalMetadata,
            isThoughtCollectionValue: finalMetadata.isThoughtCollection,
            isThoughtCollectionType: typeof finalMetadata.isThoughtCollection,
            allKeys: Object.keys(finalMetadata)
          });
        }
        
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(fileId, finalMetadata);
          return next;
        });
        return finalMetadata;
      } else if (response.status === 404) {
        // Metadata doesn't exist yet, return null
        return null;
      }
    } catch (err) {
      console.error('[FileStorageAggregator] Failed to load metadata:', err);
    }
    return null;
  };

  // Load third-party indexers
  const loadThirdPartyIndexers = async (fileId: string) => {
    setIsLoadingIndexers(true);
    setIndexerError(null);
    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        setThirdPartyIndexers([]);
        return;
      }

      // Get current index visibility
      const visibilityResponse = await fetch(`${API_ENDPOINT}/api/third-party/files/${encodeURIComponent(fileId)}/index-visibility`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (visibilityResponse.ok) {
        const visibilityData = await visibilityResponse.json();
        setIndexingPermissionsState(visibilityData.indexingPermissions || null);

        // Load available indexers (simplified - in production this would come from a separate endpoint)
        // For now, we'll use a static list or derive from permissions
        const indexers: any[] = [];
        if (visibilityData.indexers) {
          indexers.push(...visibilityData.indexers);
        }

        setThirdPartyIndexers(indexers);

        // Initialize toggles based on permissions
        if (visibilityData.indexingPermissions) {
          const toggles: Record<string, boolean> = {};
          indexers.forEach(indexer => {
            if (visibilityData.indexingPermissions.mode === 'all') {
              toggles[indexer.id] = !visibilityData.indexingPermissions.blocked?.includes(indexer.id);
            } else {
              toggles[indexer.id] = visibilityData.indexingPermissions.allowed?.includes(indexer.id) || false;
            }
          });
          setIndexerToggles(toggles);
        }
      }
    } catch (err) {
      console.error('[FileStorageAggregator] Failed to load indexers:', err);
      setIndexerError('Failed to load third-party indexers');
    } finally {
      setIsLoadingIndexers(false);
    }
  };

  // Handle edit metadata
  const handleEditMetadata = async (file: DriveFile, accountId: string) => {
    
    // Load existing metadata
    const metadata = await loadFileMetadata(file.id);
    
    // Extract location data if present
    const location = metadata?.locationCreated || metadata?.schema?.locationCreated;
    const locationName = location?.name || '';
    const locationAddress = location?.address ? 
      `${location.address.addressLocality || ''}${location.address.addressRegion ? ', ' + location.address.addressRegion : ''}${location.address.addressCountry ? ', ' + location.address.addressCountry : ''}`.trim() : '';
    
    // Extract genre (can be array or string)
    const genre = metadata?.genre || metadata?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');
    
    // Extract categories (prefer feedCategories, fallback to category)
    const feedCategories = metadata?.feedCategories || [];
    const categories = feedCategories.length > 0 ? feedCategories : (metadata?.category ? [metadata.category as FeedCategory] : []);
    
    // Extract license (can be object with name or string)
    const license = metadata?.license || metadata?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '') || 'all-rights-reserved';
    
    setEditForm({
      name: metadata?.name || (file.name.endsWith('.encrypted') ? file.name.replace('.encrypted', '') : file.name),
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: categories.length > 0 ? categories[0] as FeedCategory : '' as FeedCategory | '', // Keep for backward compatibility
      categories: categories, // New array format
      isNSFW: metadata?.isNSFW === true || metadata?.isNSFW === 'true',
      locationName: locationName,
      locationAddress: locationAddress,
      license: licenseString
    });
    setEditingFile(file);
  };

  // Handle save metadata
  const handleSaveMetadata = (metadata?: MetadataFormData) => {
    if (!editingFile) return;

    // Use provided metadata or fall back to editForm state
    const formData = metadata || {
      name: editForm.name,
      description: editForm.description,
      tags: editForm.tags,
      genre: editForm.genre,
      categories: editForm.categories || (editForm.category ? [editForm.category as FeedCategory] : []),
      isNSFW: editForm.isNSFW,
      locationName: editForm.locationName,
      locationAddress: editForm.locationAddress,
      license: editForm.license
    };

    // Validate required category
    const categories = formData.categories || [];
    if (categories.length === 0) {
      setError('At least one category is required');
      return;
    }

    setError(null);

    // Store file reference before closing modal
    const fileToUpdate = editingFile;
    const fileId = fileToUpdate.id;
    const accountId = fileToUpdate.accountId || '';

    // Optimistically update local metadata map
    const existingMetadata = fileMetadataMap.get(fileId);
    const optimisticMetadata = {
      ...existingMetadata,
      name: formData.name,
      description: formData.description,
      keywords: formData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      tags: formData.tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      feedCategories: categories,
      category: categories[0],
      isNSFW: formData.isNSFW
    };
    setFileMetadataMap(prev => {
      const next = new Map(prev);
      next.set(fileId, optimisticMetadata as any);
      return next;
    });

    // Optimistically update displayName in file list
    if (accountId) {
      setFilesByAccount(prev => {
        const next = new Map(prev);
        const accountFiles = next.get(accountId) || [];
        const updatedFiles = accountFiles.map(file => {
          if (file.id === fileId) {
            return {
              ...file,
              displayName: formData.name || (file.name.endsWith('.encrypted') ? file.name.replace('.encrypted', '') : file.name)
            };
          }
          return file;
        });
        next.set(accountId, updatedFiles);
        return next;
      });
    }

    // Close modal immediately (before queuing task)
    setEditingFile(null);
    setEditForm({
      name: '',
      description: '',
      tags: '',
      genre: '',
      category: '',
      categories: [],
      isNSFW: false,
      locationName: '',
      locationAddress: '',
      license: 'all-rights-reserved'
    });

    // Queue background task after closing modal
    uploadQueueService.addTask({
      type: 'updateMetadata',
      accountId: accountId,
      metadata: {
        fileId: fileId,
        accountId: accountId,
        metadata: formData
      },
      onComplete: (result) => {
        console.log('✅ [Metadata] Metadata updated:', result);
        // Update with actual result
        if (result?.metadata) {
          setFileMetadataMap(prev => {
            const next = new Map(prev);
            next.set(fileId, result.metadata);
            return next;
          });
        }
        // Reload files to ensure metadata is fresh
        if (accountId) {
          setTimeout(() => {
            loadFilesForAccount(accountId);
          }, 500);
        }
      },
      onError: (error) => {
        console.error('❌ [Metadata] Failed to update metadata:', error);
        setError(error.message || 'Failed to update metadata');
        // Rollback optimistic update
        if (existingMetadata) {
          setFileMetadataMap(prev => {
            const next = new Map(prev);
            next.set(fileId, existingMetadata);
            return next;
          });
        }
        if (accountId) {
          setFilesByAccount(prev => {
            const next = new Map(prev);
            const accountFiles = next.get(accountId) || [];
            const updatedFiles = accountFiles.map(file => {
              if (file.id === fileId) {
                return {
                  ...file,
                  displayName: file.name.endsWith('.encrypted') ? file.name.replace('.encrypted', '') : file.name
                };
              }
              return file;
            });
            next.set(accountId, updatedFiles);
            return next;
          });
        }
      }
    });
  };

  // Handle share settings
  const handleShareSettings = async (file: DriveFile, accountId: string) => {
    
    // Load existing metadata to determine current visibility
    const metadata = await loadFileMetadata(file.id);
    const isPublic = metadata?.isPublic || false;
    const isNSFW = metadata?.isNSFW === true;
    const hasPublicToken = metadata?.publicToken && 
                          typeof metadata.publicToken === 'string' && 
                          metadata.publicToken.trim().length > 0;
    
    
    setShareVisibility(isPublic ? 'public' : 'private');
    
    // Load third-party indexers if public
    if (isPublic) {
      await loadThirdPartyIndexers(file.id);
    }
    
    setSharingFile(file);
    setSharingAccountId(accountId);
    setShareNSFW(isNSFW);
  };

  // Close share settings
  const closeShareSettings = () => {
    setSharingFile(null);
    setSharingAccountId(null);
    setShareVisibility('private');
    setShareNSFW(false);
    setThirdPartyIndexers([]);
    setIndexerToggles({});
    setIndexingPermissionsState(null);
    setIndexerError(null);
  };

  // Handle indexer toggle
  const handleIndexerToggle = (indexerId: string) => {
    setIndexerToggles((prev) => {
      const next = { ...prev };
      next[indexerId] = !prev[indexerId];
      return next;
    });
  };

  // Handle save share settings
  const handleSaveShareSettings = () => {
    if (!sharingFile) return;

    setError(null);

    // Store references before closing modal
    const fileToUpdate = sharingFile;
    const fileId = fileToUpdate.id;
    const accountId = sharingAccountId || '';

    const existingMetadata = fileMetadataMap.get(fileId);
    const targetFileId = existingMetadata?.fileId || fileId;
    const isCurrentlyPublic = existingMetadata?.isPublic || false;
    const existingIsNSFW = existingMetadata?.isNSFW === true;
    const makePublic = shareVisibility === 'public';

    const blockedIds = Object.entries(indexerToggles)
      .filter(([, enabled]) => !enabled)
      .map(([id]) => id);
    const enabledIds = Object.entries(indexerToggles)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);

    let nextPermissions: any = null;
    if (thirdPartyIndexers.length > 0) {
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
    } else if (indexingPermissionsState) {
      nextPermissions = {
        ...indexingPermissionsState,
        updatedAt: new Date().toISOString()
      };
    }

    // Optimistically update local metadata map
    if (makePublic || nextPermissions || shareNSFW !== existingIsNSFW) {
      setFileMetadataMap(prev => {
        const next = new Map(prev);
        const current = next.get(fileId);
        if (current) {
          next.set(fileId, {
            ...current,
            isPublic: makePublic,
            isNSFW: shareNSFW,
            ...(nextPermissions && { indexingPermissions: nextPermissions })
          });
        } else {
          next.set(fileId, {
            fileId: fileId,
            isPublic: makePublic,
            isNSFW: shareNSFW,
            ...(nextPermissions && { indexingPermissions: nextPermissions })
          } as any);
        }
        return next;
      });
    }

    // Close modal immediately (before queuing task)
    closeShareSettings();

    // Queue background task after closing modal
    uploadQueueService.addTask({
      type: 'updateShareSettings',
      accountId: accountId,
      metadata: {
        fileId: targetFileId,
        accountId: accountId,
        shareVisibility,
        shareNSFW,
        indexerToggles,
        thirdPartyIndexers,
        nextPermissions,
        existingMetadata: {
          ...existingMetadata,
          fileId: targetFileId,
          isPublic: isCurrentlyPublic,
          isNSFW: existingIsNSFW
        }
      },
      onComplete: (result) => {
        console.log('✅ [ShareSettings] Share settings updated:', result);
        // Reload metadata and files if making public
        if (result?.isPublic && accountId) {
          loadFileMetadata(fileId).then(() => {
            setTimeout(() => {
              loadFilesForAccount(accountId);
            }, 1000);
          });
        } else {
          loadFileMetadata(fileId);
        }
      },
      onError: (error) => {
        console.error('❌ [ShareSettings] Failed to update share settings:', error);
        setError(error.message || 'Failed to update sharing settings');
        // Rollback optimistic update on error
        if (existingMetadata) {
          setFileMetadataMap(prev => {
            const next = new Map(prev);
            next.set(fileId, existingMetadata);
            return next;
          });
        }
      }
    });
  };

  // Handle file delete
  const handleDelete = (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    
    // Check if this is a collection by checking local metadata cache
    // Don't block on loading metadata - let the background processor handle it
    const existingMetadata = fileMetadataMap.get(file.id);
    const isCollection = existingMetadata?.fileType === 'collection' && existingMetadata?.collection?.collectionFileIds;
    const collectionFileIds = isCollection ? existingMetadata.collection.collectionFileIds : [];
    const isThoughtCollection = existingMetadata?.isThoughtCollection === true;
    
    // For thought collections, we need to count: collection + thumbnails + main thought-collection file
    // For regular collections, we count: collection + collectionFileIds
    let totalFilesToDelete = 1; // Collection file itself
    if (isCollection) {
      if (isThoughtCollection) {
        // For thought collections: collection + thumbnails + main thought-collection file
        totalFilesToDelete = collectionFileIds.length + 1 + 1; // thumbnails + thought-collection file + collection
      } else {
        // For regular collections: just the collectionFileIds
        totalFilesToDelete = collectionFileIds.length + 1;
      }
    }
    
    const confirmMessage = isCollection 
      ? isThoughtCollection
        ? `Are you sure you want to delete this thought collection and all ${totalFilesToDelete - 1} associated files (${collectionFileIds.length} thumbnails and the main thought-collection file)?`
        : `Are you sure you want to delete this collection and all ${collectionFileIds.length} associated files?`
      : `Are you sure you want to delete "${file.name}"?`;
    
    if (!confirm(confirmMessage)) return;

    setError(null);

    // Optimistically remove from UI immediately
    setFilesByAccount(prev => {
      const next = new Map(prev);
      const accountFiles = next.get(accountId) || [];
      const filteredFiles = accountFiles.filter(f => f.id !== file.id);
      next.set(accountId, filteredFiles);
      return next;
    });
    setOpenMenuFor(null);

    // Queue background task
    // Background processor will load metadata if needed
    uploadQueueService.addTask({
      type: 'deleteFile',
      accountId,
      metadata: {
        fileId: file.id,
        accountId,
        isCollection: !!isCollection,
        collectionFileIds: isCollection && collectionFileIds ? collectionFileIds : undefined,
        isThoughtCollection: isCollection ? isThoughtCollection : undefined
      },
      onComplete: (result) => {
        console.log('✅ [Delete] File deleted:', result);
        // Reload files to ensure consistency
        setTimeout(() => {
          loadFilesForAccount(accountId);
        }, 500);
      },
      onError: (error) => {
        console.error('❌ [Delete] Failed to delete file:', error);
        setError(error.message || 'Failed to delete file');
        // Reload files to restore UI state on error
        loadFilesForAccount(accountId);
      }
    });
  };

  // Bulk delete handler
  const handleBulkDelete = (accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    
    // Get files to delete for this account only
    const accountFiles = filesByAccount.get(accountId) || [];
    const filesToDelete = accountFiles.filter(file => selectedFiles.has(file.id));
    
    if (filesToDelete.length === 0) return;
    
    const fileCount = filesToDelete.length;
    if (!confirm(`Are you sure you want to delete ${fileCount} file${fileCount > 1 ? 's' : ''}?`)) return;

    setError(null);

    const fileIdsToDelete = filesToDelete.map(f => f.id);
    const filesSnapshot = [...filesToDelete];

    // Optimistically remove from UI immediately
    setFilesByAccount(prev => {
      const next = new Map(prev);
      const accountFilesList = next.get(accountId) || [];
      const filteredFiles = accountFilesList.filter(f => !fileIdsToDelete.includes(f.id));
      next.set(accountId, filteredFiles);
      return next;
    });
    
    // Clear selection and exit bulk delete mode
    setSelectedFiles(new Set());
    setIsBulkDeleteMode(false);

    // Queue background task
    uploadQueueService.addTask({
      type: 'bulkDelete',
      accountId,
      metadata: {
        fileIds: fileIdsToDelete,
        accountId
      },
      onComplete: (result) => {
        console.log('✅ [BulkDelete] Files deleted:', result);
        const deletedCount = result?.deletedCount || 0;
        const totalFiles = result?.totalFiles || fileCount;
        if (deletedCount < totalFiles) {
          const failCount = totalFiles - deletedCount;
          setError(`Deleted ${deletedCount} file${deletedCount !== 1 ? 's' : ''}, ${failCount} failed`);
        }
        // Reload files to ensure consistency
        setTimeout(() => {
          loadFilesForAccount(accountId);
        }, 500);
      },
      onError: (error) => {
        console.error('❌ [BulkDelete] Failed to delete files:', error);
        setError(error.message || 'Failed to delete files');
        // Reload files to restore UI state on error
        loadFilesForAccount(accountId);
      }
    });
  };

  // Collection creation handler
  const handleCreateCollection = async (accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    if (selectedFiles.size === 0) return;

    // Sort files by collection order
    const accountFiles = filesByAccount.get(accountId) || [];
    const selectedFilesArray = accountFiles
      .filter(file => selectedFiles.has(file.id))
      .sort((a, b) => {
        const orderA = collectionFileOrder.get(a.id) || 0;
        const orderB = collectionFileOrder.get(b.id) || 0;
        return orderA - orderB;
      });

    const collectionFileIds = selectedFilesArray.map(f => f.id);
    
    // Store pending collection data and show metadata modal
    setPendingCollectionData({ accountId, fileIds: collectionFileIds });
    setShowCollectionMetadataModal(true);
  };
  
  const handleCollectionMetadataSave = (metadata: MetadataFormData) => {
    if (!pendingCollectionData) return;
    
    setShowCollectionMetadataModal(false);
    setError(null);

    const accountId = pendingCollectionData.accountId;

    // Clear selection and exit collection mode immediately (optimistic UI)
    setSelectedFiles(new Set());
    setCollectionFileOrder(new Map());
    setIsCollectionMode(false);
    const collectionDataSnapshot = { ...pendingCollectionData };
    setPendingCollectionData(null);

    // Queue background task
    uploadQueueService.addTask({
      type: 'createCollection',
      accountId,
      metadata: {
        collectionData: {
          collectionFileIds: collectionDataSnapshot.fileIds,
          title: metadata.name || `Collection of ${collectionDataSnapshot.fileIds.length} files`
        },
        accountId,
        metadata: metadata
      },
      onComplete: (result) => {
        console.log('✅ [Collection] Collection created:', result);
        // Reload files
        if (accountId && result?.fileId) {
          setTimeout(() => {
            loadFilesForAccount(accountId);
          }, 1000);
        }
      },
      onError: (error) => {
        console.error('❌ [Collection] Failed to create collection:', error);
        setError(error.message || 'Failed to create collection');
        // Re-enter collection mode on error (could show undo toast instead)
        setPendingCollectionData(collectionDataSnapshot);
        setIsCollectionMode(true);
      }
    });
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    if (isCollectionMode) {
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileId)) {
          // Deselecting - remove from order and renumber remaining files
          newSet.delete(fileId);
          const removedOrder = collectionFileOrder.get(fileId) || 0;
          setCollectionFileOrder(prevOrder => {
            const newOrder = new Map(prevOrder);
            newOrder.delete(fileId);
            // Renumber files that came after this one
            newOrder.forEach((order, id) => {
              if (order > removedOrder) {
                newOrder.set(id, order - 1);
              }
            });
            return newOrder;
          });
        } else {
          // Selecting - assign next number
          newSet.add(fileId);
          const nextOrder = collectionFileOrder.size + 1;
          setCollectionFileOrder(prevOrder => {
            const newOrder = new Map(prevOrder);
            newOrder.set(fileId, nextOrder);
            return newOrder;
          });
        }
        return newSet;
      });
    } else {
      // Regular bulk delete mode behavior
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileId)) {
          newSet.delete(fileId);
        } else {
          newSet.add(fileId);
        }
        return newSet;
      });
    }
  };

  // Select all files in current account
  const selectAllFiles = (accountId: string) => {
    const accountFiles = filesByAccount.get(accountId) || [];
    const accountFilesIds = accountFiles.map(f => f.id);
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      accountFilesIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  // Handle set/unset top post
  const handleSetTopPost = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Get current metadata to check if already top post
      const metadata = fileMetadataMap.get(file.id);
      const currentIsTopPost = metadata?.isTopPost || false;
      const newIsTopPost = !currentIsTopPost;

      const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${file.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isTopPost: newIsTopPost
        })
      });

      if (response.ok) {
        // Update local metadata
        const updatedMetadata = { ...metadata, isTopPost: newIsTopPost };
        setFileMetadataMap(prev => new Map(prev).set(file.id, updatedMetadata));
        setOpenMenuFor(null);
      } else {
        const errorText = await response.text();
        throw new Error(`Failed to update top post: ${errorText}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set top post');
      console.error('[FileStorageAggregator] Set top post error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load metadata for files when menu opens
  useEffect(() => {
    if (openMenuFor) {
      // Load metadata for the file when menu opens
      loadFileMetadata(openMenuFor).catch(err => {
        console.warn('[FileStorageAggregator] Failed to load metadata for menu:', err);
      });
    }
  }, [openMenuFor]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuFor) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is on the menu button itself
      const menuButton = document.querySelector(`[data-menu-button="${openMenuFor}"]`);
      if (menuButton && (menuButton.contains(target) || menuButton === target)) {
        return; // Don't close if clicking the button
      }
      
      // Check if click is inside the menu
      if (actionMenuRef.current && actionMenuRef.current.contains(target)) {
        return; // Don't close if clicking inside menu
      }
      
      // Close menu if clicking outside
      setOpenMenuFor(null);
    };

    // Use a delay to avoid immediate closure from the button click
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [openMenuFor]);

  // Close add menu when clicking outside
  useEffect(() => {
    if (!showAddMenuFor) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is on the add button itself
      const addButton = addButtonRefs.current.get(showAddMenuFor);
      if (addButton && (addButton.contains(target) || addButton === target)) {
        return; // Don't close if clicking the button
      }
      
      // Check if click is inside the menu (find by checking if it's in a menu element)
      const menuElement = document.querySelector(`[data-add-menu="${showAddMenuFor}"]`);
      if (menuElement && menuElement.contains(target)) {
        return; // Don't close if clicking inside menu
      }
      
      // Close menu if clicking outside
      setShowAddMenuFor(null);
      setAddMenuPosition(null);
    };

    // Use a delay to avoid immediate closure from the button click
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showAddMenuFor]);

  const hasConnectedBackends = driveAccounts.length > 0;

  // Thumbnail generation helpers (defined inside component to ensure scope)
  const createThumbnailFromBlobLocal = async (blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> => {
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
  };

  const createVideoThumbnailLocal = async (videoFile: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);
      
      video.onloadedmetadata = () => {
        // Seek to 1 second or first frame
        video.currentTime = Math.min(1, video.duration / 2);
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        let width = video.videoWidth;
        let height = video.videoHeight;
        
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
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(video, 0, 0, width, height);
        
        canvas.toBlob((thumbnailBlob) => {
          URL.revokeObjectURL(url);
          if (thumbnailBlob) {
            resolve(thumbnailBlob);
          } else {
            reject(new Error('Failed to create video thumbnail blob'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video for thumbnail'));
      };
      
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;
    });
  };

  const uploadThumbnailLocal = async (
    thumbnailBlob: Blob,
    originalFileName: string,
    encryptionManager: EncryptionManager,
    session: any,
    publicKey: string,
    accessToken: string,
    accountId: string
  ): Promise<string | undefined> => {
    try {
      // Encrypt thumbnail
      const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
      const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
      const encryptedThumbnail = await encryptionManager.encrypt(
        thumbnailData,
        session.did,
        publicKey
      );
      
      // Create encrypted thumbnail package
      const thumbnailPackage: EncryptedFilePackage = {
        encrypted: encryptedThumbnail.encrypted,
        iv: encryptedThumbnail.iv,
        salt: encryptedThumbnail.salt,
        metadata: {
          originalName: `thumb_${originalFileName}`,
          originalSize: thumbnailBlob.size,
          originalMimeType: 'image/jpeg', // Thumbnails are always JPEG
        },
      };
      
      // Convert to base64
      const thumbnailBlobJson = new Blob([JSON.stringify(thumbnailPackage)], {
        type: 'application/json',
      });
      
      const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Failed to read thumbnail'));
        reader.readAsDataURL(thumbnailBlobJson);
      });
      
      // Upload encrypted thumbnail
      const thumbnailFileName = `thumb_${originalFileName}.encrypted`;
      const thumbnailResponse = await fetch(`${API_ENDPOINT}/api/drive/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          fileData: thumbnailBase64,
          fileName: thumbnailFileName,
          mimeType: 'application/json',
          accountId: accountId
        })
      });
      
      if (thumbnailResponse.ok) {
        const thumbnailResult = await thumbnailResponse.json();
        const thumbnailFileId = thumbnailResult.file?.id;
        if (thumbnailFileId) {
          return thumbnailFileId;
        }
      }
      
      return undefined;
    } catch (error: any) {
      console.error('[Upload] Thumbnail generation/upload failed:', error);
      return undefined;
    }
  };

  // Convert PDF pages to thumbnails and upload them
  const processPDFPages = async (
    pdfFile: File,
    accountId: string,
    session: any,
    publicKey: string,
    encryptionManager: EncryptionManager,
    accessToken: string
  ): Promise<{ thumbnailFileIds: string[]; thumbnailTokens: Record<string, string> }> => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    
    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    const thumbnailFileIds: string[] = [];
    const thumbnailTokens: Record<string, string> = {};
    const baseFileName = pdfFile.name.replace(/\.pdf$/i, '');
    
    console.log(`[PDF Upload] Processing ${numPages} pages...`);
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const scale = Math.min(800 / viewport.width, 800 / viewport.height, 1.0);
      const scaledViewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      
      await page.render({ canvasContext: ctx, viewport: scaledViewport } as any).promise;
      
      const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to create blob')), 'image/jpeg', 0.85);
      });
      
      const thumbnailFileName = `${baseFileName}-page-${pageNum}.png`;
      const thumbnailFileId = await uploadThumbnailLocal(
        thumbnailBlob,
        thumbnailFileName,
        encryptionManager,
        session,
        publicKey,
        accessToken,
        accountId
      );
      
      if (thumbnailFileId) {
        // Generate publicToken for thumbnail
        try {
          const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
          const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
          const encryptedThumbnail = await encryptionManager.encrypt(thumbnailData, session.did, publicKey);
          const thumbnailPackage: EncryptedFilePackage = {
            encrypted: encryptedThumbnail.encrypted,
            iv: encryptedThumbnail.iv,
            salt: encryptedThumbnail.salt,
            metadata: {
              originalName: `thumb_${thumbnailFileName}`,
              originalSize: thumbnailBlob.size,
              originalMimeType: 'image/jpeg',
            },
          };
          
          const encryptionService = getEncryptionService();
          const thumbnailShareToken = await encryptionService.generateShareToken(thumbnailPackage, {
            id: session.did,
            publicKey: publicKey
          });
          
          // Store token for later use in collection
          thumbnailTokens[thumbnailFileId] = JSON.stringify(thumbnailShareToken);
          console.log(`[PDF Upload] Stored token for thumbnail ${thumbnailFileId} (page ${pageNum}/${numPages})`);
          
          // Create metadata for thumbnail
          await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${thumbnailFileId}?accountId=${accountId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              name: `thumb_${thumbnailFileName}`,
              fileType: 'image',
              isPublic: false,
              publicToken: JSON.stringify(thumbnailShareToken)
            })
          });
        } catch (err) {
          console.warn(`[PDF Upload] Failed to process thumbnail for page ${pageNum}:`, err);
        }
        
        thumbnailFileIds.push(thumbnailFileId);
        console.log(`[PDF Upload] Processed page ${pageNum}/${numPages}`);
      }
    }
    
    return { thumbnailFileIds, thumbnailTokens };
  };

  const addUploadTask = (file: File, accountId: string, encrypt: boolean) => {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const taskType = isPDF ? 'pdf' : 'file';
    uploadQueueService.addTask({
      type: taskType,
      file,
      accountId,
      metadata: {
        title: file.name,
        description: '',
        keywords: [],
        tags: [],
        isPublic: false,
        isNSFW: false,
        encrypt,
      },
      onComplete: () => {
        console.log('✅ [Upload] File upload completed');
      },
      onError: (err) => {
        console.error('❌ [Upload] File upload failed:', err);
        setError(`Upload failed: ${err.message}`);
      },
    });
  };

  const handleUploadForAccount = async (accountId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!authenticatedUser?.id) {
      setError('Please unlock your pN to upload files');
      return;
    }
    setError(null);

    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (isVideo || isAudio) {
      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setError('No valid access token');
          return;
        }
        const pnId = userState.pnIdentifier || authenticatedUser.id;
        const res = await fetch(`${API_ENDPOINT}/api/users/${pnId}/storage-tier`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          addUploadTask(file, accountId, true);
          if (event.target) event.target.value = '';
          return;
        }
        const { encryptedLimitBytes } = await res.json();
        if (file.size > encryptedLimitBytes) {
          setPendingUnencryptedUpload({
            file,
            accountId,
            limitMb: Math.round(encryptedLimitBytes / 1024 / 1024),
          });
          setShowUnencryptedAlert(true);
          if (event.target) event.target.value = '';
          return;
        }
      } catch {
        addUploadTask(file, accountId, true);
        if (event.target) event.target.value = '';
        return;
      }
    }

    addUploadTask(file, accountId, true);
    if (event.target) event.target.value = '';
  };

  const handleUnencryptedUploadConfirm = () => {
    if (!pendingUnencryptedUpload) return;
    addUploadTask(pendingUnencryptedUpload.file, pendingUnencryptedUpload.accountId, false);
    setPendingUnencryptedUpload(null);
    setShowUnencryptedAlert(false);
  };

  const handleUnencryptedUploadCancel = () => {
    setPendingUnencryptedUpload(null);
    setShowUnencryptedAlert(false);
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

      {/* Unencrypted upload alert modal */}
      {showUnencryptedAlert && pendingUnencryptedUpload && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Encryption limit exceeded</h3>
            <p className="text-neutral-400 text-sm mb-4">
              This file exceeds your encryption limit ({pendingUnencryptedUpload.limitMb} MB). It will be stored unencrypted. Only your Google account will have access. Upgrade to a paid tier to encrypt larger files.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleUnencryptedUploadCancel}
                className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnencryptedUploadConfirm}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Upload unencrypted
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* File List - One section per account */}
      {hasConnectedBackends && (
        <div className="space-y-6">
          {driveAccounts.map((account, index) => {
            const accountFiles = filesByAccount.get(account.accountId) || [];

            return (
              <div key={account.accountId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Cloud className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-white font-semibold truncate">
                      {account.email || account.displayName || `Drive ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        // Disconnect - just remove from UI for now (would need API endpoint)
                        setDriveAccounts(prev => prev.filter(a => a.accountId !== account.accountId));
                      }}
                      className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => {
                        loadFilesForAccount(account.accountId);
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
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
                      onChange={(e) => {
                        handleUploadForAccount(account.accountId, e);
                      }}
                    />
                    <div className="relative">
                      <button
                        ref={(el) => {
                          if (el) {
                            addButtonRefs.current.set(account.accountId, el);
                          } else {
                            addButtonRefs.current.delete(account.accountId);
                          }
                        }}
                        onClick={(e) => {
                          const button = e.currentTarget;
                          const rect = button.getBoundingClientRect();
                          setShowAddMenuFor(account.accountId);
                          setAddMenuPosition({
                            top: rect.bottom,
                            left: rect.left + rect.width / 2
                          });
                        }}
                        disabled={isLoading}
                        className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
                        title="Add Content"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {showAddMenuFor === account.accountId && addMenuPosition && (
                        <div
                          data-add-menu={account.accountId}
                          className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                          style={{
                            top: `${addMenuPosition.top}px`,
                            left: `${addMenuPosition.left}px`,
                            transform: 'translateX(-50%)',
                            marginTop: '8px'
                          }}
                        >
                          <button
                            onClick={() => {
                              if (onOpenTextEditor) {
                                onOpenTextEditor(account.accountId);
                              }
                              setShowAddMenuFor(null);
                              setAddMenuPosition(null);
                            }}
                            className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                          >
                            <Type className="h-4 w-4" />
                            Add Thought
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(account.accountId);
                              const input = fileInputRefs.current.get(account.accountId);
                              if (input) {
                                input.click();
                              } else {
                                console.error('[FileStorageAggregator] File input not found for account:', account.accountId);
                                setError('File input not initialized. Please refresh the page.');
                              }
                              setShowAddMenuFor(null);
                              setAddMenuPosition(null);
                            }}
                            className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                          >
                            <Upload className="h-4 w-4" />
                            Add File
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(account.accountId);
                              setIsCollectionMode(true);
                              setIsBulkDeleteMode(false);
                              setSelectedFiles(new Set());
                              setCollectionFileOrder(new Map());
                              setShowAddMenuFor(null);
                              setAddMenuPosition(null);
                            }}
                            className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                          >
                            <Layers className="h-4 w-4" />
                            Add Collection
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setIsBulkDeleteMode(!isBulkDeleteMode);
                        if (isBulkDeleteMode) {
                          setSelectedFiles(new Set());
                        }
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
                      title={isBulkDeleteMode ? "Cancel Bulk Delete" : "Bulk Delete"}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded transition-colors flex items-center justify-center ${
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
                      className={`p-2 rounded transition-colors flex items-center justify-center ${
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
                const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                
                // Check if this is a collection
                const isCollection = (file as any).fileType === 'collection' || 
                                   nameWithoutEncrypted.toLowerCase().startsWith('collection-') && 
                                   nameWithoutEncrypted.toLowerCase().endsWith('.collection');
                
                // For encrypted files, check if they're media files by extension
                const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                                 (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') && 
                                          (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                let isMediaFile = isImage || isVideo || isThought || isThoughtThumbnail || isCollection;
                if (isEncrypted && !isCollection) {
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) || 
                                       (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                       nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
                  isMediaFile = hasImageExt || hasVideoExt || hasThoughtExt;
                }
                
                

                return (
                  <div
                    key={file.id}
                    className={`bg-neutral-800/50 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group ${
                      (isBulkDeleteMode || isCollectionMode) ? 'cursor-default' : 'cursor-pointer'
                    } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={(e) => {
                      // Handle checkbox click in bulk delete or collection mode
                      if (isBulkDeleteMode || isCollectionMode) {
                        const target = e.target as HTMLElement;
                        if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                          toggleFileSelection(file.id);
                          return;
                        }
                        toggleFileSelection(file.id);
                        return;
                      }
                      // Don't open file viewer if clicking on menu button or menu
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-menu-button]') || target.closest('.menu-container')) {
                        return;
                      }
                      // Ensure collection metadata is included when opening
                      const fileWithMetadata = {
                        ...file,
                        accountId: file.accountId || account.accountId,
                        fileType: (file as any).fileType || fileMetadataMap.get(file.id)?.fileType,
                        collection: (file as any).collection || fileMetadataMap.get(file.id)?.collection
                      };
                      setViewingFile(fileWithMetadata);
                    }}
                  >
                    {/* Checkbox or order number for collection/bulk delete mode */}
                    {(isBulkDeleteMode || isCollectionMode) && (
                      <div className="absolute top-2 left-2 z-30" onClick={(e) => e.stopPropagation()}>
                        {isCollectionMode && collectionFileOrder.has(file.id) ? (
                          // Show number badge when selected in collection mode
                          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            {collectionFileOrder.get(file.id)}
                          </div>
                        ) : (
                          // Show checkbox when not selected or in bulk delete mode
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    )}
                    <div className="relative aspect-square bg-neutral-700/50 overflow-hidden">
                      {isCollection ? (
                        (() => {
                          const collectionData = (file as any).collection;
                          const firstFileId = collectionData?.collectionFileIds?.[0];
                          const accountFiles = filesByAccount.get(account.accountId) || [];
                          const firstFile = firstFileId ? accountFiles.find(f => f.id === firstFileId) : null;
                          
                          return (
                            <div className="w-full h-full relative">
                              {firstFile && (firstFile.mimeType?.startsWith('image/') || firstFile.mimeType?.startsWith('video/')) ? (
                                <>
                                  <ThumbnailImage 
                                    fileId={firstFile.id}
                                    accountId={firstFile.accountId || account.accountId}
                                    fileName={firstFile.name}
                                    alt={firstFile.name}
                                    mimeType={firstFile.mimeType}
                                    mainFileId={(firstFile as any).mainFileId}
                                    isThumbnail={(firstFile as any).isThumbnail}
                                  />
                                  {/* Collection icon overlay */}
                                  <div className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
                                    <Layers className="h-4 w-4 text-blue-400" />
                                  </div>
                                </>
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-600/20 to-purple-600/20">
                                  <Layers className="h-12 w-12 text-blue-400 mb-2" />
                                  <span className="text-xs text-white/80 px-2 text-center">
                                    {collectionData?.collectionFileIds?.length || 0 > 0 
                                      ? `${collectionData.collectionFileIds.length} items`
                                      : 'Collection'}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : isMediaFile ? (
                        <ThumbnailImage 
                          fileId={file.id}
                          accountId={file.accountId || account.accountId}
                          fileName={file.name}
                          alt={file.name}
                          mimeType={file.mimeType}
                          mainFileId={(file as any).mainFileId}
                          isThumbnail={(file as any).isThumbnail}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock className="h-8 w-8 text-blue-400" />
                        </div>
                      )}
                      {/* Uploading indicator */}
                      {file.isUploading && (
                        <>
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                            <div className="text-center">
                              <RefreshCw className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-2" />
                              <div className="text-white text-xs font-semibold">
                                {file.uploadProgress || 0}%
                              </div>
                            </div>
                          </div>
                          {/* Progress bar at bottom */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700 z-30">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${file.uploadProgress || 0}%` }}
                            />
                          </div>
                        </>
                      )}
                      {/* Public indicator - moved to bottom left to avoid conflict with checkbox/number */}
                      {file.isPublic && !file.isUploading && (
                        <div className="absolute bottom-2 left-2 bg-green-500/80 rounded-full p-1 z-10">
                          <Globe className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {/* Menu button - top right corner (hidden in bulk delete or collection mode) */}
                      {!isBulkDeleteMode && !isCollectionMode && (
                        <div className="absolute top-2 right-2 z-20 menu-container" onClick={(e) => e.stopPropagation()}>
                          <button
                          ref={(el) => {
                            if (el) menuButtonRefs.current.set(file.id, el);
                            else menuButtonRefs.current.delete(file.id);
                          }}
                          data-menu-button={file.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            const newState = openMenuFor === file.id ? null : file.id;
                            if (newState) {
                              // Position menu below the button for grid view (top right)
                              setMenuPosition({
                                top: rect.bottom + 8, // 8px below button
                                left: rect.right - 176 // 176px = w-44 (11rem), align right edge
                              });
                            } else {
                              setMenuPosition(null);
                            }
                            setOpenMenuFor(newState);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="bg-neutral-900/80 hover:bg-neutral-800/90 rounded-full p-1.5 transition-colors"
                          title="File actions"
                          disabled={isLoading}
                        >
                            <MoreVertical className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      )}
                      {isMediaFile && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Eye className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-white text-xs truncate mb-1" title={fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name}>
                        {cleanTitle(fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name)}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {(parseInt(file.size || '0') / 1024).toFixed(1)} KB
                      </p>
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
                const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                
                // Check if this is a collection
                const isCollection = (file as any).fileType === 'collection' || 
                                   nameWithoutEncrypted.toLowerCase().startsWith('collection-') && 
                                   nameWithoutEncrypted.toLowerCase().endsWith('.collection');
                
                // For encrypted files, check if they're media files by extension
                const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                                 (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') && 
                                          (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                let isMediaFile = isImage || isVideo || isThought || isThoughtThumbnail || isCollection;
                if (isEncrypted && !isCollection) {
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) || 
                                       (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                       nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
                  isMediaFile = hasImageExt || hasVideoExt || hasThoughtExt;
                }

                return (
                  <div
                    key={file.id}
                    className={`flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors ${
                      isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                    } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={(e) => {
                      // Handle checkbox click in bulk delete mode
                      if (isBulkDeleteMode) {
                        const target = e.target as HTMLElement;
                        if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                          toggleFileSelection(file.id);
                          return;
                        }
                        toggleFileSelection(file.id);
                        return;
                      }
                      // Ensure collection metadata is included when opening
                      const fileWithMetadata = {
                        ...file,
                        accountId: file.accountId || account.accountId,
                        fileType: (file as any).fileType || fileMetadataMap.get(file.id)?.fileType,
                        collection: (file as any).collection || fileMetadataMap.get(file.id)?.collection
                      };
                      setViewingFile(fileWithMetadata);
                    }}
                  >
                    {/* Checkbox or order number for collection/bulk delete mode */}
                    {(isBulkDeleteMode || isCollectionMode) && (
                      <div className="flex-shrink-0 mr-3" onClick={(e) => e.stopPropagation()}>
                        {isCollectionMode && collectionFileOrder.has(file.id) ? (
                          // Show number badge when selected in collection mode
                          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            {collectionFileOrder.get(file.id)}
                          </div>
                        ) : (
                          // Show checkbox when not selected or in bulk delete mode
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                            className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    )}
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {isCollection ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center">
                          <Layers className="h-6 w-6 text-blue-400" />
                        </div>
                      ) : isMediaFile ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                          <ThumbnailImage 
                            fileId={file.id}
                            accountId={file.accountId || account.accountId}
                            fileName={file.name}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            mainFileId={(file as any).mainFileId}
                            isThumbnail={(file as any).isThumbnail}
                          />
                        </div>
                      ) : (
                        <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-white text-sm truncate">
                            {cleanTitle(fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name)}
                          </p>
                          {file.isUploading && (
                            <RefreshCw className="h-3 w-3 text-blue-400 animate-spin flex-shrink-0" />
                          )}
                          {file.isPublic && !file.isUploading && (
                            <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <p className="text-text-secondary text-xs">
                            {account.accountId || 'google_drive'} • {(parseInt(file.size || '0') / 1024).toFixed(2)} KB
                          </p>
                          {file.isUploading && (
                            <span className="text-blue-400 text-xs">
                              Uploading {file.uploadProgress || 0}%
                            </span>
                          )}
                        </div>
                        {file.isUploading && (
                          <div className="mt-1 h-1 bg-neutral-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${file.uploadProgress || 0}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                    {!isBulkDeleteMode && !isCollectionMode && (
                      <div className="flex items-center justify-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            ref={(el) => {
                              if (el) menuButtonRefs.current.set(file.id, el);
                              else menuButtonRefs.current.delete(file.id);
                            }}
                            data-menu-button={file.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              const newState = openMenuFor === file.id ? null : file.id;
                              if (newState) {
                                // Position menu to the left of the button, with top aligned to button top
                                setMenuPosition({
                                  top: rect.top, // Align top of menu with top of button
                                  left: rect.left - 180 // 180px = w-44 (176px) + 4px spacing
                                });
                              } else {
                                setMenuPosition(null);
                              }
                              setOpenMenuFor(newState);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              margin: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(64, 64, 64, 0.5)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              color: '#a3a3a3',
                              lineHeight: 0
                            }}
                            className="transition-colors disabled:opacity-50 hover:bg-neutral-700"
                            title="File actions"
                            disabled={isLoading}
                          >
                            <MoreVertical className="h-4 w-4" style={{ margin: 0, padding: 0 }} />
                          </button>
                          {/* Menu will be rendered in portal */}
                        </div>
                      </div>
                    )}
                  </div>
                    );
                  })}
                  </div>
                )}
                
                {/* Collection Mode UI */}
                {isCollectionMode && (
                  <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-text-secondary text-sm">
                        {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setIsCollectionMode(false);
                          setSelectedFiles(new Set());
                          setCollectionFileOrder(new Map());
                        }}
                        className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleCreateCollection(account.accountId)}
                        disabled={selectedFiles.size === 0 || isLoading}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {/* Bulk Delete Button */}
                {isBulkDeleteMode && (() => {
                  const accountSelectedFiles = accountFiles.filter(f => selectedFiles.has(f.id));
                  const selectedCount = accountSelectedFiles.length;
                  
                  return (
                    <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (selectedCount === accountFiles.length) {
                              // Deselect all files from this account
                              setSelectedFiles(prev => {
                                const newSet = new Set(prev);
                                accountFiles.forEach(f => newSet.delete(f.id));
                                return newSet;
                              });
                            } else {
                              selectAllFiles(account.accountId);
                            }
                          }}
                          className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors"
                        >
                          {selectedCount === accountFiles.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-text-secondary text-sm">
                          {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
                        </span>
                      </div>
                      <button
                        onClick={() => handleBulkDelete(account.accountId)}
                        disabled={selectedCount === 0 || isLoading}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Selected ({selectedCount})
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <FileViewerModal 
          file={viewingFile}
          fileMetadataMap={fileMetadataMap}
          onClose={() => setViewingFile(null)}
          onDownload={() => viewingFile.accountId && handleDownload(viewingFile, viewingFile.accountId)}
        />
      )}

      {/* Edit Metadata Modal */}
      <EditMetadataModal
        isOpen={!!editingFile}
        onClose={() => {
          setEditingFile(null);
          setEditForm({
            name: '',
            description: '',
            tags: '',
            genre: '',
            category: '',
            categories: [],
            isNSFW: false,
            locationName: '',
            locationAddress: '',
            license: 'all-rights-reserved'
          });
        }}
        onSave={(metadata) => {
          // Pass metadata directly to handleSaveMetadata
          handleSaveMetadata(metadata);
        }}
        initialData={editingFile ? {
          name: editForm.name,
          description: editForm.description,
          tags: editForm.tags,
          genre: editForm.genre,
          categories: editForm.categories,
          isNSFW: editForm.isNSFW,
          locationName: editForm.locationName,
          locationAddress: editForm.locationAddress,
          license: editForm.license
        } : undefined}
        title="Edit Metadata"
        submitButtonText="Save Changes"
        isLoading={isLoading}
      />

      {/* Share Settings Modal */}
      {sharingFile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={closeShareSettings}
        >
          <div
            className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
              <div>
                <h2 className="text-xl font-semibold text-white uppercase tracking-wide">Share Settings</h2>
                <p className="text-sm text-text-secondary mt-1 truncate max-w-xl">
                  {sharingFile.name.replace(/\.encrypted$/i, '')}
                </p>
              </div>
              <button
                onClick={closeShareSettings}
                className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-8 max-h-[70vh] overflow-y-auto">
              <section>
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">
                  Visibility
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {(['public', 'private'] as const).map((option) => {
                    const isActive = shareVisibility === option;
                    return (
                      <button
                        key={option}
                        onClick={() => {
                          setShareVisibility(option);
                          if (option === 'public' && thirdPartyIndexers.length === 0) {
                            loadThirdPartyIndexers(sharingFile.id);
                          }
                        }}
                        className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                          isActive
                            ? 'border-blue-500 bg-blue-600/20 text-white'
                            : 'border-neutral-700 bg-neutral-800 text-text-secondary hover:text-text-primary hover:border-neutral-500'
                        }`}
                      >
                        <span className="text-sm font-semibold uppercase tracking-wide block">
                          {option === 'public' ? 'PUBLIC' : 'PRIVATE'}
                        </span>
                        <span className="mt-1 text-xs text-text-secondary">
                          {option === 'public'
                            ? 'Anyone with the public link can access this file.'
                            : 'Only you (and collaborators you invite) can view this file.'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {shareVisibility === 'public' && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                      Content Classification
                    </h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border border-neutral-800 bg-neutral-900/70 rounded-lg px-4 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white uppercase tracking-wide mb-1">
                          NSFW Content
                        </p>
                        <p className="text-xs text-text-secondary">
                          Mark this content as Not Safe For Work (18+)
                        </p>
                      </div>
                      <button
                        onClick={() => setShareNSFW(!shareNSFW)}
                        className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded-md border transition-colors ${
                          shareNSFW
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-neutral-800 border-neutral-600 text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {shareNSFW ? 'NSFW' : 'PUBLIC'}
                      </button>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                    Third-Party Indexing
                  </h3>
                  {shareVisibility === 'public' && (
                    <span className="text-xs text-text-secondary">
                      Choose which par Noir partners can surface this file.
                    </span>
                  )}
                </div>

                {shareVisibility !== 'public' ? (
                  <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-text-secondary">
                    Make the file PUBLIC to manage third-party indexing visibility.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isLoadingIndexers ? (
                      <div className="flex items-center space-x-2 text-text-secondary text-sm">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Loading partners...</span>
                      </div>
                    ) : indexerError ? (
                      <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                        {indexerError}
                      </div>
                    ) : thirdPartyIndexers.length === 0 ? (
                      <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-text-secondary">
                        No third-party indexers are currently available.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {thirdPartyIndexers.map((indexer) => {
                          const enabled = Boolean(indexerToggles[indexer.id]);
                          return (
                            <div
                              key={indexer.id}
                              className="flex items-center justify-between border border-neutral-800 bg-neutral-900/70 rounded-lg px-4 py-3"
                            >
                              <div className="mr-4">
                                <p className="text-sm font-semibold text-white uppercase tracking-wide">
                                  {indexer.name}
                                </p>
                                {indexer.description && (
                                  <p className="text-xs text-text-secondary mt-1 max-w-md">
                                    {indexer.description}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleIndexerToggle(indexer.id)}
                                className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded-md border transition-colors ${
                                  enabled
                                    ? 'bg-blue-600 border-blue-500 text-white'
                                    : 'bg-neutral-800 border-neutral-600 text-text-secondary hover:text-text-primary'
                                }`}
                              >
                                {enabled ? 'ENABLED' : 'DISABLED'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-neutral-800 bg-neutral-900/80">
              <button
                onClick={closeShareSettings}
                className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary transition-colors"
                disabled={isSavingShare}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShareSettings}
                disabled={isSavingShare || (shareVisibility === 'public' && isLoadingIndexers)}
                className="px-5 py-2 text-sm font-semibold uppercase tracking-wide rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingShare ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal-based menu for both grid and list views */}
      {openMenuFor && menuPosition && (() => {
        // Find the file and account for the open menu
        let menuFile: DriveFile | null = null;
        let menuAccountId: string | null = null;
        
        for (const [accountId, files] of filesByAccount.entries()) {
          const file = files.find(f => f.id === openMenuFor);
          if (file) {
            menuFile = file;
            menuAccountId = accountId;
            break;
          }
        }

        if (!menuFile || !menuAccountId) return null;

        const menuContent = (
          <div
            ref={actionMenuRef}
            className="fixed w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] py-1 menu-container"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleEditMetadata(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Edit className="h-4 w-4" />
              <span>Edit metadata</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleDownload(menuFile!, menuAccountId!);
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
                setMenuPosition(null);
                handleShareSettings(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Share2 className="h-4 w-4" />
              <span>Share settings</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleSetTopPost(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-yellow-400 hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Star className={`h-4 w-4 ${fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              <span>{fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'Unset top post' : 'Set as top post'}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleDelete(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        );

        return createPortal(menuContent, document.body);
      })()}
      
      {/* Collection Metadata Modal */}
      <EditMetadataModal
        isOpen={showCollectionMetadataModal && !!pendingCollectionData}
        onClose={() => {
          setShowCollectionMetadataModal(false);
          setPendingCollectionData(null);
        }}
        onSave={handleCollectionMetadataSave}
        initialData={pendingCollectionData ? {
          name: `Collection of ${pendingCollectionData.fileIds.length} files`
        } : undefined}
        title="Collection Metadata"
        submitButtonText="Create Collection"
        isLoading={isLoading}
      />
    </div>
  );
};
