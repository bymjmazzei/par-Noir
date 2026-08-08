/**
 * File Storage Aggregator Component (Browser App)
 * Uses API endpoints instead of direct Google Drive access
 */

import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { PNOAuthService } from '../services/pnOAuthService';
import { uploadQueueService } from '../services/uploadQueueService';
import { FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { EditMetadataModal, MetadataFormData } from './EditMetadataModal';
import { useDriveAccounts } from '../hooks/useDriveAccounts';
import { useLoadFilesForAccount } from '../hooks/useLoadFilesForAccount';
import type { DriveFile } from './storage/storageTypes';
import { API_ENDPOINT } from '../config/api';
import { downloadStorageBlob } from '../services/storageApiClient';
import { fetchMusicRegistryCatalog, type CatalogTrack } from '../services/musicRegistryApi';
import { getOwnerApiHeaders } from '../services/ownerApiHeaders';

import { FileViewerModal } from './file/StorageFileViewer';
import type { FileStorageAggregatorProps } from './storage/FileStorageAggregatorTypes';
import { AccountFilesPanel } from './storage/AccountFilesPanel';
import { FileActionMenu } from './storage/FileActionMenu';
import { ShareSettingsModal } from './storage/ShareSettingsModal';
import { UnencryptedUploadAlert } from './storage/UnencryptedUploadAlert';

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ 
  authenticatedUser, 
  onOpenTextEditor
}) => {
  const { userState } = useUserState();
  const [isLoading, setIsLoading] = useState(false);
  const [filesByAccount, setFilesByAccount] = useState<Map<string, DriveFile[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const { accounts: driveAccounts, setSelectedId: setSelectedAccountId, setAccounts: setDriveAccounts } = useDriveAccounts({
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
  const [musicCatalog, setMusicCatalog] = useState<CatalogTrack[]>([]);
  const [nextAudioRegistryTrackId, setNextAudioRegistryTrackId] = useState('');
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const addButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  /** Drive files with no Postgres index — skip repeat metadata-index GETs (404 is expected). */
  const metadataMissingIdsRef = useRef<Set<string>>(new Set());
  const loadFilesTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const loadFilesForAccountRef = useRef<(accountId: string) => Promise<void>>(async () => {});

  const scheduleLoadFilesForAccount = (accountId: string, delayMs = 800) => {
    const timers = loadFilesTimerRef.current;
    const existing = timers.get(accountId);
    if (existing) clearTimeout(existing);
    timers.set(
      accountId,
      setTimeout(() => {
        timers.delete(accountId);
        void loadFilesForAccountRef.current(accountId);
      }, delayMs)
    );
  };

  useEffect(() => {
    if (!authenticatedUser?.id || !userState.isUnlocked) {
      setMusicCatalog([]);
      setNextAudioRegistryTrackId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMusicRegistryCatalog();
        if (!cancelled) setMusicCatalog(list);
      } catch {
        if (!cancelled) setMusicCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id, userState.isUnlocked]);

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

        // Refresh file list once queue is idle (avoid reload mid-metadata-PUT)
        if (task.status === 'completed' && task.accountId) {
          const accountStillBusy = uploadQueueService.getActiveTasks().some(
            (t) => t.accountId === task.accountId
          );
          if (!accountStillBusy) {
            scheduleLoadFilesForAccount(task.accountId);
          }
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
        if (import.meta.env.DEV) console.warn('[FileStorageAggregator] Error removing upload queue listeners:', error);
      }
    };
  }, []); // Empty deps - only subscribe once

  // Handle file download
  const handleDownload = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;

    // Skip download for files that are still uploading
    if (file.id.startsWith('uploading_') || (file as any).isUploading) {
      if (import.meta.env.DEV) console.log('[FileStorageAggregator] Cannot download file that is still uploading');
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Use main file ID if this is a thumbnail, otherwise use file ID
      const fileIdToDownload = file.mainFileId || file.id;
      const provider =
        (file as { provider?: string }).provider ||
        driveAccounts.find((a) => a.accountId === accountId)?.provider ||
        'google_drive';
      const pnIdentifier = userState.pnIdentifier;
      if (!pnIdentifier) {
        throw new Error('Unlock your pN to download files');
      }
      
      // Get the original filename for download
      let downloadFileName = file.name;
      if (file.isThumbnail) {
        // For thumbnails, try to get the original filename from metadata
        try {
          const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileIdToDownload}`, {
            headers: getOwnerApiHeaders()
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

      const blob = await downloadStorageBlob(accessToken, pnIdentifier, provider, fileIdToDownload, {
        accountId
      });
      const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
      if (import.meta.env.DEV) console.error('[FileStorageAggregator] Download error:', err);
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
  const [isSavingShare] = useState(false);
  const [thirdPartyIndexers, setThirdPartyIndexers] = useState<any[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [indexingPermissionsState, setIndexingPermissionsState] = useState<any>(null);
  const [isLoadingIndexers, setIsLoadingIndexers] = useState(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);

  // Load file metadata
  const loadFileMetadata = async (fileId: string) => {
    if (metadataMissingIdsRef.current.has(fileId)) {
      return null;
    }
    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return null;

      const response = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
        method: 'GET',
        headers: getOwnerApiHeaders()
      });

      if (response.ok) {
        const metadata = await response.json();
        const finalMetadata = metadata.metadata || metadata;
        
        // Debug logging for collections to check isThoughtCollection flag
        if (finalMetadata?.fileType === 'collection' && import.meta.env.DEV) {
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
        metadataMissingIdsRef.current.add(fileId);
        return null;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[FileStorageAggregator] Failed to load metadata:', err);
    }
    return null;
  };

  const loadFilesForAccount = useLoadFilesForAccount({
    authenticatedUserId: authenticatedUser?.id,
    pnIdentifier: userState.pnIdentifier,
    driveAccounts,
    fileMetadataMap,
    loadFileMetadata,
    setFilesByAccount,
    setError,
  });

  loadFilesForAccountRef.current = loadFilesForAccount;

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
              if (import.meta.env.DEV) console.error(`[FileStorageAggregator] Failed to load files for account ${account.accountId}:`, err);
            }
          }
        } finally {
          setIsLoading(false);
        }
      };
      loadAllFiles();
    }
  }, [driveAccounts.length, authenticatedUser?.id]);

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

      let catalogIndexers: Array<{ id: string; name: string; description?: string }> = [];
      const catalogRes = await fetch(`${API_ENDPOINT}/api/third-party/indexers`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (catalogRes.ok) {
        const catalogData = await catalogRes.json();
        catalogIndexers = catalogData.indexers ?? [];
      }

      if (visibilityResponse.ok) {
        const visibilityData = await visibilityResponse.json();
        setIndexingPermissionsState(visibilityData.indexingPermissions || null);

        const fromVisibility = visibilityData.indexers ?? [];
        const merged = new Map<string, { id: string; name: string; description?: string }>();
        for (const idx of catalogIndexers) merged.set(idx.id, idx);
        for (const idx of fromVisibility) merged.set(idx.id, { ...merged.get(idx.id), ...idx });
        const indexers = Array.from(merged.values());

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
      if (import.meta.env.DEV) console.error('[FileStorageAggregator] Failed to load indexers:', err);
      setIndexerError('Failed to load third-party indexers');
    } finally {
      setIsLoadingIndexers(false);
    }
  };

  // Handle edit metadata
  const handleEditMetadata = async (file: DriveFile) => {
    
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
        if (import.meta.env.DEV) console.log('✅ [Metadata] Metadata updated:', result);
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
          scheduleLoadFilesForAccount(accountId);
        }
      },
      onError: (error) => {
        if (import.meta.env.DEV) console.error('❌ [Metadata] Failed to update metadata:', error);
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
        if (import.meta.env.DEV) console.log('✅ [ShareSettings] Share settings updated:', result);
        // Reload metadata and files if making public
        if (result?.isPublic && accountId) {
          scheduleLoadFilesForAccount(accountId, 1200);
        } else {
          loadFileMetadata(fileId);
        }
      },
      onError: (error) => {
        if (import.meta.env.DEV) console.error('❌ [ShareSettings] Failed to update share settings:', error);
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
        if (import.meta.env.DEV) console.log('✅ [Delete] File deleted:', result);
        // Reload files to ensure consistency
        setTimeout(() => {
          loadFilesForAccount(accountId);
        }, 500);
      },
      onError: (error) => {
        if (import.meta.env.DEV) console.error('❌ [Delete] Failed to delete file:', error);
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
        if (import.meta.env.DEV) console.log('✅ [BulkDelete] Files deleted:', result);
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
        if (import.meta.env.DEV) console.error('❌ [BulkDelete] Failed to delete files:', error);
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
        if (import.meta.env.DEV) console.log('✅ [Collection] Collection created:', result);
        // Reload files
        if (accountId && result?.fileId) {
          setTimeout(() => {
            loadFilesForAccount(accountId);
          }, 1000);
        }
      },
      onError: (error) => {
        if (import.meta.env.DEV) console.error('❌ [Collection] Failed to create collection:', error);
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
        headers: getOwnerApiHeaders({ 'Content-Type': 'application/json' }),
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
      if (import.meta.env.DEV) console.error('[FileStorageAggregator] Set top post error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load metadata for files when menu opens
  useEffect(() => {
    if (openMenuFor) {
      // Load metadata for the file when menu opens
      loadFileMetadata(openMenuFor).catch(err => {
        if (import.meta.env.DEV) console.warn('[FileStorageAggregator] Failed to load metadata for menu:', err);
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



  // Convert PDF pages to thumbnails and upload them

  const addUploadTask = (file: File, accountId: string, encrypt: boolean) => {
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const taskType = isPDF ? 'pdf' : 'file';
    const isAudio = file.type.startsWith('audio/');
    const registryTrackId =
      isAudio && nextAudioRegistryTrackId.trim().length > 0 ? nextAudioRegistryTrackId.trim() : undefined;
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
        registryTrackId,
      },
      onComplete: () => {
        if (import.meta.env.DEV) console.log('✅ [Upload] File upload completed');
      },
      onError: (err) => {
        if (import.meta.env.DEV) console.error('❌ [Upload] File upload failed:', err);
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

      {showUnencryptedAlert && pendingUnencryptedUpload && (
        <UnencryptedUploadAlert
          limitMb={pendingUnencryptedUpload.limitMb}
          onConfirm={handleUnencryptedUploadConfirm}
          onCancel={handleUnencryptedUploadCancel}
        />
      )}

      {/* File List - One section per account */}
      {hasConnectedBackends && (
        <div className="space-y-6">
          {authenticatedUser?.id && userState.isUnlocked && musicCatalog.length > 0 && (
            <div className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-4 py-3">
              <label className="block text-xs font-medium text-neutral-300 mb-1">
                Licensed library track (optional)
              </label>
              <p className="text-[11px] text-neutral-500 mb-2 max-w-xl">
                Applies to the next audio upload from this screen. Links the post to the registry for creator-fund
                75/25 splits. You can change it later in Edit.
              </p>
              <select
                value={nextAudioRegistryTrackId}
                onChange={(e) => setNextAudioRegistryTrackId(e.target.value)}
                className="w-full max-w-md rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-white"
              >
                <option value="">None</option>
                {musicCatalog.map((t) => (
                  <option key={t.id} value={t.id}>
                    {(t.displayArtist ? `${t.displayArtist} — ` : '') + t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {driveAccounts.map((account, index) => (
            <AccountFilesPanel
              key={account.accountId}
              account={account}
              index={index}
              accountFiles={filesByAccount.get(account.accountId) || []}
              isLoading={isLoading}
              viewMode={viewMode}
              setViewMode={setViewMode}
              isBulkDeleteMode={isBulkDeleteMode}
              setIsBulkDeleteMode={setIsBulkDeleteMode}
              isCollectionMode={isCollectionMode}
              setIsCollectionMode={setIsCollectionMode}
              selectedFiles={selectedFiles}
              setSelectedFiles={setSelectedFiles}
              collectionFileOrder={collectionFileOrder}
              setCollectionFileOrder={setCollectionFileOrder}
              toggleFileSelection={toggleFileSelection}
              selectAllFiles={selectAllFiles}
              fileMetadataMap={fileMetadataMap}
              openMenuFor={openMenuFor}
              setOpenMenuFor={setOpenMenuFor}
              setMenuPosition={setMenuPosition}
              showAddMenuFor={showAddMenuFor}
              setShowAddMenuFor={setShowAddMenuFor}
              addMenuPosition={addMenuPosition}
              setAddMenuPosition={setAddMenuPosition}
              setViewingFile={setViewingFile}
              setDriveAccounts={setDriveAccounts}
              setSelectedAccountId={setSelectedAccountId}
              setError={setError}
              fileInputRefs={fileInputRefs}
              addButtonRefs={addButtonRefs}
              menuButtonRefs={menuButtonRefs}
              loadFilesForAccount={loadFilesForAccount}
              handleUploadForAccount={handleUploadForAccount}
              addUploadTask={addUploadTask}
              handleCreateCollection={handleCreateCollection}
              handleBulkDelete={handleBulkDelete}
              onOpenTextEditor={onOpenTextEditor}
            />
          ))}
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

      {sharingFile && (
        <ShareSettingsModal
          sharingFile={sharingFile}
          shareVisibility={shareVisibility}
          setShareVisibility={setShareVisibility}
          shareNSFW={shareNSFW}
          setShareNSFW={setShareNSFW}
          thirdPartyIndexers={thirdPartyIndexers}
          indexerToggles={indexerToggles}
          isLoadingIndexers={isLoadingIndexers}
          indexerError={indexerError}
          isSavingShare={isSavingShare}
          loadThirdPartyIndexers={loadThirdPartyIndexers}
          onIndexerToggle={handleIndexerToggle}
          onSave={handleSaveShareSettings}
          onClose={closeShareSettings}
        />
      )}

      {/* Portal-based menu for both grid and list views */}
      <FileActionMenu
        openMenuFor={openMenuFor}
        menuPosition={menuPosition}
        filesByAccount={filesByAccount}
        fileMetadataMap={fileMetadataMap}
        actionMenuRef={actionMenuRef}
        isLoading={isLoading}
        setOpenMenuFor={setOpenMenuFor}
        setMenuPosition={setMenuPosition}
        handleEditMetadata={handleEditMetadata}
        handleDownload={handleDownload}
        handleShareSettings={handleShareSettings}
        handleSetTopPost={handleSetTopPost}
        handleDelete={handleDelete}
      />
      
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
