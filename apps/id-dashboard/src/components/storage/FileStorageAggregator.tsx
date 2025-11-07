/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState, useEffect, useRef } from 'react';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, EyeOff, Info, X, Edit, Eye, Grid, List, Plus, Cloud } from 'lucide-react';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, EncryptedFilePackage } from '../../types/aggregator';
import { AuthSession as CryptoAuthSession } from '../../types/crypto';

const GOOGLE_DRIVE_ICON_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Google_Drive_icon_%282020%29.svg/1200px-Google_Drive_icon_%282020%29.svg.png';

interface FileStorageAggregatorProps {
  authenticatedUser?: AuthSession | CryptoAuthSession | any | null;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ authenticatedUser }) => {
  // Cache for share tokens (fileId -> shareToken) - generated during upload for quick access
  const shareTokenCache = React.useRef<Map<string, ShareToken>>(new Map());
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  
  // Use global constructors directly - terser will preserve them via reserved list
  
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<AggregatedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [resolvedAuth, setResolvedAuth] = useState<{ pnName: string; publicKey: string } | null>(null);
  
  const [showDesktopAppInfo, setShowDesktopAppInfo] = useState(false);
  const [editingFile, setEditingFile] = useState<AggregatedFile | null>(null);
  const [editForm, setEditForm] = useState<{ 
    name: string; 
    description: string; 
    tags: string;
    genre: string;
    category: string;
    locationName: string;
    locationAddress: string;
    locationLat: string;
    locationLng: string;
    license: string;
    language: string;
  }>({ 
    name: '', 
    description: '', 
    tags: '',
    genre: '',
    category: '',
    locationName: '',
    locationAddress: '',
    locationLat: '',
    locationLng: '',
    license: '',
    language: ''
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [viewingFile, setViewingFile] = useState<AggregatedFile | null>(null);
  const [filePreviewUrls, setFilePreviewUrls] = useState<Map<string, string>>(new Map()); // fileId -> decrypted blob URL
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());
  // Version check - this will help verify new code is loading
  React.useEffect(() => {
    console.log('🚀 [FileStorageAggregator] Component loaded - Version: 2024-12-05-v2');
  }, []);

  // Initialize services - useMemo to avoid re-initializing on every render
  const aggregatorService = React.useMemo(() => {
    try {
      return getFileAggregatorService();
    } catch (e) {
      console.error('Failed to initialize aggregator service:', e);
      return null;
    }
  }, []);
  
  const encryptionService = React.useMemo(() => {
    try {
      return getEncryptionService();
    } catch (e) {
      console.error('Failed to initialize encryption service:', e);
      return null;
    }
  }, []);
  
  const metadataIndexService = React.useMemo(() => {
    try {
      return getMetadataIndexService();
    } catch (e) {
      console.error('Failed to initialize metadata service:', e);
      return null;
    }
  }, []);
  
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, PublicMetadata>>(new Map());

  const googleDriveEmail =
    userEmails.get('google_drive') ||
    (() => {
      try {
        return localStorage.getItem('google_drive_email');
      } catch (e) {
        return null;
      }
    })() ||
    (authenticatedUser as any)?.email ||
    undefined;

  // Load Google Drive token from encrypted metadata when user unlocks
  useEffect(() => {
    const loadTokenFromMetadata = async () => {
      // Only run if we have authenticated user and passcode
      if (!authenticatedUser?.id || !authenticatedUser?.pnName) {
        return;
      }

      try {
        const passcode = sessionStorage.getItem('pn_session_passcode');
        if (!passcode) {
          return; // No passcode yet, wait for unlock
        }

        if (!aggregatorService) {
          return;
        }
        
        const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
        const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');
        const googleDriveBackend = aggregatorService.getBackend('google_drive');
        
        if (!googleDriveBackend) {
          return;
        }

        const metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);
        if (metadata) {
          const decrypted = await SecureMetadataCrypto.decryptMetadata(
            metadata,
            authenticatedUser.pnName,
            passcode
          );
          
          if (decrypted.storageCredentials?.googleDrive) {
            const creds = decrypted.storageCredentials.googleDrive;
            const token = creds.accessToken;
            const refreshToken = creds.refreshToken || null; // Load refresh token for automatic renewal
            const email = creds.email || null;

            // Connect using token from metadata (including refresh token for auto-renewal)
            if (token && !connectedBackends.has('google_drive')) {
              try {
                await googleDriveBackend.connect({ 
                  token, 
                  email: email || undefined,
                  refreshToken: refreshToken || undefined 
                });
                setConnectedBackends(prev => new Set([...prev, 'google_drive']));
                if (email) {
                  setUserEmails(prev => {
                    const next = new Map(prev);
                    next.set('google_drive', email);
                    return next;
                  });
                }
                await loadFiles();
                await loadStorageQuota();
                console.log('✅ [loadTokenFromMetadata] Restored Google Drive connection from encrypted metadata');
              } catch (err) {
                console.warn('⚠️ [loadTokenFromMetadata] Token from metadata failed, may be expired:', err);
              }
            }
          }
        }
      } catch (error) {
        // Silently fail - metadata might not exist yet
        console.debug('Could not load token from metadata:', error);
      }
    };

    loadTokenFromMetadata();
  }, [authenticatedUser?.id, authenticatedUser?.pnName, connectedBackends, aggregatorService]);

  // Initialize and restore connections (legacy localStorage fallback)
  useEffect(() => {
    const init = async () => {
      // Ensure backends are initialized
      await aggregatorService.ensureInitialized();
      
      // Get Google Drive backend
      const googleDriveBackend = aggregatorService.getBackend('google_drive');
      
      if (!googleDriveBackend) {
        console.error('Google Drive backend not found');
        return;
      }
      
      // Try to load token from encrypted metadata first (preferred)
      // Fallback to localStorage for backward compatibility
      let token: string | null = null;
      let email: string | null = null;
      
      // Try loading from encrypted metadata if we have credentials
      if (authenticatedUser?.id && authenticatedUser?.pnName) {
        try {
          const passcode = sessionStorage.getItem('pn_session_passcode');
          if (passcode) {
            const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
            const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');
            
            const metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);
            if (metadata) {
              const decrypted = await SecureMetadataCrypto.decryptMetadata(
                metadata,
                authenticatedUser.pnName,
                passcode
              );
              
              if (decrypted.storageCredentials?.googleDrive) {
                const creds = decrypted.storageCredentials.googleDrive;
                token = creds.accessToken;
                email = creds.email || null;
                // Also load refresh token to localStorage for quick access
                if (creds.refreshToken) {
                  localStorage.setItem('google_drive_refresh_token', creds.refreshToken);
                }
                console.log('✅ [init] Loaded Google Drive token and refresh token from encrypted metadata');
              }
            }
          }
        } catch (metadataError) {
          console.warn('⚠️ [init] Could not load token from metadata (will try localStorage):', metadataError);
        }
      }
      
      // Fallback to localStorage
      if (!token) {
        token = localStorage.getItem('google_drive_token');
        email = localStorage.getItem('google_drive_email');
        if (token) {
          console.log('📦 [init] Loaded Google Drive token from localStorage (legacy)');
        }
      }
      
      if (token) {
        try {
          await googleDriveBackend.connect({ token, email: email || undefined });
          setConnectedBackends(prev => new Set([...prev, 'google_drive']));
          if (email) {
            setUserEmails(prev => {
              const next = new Map(prev);
              next.set('google_drive', email);
              return next;
            });
          }
          await loadFiles();
          await loadStorageQuota();
        } catch (err) {
          console.error('Failed to restore Google Drive connection:', err);
          // If token expired, clear it and show disconnect
          if (err instanceof Error && err.message.includes('expired')) {
            setConnectedBackends(prev => {
              const next = new Set(prev);
              next.delete('google_drive');
              return next;
            });
            setError('Google Drive authentication expired. Please reconnect.');
          }
        }
      }
    };
    
    init();

    // Listen for token expiration events
    const handleTokenExpired = () => {
      console.warn('Google Drive token expired - disconnecting');
      setConnectedBackends(prev => {
        const next = new Set(prev);
        next.delete('google_drive');
        return next;
      });
      setUserEmails(prev => {
        const next = new Map(prev);
        next.delete('google_drive');
        return next;
      });
      setError('Google Drive authentication expired. Please reconnect.');
      setFiles([]);
    };

    window.addEventListener('google-drive-token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('google-drive-token-expired', handleTokenExpired);
    };
  }, []);

  // Resolve auth credentials
  useEffect(() => {
    const resolveAuth = async () => {
      // Always log - this is critical debugging
      console.log('🔍 [FileStorageAggregator] Resolving auth...');
      console.log('🔍 [FileStorageAggregator] authenticatedUser prop:', authenticatedUser);
      
      // Try prop first
      if (authenticatedUser) {
        // Safely get keys without breaking if object has getters
        try {
          console.log('🔍 [FileStorageAggregator] authenticatedUser keys:', Object.keys(authenticatedUser));
          console.log('🔍 [FileStorageAggregator] authenticatedUser structure:', {
            id: authenticatedUser.id,
            pnName: authenticatedUser.pnName,
            publicKey: authenticatedUser.publicKey,
            nickname: authenticatedUser.nickname,
            username: (authenticatedUser as any).username,
            name: (authenticatedUser as any).name,
            fullObject: JSON.stringify(authenticatedUser, null, 2)
          });
        } catch (e) {
          console.warn('🔍 [FileStorageAggregator] Could not inspect authenticatedUser:', e);
        }
        
        // Try multiple ways to extract pnName
        let pnName = authenticatedUser.pnName;
        if (!pnName) {
          pnName = (authenticatedUser as any).username;
        }
        if (!pnName) {
          pnName = (authenticatedUser as any).name;
        }
        if (!pnName && authenticatedUser.id && typeof authenticatedUser.id === 'string') {
          // Last resort: try to extract from id if it's a username pattern
          const idParts = authenticatedUser.id.split('-');
          if (idParts.length > 0 && idParts[0] !== 'did:key') {
            pnName = idParts[0];
          }
        }
        
        // Try multiple ways to extract publicKey
        let publicKey = authenticatedUser.publicKey;
        if (!publicKey && authenticatedUser.id) {
          if (typeof authenticatedUser.id === 'string' && authenticatedUser.id.startsWith('did:key:')) {
            publicKey = authenticatedUser.id;
          } else if (typeof authenticatedUser.id === 'string') {
            // Use id as publicKey if it's not a DID
            publicKey = authenticatedUser.id;
          }
        }
        
        console.log('🔍 [FileStorageAggregator] Extracted from prop:', { 
          pnName, 
          publicKey, 
          hasId: !!authenticatedUser.id,
          idValue: authenticatedUser.id,
          idType: typeof authenticatedUser.id,
          hasPnName: !!authenticatedUser.pnName,
          hasUsername: !!(authenticatedUser as any).username,
          hasName: !!(authenticatedUser as any).name,
          hasPublicKey: !!authenticatedUser.publicKey
        });
        
        let passcode: string | null = null;
        try {
          passcode = sessionStorage.getItem('pn_session_passcode');
          console.log('🔍 [FileStorageAggregator] Passcode from sessionStorage:', passcode ? 'found' : 'not found');
        } catch (e) {
          console.warn('🔍 [FileStorageAggregator] sessionStorage not available');
        }
        
        if (pnName && publicKey) {
          console.log('✅ [FileStorageAggregator] Auth resolved from prop:', { hasPnName: !!pnName, publicKey: publicKey.substring(0, 20) + '...' });
          const resolved = { pnName, publicKey, passcode: passcode || undefined };
          setResolvedAuth(resolved);
          setError(null);
          return;
        } else {
          console.warn('⚠️ [FileStorageAggregator] Missing credentials from prop:', { 
            pnName, 
            publicKey,
            hasPnName: !!pnName, 
            hasPublicKey: !!publicKey,
            authenticatedUserKeys: Object.keys(authenticatedUser || {})
          });
        }
      } else {
        console.log('⚠️ [FileStorageAggregator] No authenticatedUser prop');
      }
      
      // Fallback: Try to load from storage
      try {
        console.log('🔍 [FileStorageAggregator] Trying storage fallback...');
        const { SecureStorage } = await import('../../utils/storage');
        const storage = new SecureStorage();
        await storage.init(); // Initialize database first
        const session = await storage.getCurrentSession();
        
        console.log('🔍 [FileStorageAggregator] Session from storage:', session);
        
        if (session) {
          const pnName = (session as any).pnName || (session as any).username || (session as any).name;
          const publicKey = (session as any).publicKey || 
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id);
          
          console.log('🔍 [FileStorageAggregator] Extracted from storage:', { hasPnName: !!pnName, publicKey: publicKey.substring(0, 20) + '...', sessionKeys: Object.keys(session) });
          
          let passcode: string | null = null;
          try {
            passcode = sessionStorage.getItem('pn_session_passcode');
          } catch (e) {
            // sessionStorage might not be available
          }
          
          if (pnName && publicKey) {
            console.log('✅ [FileStorageAggregator] Auth resolved from storage');
            setResolvedAuth({ pnName, publicKey, passcode: passcode || undefined });
            setError(null);
          } else {
            console.warn('⚠️ [FileStorageAggregator] Missing credentials from storage:', { hasPnName: !!pnName, hasPublicKey: !!publicKey });
          }
        } else {
          console.warn('⚠️ [FileStorageAggregator] No session found in storage');
        }
      } catch (err) {
        console.error('❌ [FileStorageAggregator] Error loading from storage:', err);
      }
    };
    
    // Wrap in try-catch to prevent unhandled promise rejections
    resolveAuth().catch((err) => {
      console.error('❌ [FileStorageAggregator] Auth resolution failed:', err);
      // Don't break the app - just log the error
    });
  }, [authenticatedUser]);

  const loadFiles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Ensure backends are initialized (gracefully fail if Google Drive not connected)
      // Don't block unlock if Google Drive initialization fails
      if (!aggregatorService) {
        console.warn('⚠️ [loadFiles] Aggregator service not available');
        setIsLoading(false);
        setFiles([]);
        return;
      }
      
      try {
        await aggregatorService.ensureInitialized();
      } catch (initError) {
        // Don't log as error - just return empty list
        console.warn('⚠️ [loadFiles] Backend initialization skipped (Google Drive may not be connected)');
        setIsLoading(false);
        setFiles([]); // Set empty files, don't show error
        return;
      }
      
      // Try to generate pN identifier - if it fails, backend will search for folders directly
      let currentPnIdentifier: string | undefined = undefined;
      
      try {
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        
        // Get credentials (prioritize resolvedAuth, fallback to authenticatedUser + sessionStorage)
        let pnName: string | null = null;
        let publicKey: string | null = null;
        let passcode: string | null = null;
        
        if (resolvedAuth?.pnName && resolvedAuth?.publicKey && resolvedAuth?.passcode) {
          pnName = resolvedAuth.pnName;
          publicKey = resolvedAuth.publicKey;
          passcode = resolvedAuth.passcode;
        } else if (authenticatedUser) {
          pnName = authenticatedUser.pnName || authenticatedUser.username || (authenticatedUser as any).name || null;
          publicKey = authenticatedUser.publicKey || 
            (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
          try {
            passcode = sessionStorage.getItem('pn_session_passcode');
          } catch (e) {
            // Ignore sessionStorage errors
          }
        }
        
        // If still missing, try loading from SecureStorage
        if ((!pnName || !publicKey || !passcode)) {
          try {
            const { SecureStorage } = await import('../../utils/storage');
            const storage = new SecureStorage();
            await storage.init();
            const session = await storage.getCurrentSession();
            if (session) {
              if (!pnName) pnName = (session as any).pnName || (session as any).username || (session as any).name || null;
              if (!publicKey) publicKey = (session as any).publicKey || 
                (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
              if (!passcode) {
                try {
                  passcode = sessionStorage.getItem('pn_session_passcode');
                } catch (e) {
                  // Ignore
                }
              }
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // Generate identifier if we have all credentials
        if (pnName && publicKey && passcode) {
          currentPnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode,
            publicKey
          });
          console.log(`✅ [loadFiles] Generated pN identifier: ${currentPnIdentifier.substring(0, 8)}...`);
        } else {
          console.log(`⚠️ [loadFiles] Cannot generate pN identifier (missing: ${!pnName ? 'pnName ' : ''}${!publicKey ? 'publicKey ' : ''}${!passcode ? 'passcode' : ''}) - backend will search for folders directly`);
        }
      } catch (err) {
        console.warn('⚠️ [loadFiles] Failed to generate pN identifier:', err);
      }
      
      // Fallback: derive identifier from stable DID + public key (no passcode required)
      if (!currentPnIdentifier) {
        try {
          const idSource = authenticatedUser?.id || resolvedAuth?.publicKey;
          const publicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey || (authenticatedUser?.id && authenticatedUser?.id.startsWith('did:key:') ? authenticatedUser.id : undefined);
          if (idSource && publicKey) {
            const combined = `${idSource}:${publicKey}`;
            const encoder = new TextEncoder();
            const data = encoder.encode(combined);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            currentPnIdentifier = `pn-${hexHash.substring(0, 12)}`;
            console.log(`✅ [loadFiles] Using fallback pN identifier: ${currentPnIdentifier}`);
          }
        } catch (fallbackError) {
          console.warn('⚠️ [loadFiles] Fallback identifier generation failed:', fallbackError);
        }
      }
      
      if (!currentPnIdentifier) {
        console.warn('⚠️ [loadFiles] Unable to determine pN identifier - owner index cannot be loaded until credentials are available');
      }
      
      // PRIMARY: Load files from owner-file-index.json (contains ALL files - private, public, friends)
      // This is the source of truth for the owner's files - same logic as aggregator browser uses for public files
      const backend = aggregatorService?.getBackend('google_drive');
      if (backend && backend.isConnected() && currentPnIdentifier) {
        try {
          const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');
          
          if (token) {
            console.log('📋 [loadFiles] Loading files from owner index (same as aggregator browser)...', { pnIdentifier: currentPnIdentifier });
            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(token, currentPnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(token, pnFolderId);
            const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndex(token, metadataFolderId, currentPnIdentifier);
            
            console.log('📋 [loadFiles] Owner index loaded:', { 
              hasIndex: !!ownerIndex, 
              fileCount: ownerIndex?.files?.length || 0,
              indexKeys: ownerIndex ? Object.keys(ownerIndex) : []
            });
            
            if (ownerIndex && ownerIndex.files && ownerIndex.files.length > 0) {
              console.log(`✅ [loadFiles] Found ${ownerIndex.files.length} file(s) in owner index - using as source of truth`);
              
              // Convert owner index entries to AggregatedFile format (same structure as aggregator browser)
              const aggregatedFiles: AggregatedFile[] = ownerIndex.files.map((entry: any) => ({
                id: entry.fileId,
                backend: 'google_drive',
                backendFileId: entry.googleDriveFileId,
                name: entry.fileName,
                originalName: entry.originalName || entry.fileName,
                mimeType: entry.mimeType,
                size: entry.size?.toString() || '0',
                encrypted: true, // All files in owner index are encrypted
                visibility: entry.visibility || 'private'
              }));
              
              setFiles(aggregatedFiles);
              
              // Load metadata (convert owner index entries to PublicMetadata format - same as aggregator browser)
              const metadataMap = new Map<string, PublicMetadata>();
              ownerIndex.files.forEach((entry: any) => {
                const fileId = entry.fileId;
                const publicMetadata: PublicMetadata = {
                  fileId: fileId,
                  backend: 'google_drive',
                  backendFileId: entry.googleDriveFileId,
                  name: entry.originalName || entry.fileName,
                  description: entry.description,
                  keywords: entry.tags || [],
                  uploadDate: entry.uploadedAt,
                  fileType: entry.mimeType?.split('/')[0] || 'other',
                  isPublic: entry.visibility === 'public',
                  creator: entry.owner?.did ? {
                    '@type': 'Person',
                    '@id': entry.owner.did,
                    identifier: {
                      '@type': 'PropertyValue',
                      name: 'DID',
                      value: entry.owner.did
                    }
                  } : undefined,
                  thumbnail: entry.thumbnail,
                  publicToken: entry.publicToken, // Share token - SAME as aggregator browser uses
                  engagement: entry.engagement,
                  inReplyTo: entry.inReplyTo,
                  repostOf: entry.repostOf,
                  isPartOf: entry.isPartOf,
                  '@context': ['https://schema.org/'],
                  '@type': 'CreativeWork',
                  '@id': `https://parnoir.com/resource/${fileId}`
                };
                metadataMap.set(fileId, publicMetadata);
                
                // Cache share token if available (SAME as aggregator browser)
                if (entry.publicToken) {
                  try {
                    const shareToken = typeof entry.publicToken === 'string'
                      ? JSON.parse(entry.publicToken)
                      : entry.publicToken;
                    shareTokenCache.current.set(entry.googleDriveFileId, shareToken);
                    console.log('💾 [loadFiles] Cached share token from owner index for file:', fileId, { hasToken: !!shareToken });
                  } catch (e) {
                    console.warn('⚠️ [loadFiles] Failed to cache token from owner index:', e, { publicToken: entry.publicToken });
                  }
                } else {
                  console.warn('⚠️ [loadFiles] File in owner index has no publicToken:', fileId, entry.fileName);
                }
              });
              
              setFileMetadataMap(metadataMap);
              setIsLoading(false);
              console.log('✅ [loadFiles] Successfully loaded from owner index - ready for token-based decryption');
              return; // Successfully loaded from owner index
            } else {
              console.log('📋 [loadFiles] Owner index is empty or doesn\'t exist, falling back to scanning Google Drive');
            }
          } else {
            console.warn('⚠️ [loadFiles] No Google Drive token available for owner index');
          }
        } catch (ownerIndexError) {
          console.error('❌ [loadFiles] Failed to load from owner index, falling back to scanning:', ownerIndexError);
        }
      } else {
        console.warn('⚠️ [loadFiles] Cannot load from owner index:', { 
          hasBackend: !!backend, 
          isConnected: backend?.isConnected(), 
          hasPnIdentifier: !!currentPnIdentifier 
        });
      }
      
      // FALLBACK: Scan Google Drive if owner index doesn't exist or is empty (backwards compatibility)
      // BUT: Still try to load tokens from owner index for these files
      try {
        console.log('📁 [loadFiles] Falling back to Google Drive scan...');
        const aggregatedFiles = await aggregatorService.aggregateFiles(currentPnIdentifier || undefined);
        console.log(`📁 [loadFiles] Found ${aggregatedFiles.length} file(s) from Google Drive scan`);
        setFiles(aggregatedFiles);
        
        // IMPORTANT: Still try to load tokens from owner index for these files
        if (backend && backend.isConnected() && currentPnIdentifier) {
          try {
            const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
            const token = (backend as any).token || localStorage.getItem('google_drive_token');
            if (token) {
              const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(token, currentPnIdentifier);
              const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(token, pnFolderId);
              const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndex(token, metadataFolderId, currentPnIdentifier);
              
              if (ownerIndex?.files) {
                // Match files and load tokens
                aggregatedFiles.forEach((file: AggregatedFile) => {
                  const indexEntry = ownerIndex.files.find((entry: any) => entry.googleDriveFileId === file.backendFileId);
                  if (indexEntry?.publicToken) {
                    try {
                      const shareToken = typeof indexEntry.publicToken === 'string'
                        ? JSON.parse(indexEntry.publicToken)
                        : indexEntry.publicToken;
                      shareTokenCache.current.set(file.backendFileId, shareToken);
                      console.log('💾 [loadFiles] Loaded token from owner index for scanned file:', file.id);
                    } catch (e) {
                      console.warn('⚠️ [loadFiles] Failed to parse token for scanned file:', e);
                    }
                  }
                });
              }
            }
          } catch (tokenLoadError) {
            console.warn('⚠️ [loadFiles] Failed to load tokens from owner index for scanned files:', tokenLoadError);
          }
        }
        
        // Load metadata for all files (non-blocking)
        loadFileMetadata(aggregatedFiles).catch((err) => {
          console.warn('⚠️ Failed to load file metadata (non-blocking):', err);
        });
      } catch (aggregateError) {
        // Don't break unlock if file aggregation fails
        console.warn('⚠️ Failed to aggregate files (non-blocking, unlock can proceed):', aggregateError);
        setFiles([]); // Just show empty list
      }
    } catch (err) {
      // Don't set error or break unlock - just log it
      console.warn('⚠️ [loadFiles] Error (non-blocking, unlock can proceed):', err);
      setFiles([]); // Show empty list
    } finally {
      setIsLoading(false);
    }
  };

  const loadFileMetadata = async (filesToLoad: AggregatedFile[]) => {
    try {
      console.log('📋 [Metadata] Loading file metadata...', { fileCount: filesToLoad.length });
      // Load metadata from owner index for all files (since user owns them)
      const backend = aggregatorService?.getBackend('google_drive');
      if (backend && backend.isConnected() && resolvedAuth?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');
          
          if (token) {
            console.log('✅ [Metadata] Google Drive connected, loading owner index...');
            // Generate stable pN identifier
            let pnIdentifier: string;
            if (authenticatedUser?.id && resolvedAuth?.publicKey) {
              const combined = `${authenticatedUser.id}:${resolvedAuth.publicKey}`;
              const encoder = new TextEncoder();
              const data = encoder.encode(combined);
              const hashBuffer = await crypto.subtle.digest('SHA-256', data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              const shortHash = hexHash.substring(0, 12);
              pnIdentifier = `pn-${shortHash}`;
            } else {
              pnIdentifier = resolvedAuth.pnName;
            }

            // Get pN folder and metadata folder
            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(token, pnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(token, pnFolderId);
            
            // Load owner index (contains all files with thumbnails)
            const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndex(token, metadataFolderId, pnIdentifier);
            
            if (ownerIndex && ownerIndex.files) {
              const metadataMap = new Map<string, PublicMetadata>();
              
              // Create a map of backendFileId to metadata
              const indexMap = new Map<string, any>();
              ownerIndex.files.forEach(entry => {
                indexMap.set(entry.googleDriveFileId, entry);
              });

              // Match files with owner index entries
              for (const file of filesToLoad) {
                const indexEntry = indexMap.get(file.backendFileId);
                if (indexEntry) {
                  // Convert to PublicMetadata format
                  const publicMetadata: PublicMetadata = {
                    fileId: indexEntry.fileId || file.id,
                    backend: file.backend,
                    backendFileId: indexEntry.googleDriveFileId,
                    name: indexEntry.originalName || indexEntry.fileName,
                    description: indexEntry.description,
                    keywords: indexEntry.tags || [],
                    uploadDate: indexEntry.uploadedAt,
                    fileType: indexEntry.mimeType?.split('/')[0] || 'other',
                    isPublic: indexEntry.visibility === 'public',
                    creator: indexEntry.owner?.did ? {
                      '@type': 'Person',
                      '@id': indexEntry.owner.did,
                      identifier: {
                        '@type': 'PropertyValue',
                        name: 'DID',
                        value: indexEntry.owner.did
                      }
                    } : undefined,
                    thumbnail: indexEntry.thumbnail,
                    publicToken: indexEntry.publicToken, // Share token stored on upload - available for owner viewing
                    engagement: indexEntry.engagement,
                    inReplyTo: indexEntry.inReplyTo,
                    repostOf: indexEntry.repostOf,
                    isPartOf: indexEntry.isPartOf,
                    '@context': ['https://schema.org/'],
                    '@type': 'CreativeWork',
                    '@id': `https://parnoir.com/resource/${indexEntry.fileId || file.id}`
                  };
                  metadataMap.set(file.id, publicMetadata);
                  
                  // If token exists, cache it for quick access
                  if (indexEntry.publicToken) {
                    try {
                      const token = typeof indexEntry.publicToken === 'string'
                        ? JSON.parse(indexEntry.publicToken)
                        : indexEntry.publicToken;
                      shareTokenCache.current.set(file.backendFileId, token);
                      console.log('💾 [Metadata] Cached share token from owner index for file:', file.id);
                    } catch (e) {
                      console.warn('⚠️ [Metadata] Failed to cache token from owner index:', e);
                    }
                  }
                }
              }
              
              setFileMetadataMap(metadataMap);
              return; // Successfully loaded from owner index
            }
          }
        } catch (ownerIndexError) {
          console.warn('Failed to load from owner index, falling back to metadata service:', ownerIndexError);
        }
      }

      // Fallback to metadata index service if owner index not available
      if (!metadataIndexService) {
        return;
      }
      
      await metadataIndexService.initialize();
      const metadataMap = new Map<string, PublicMetadata>();
      for (const file of filesToLoad) {
        const metadata = await metadataIndexService.getFileMetadata(file.id);
        if (metadata) {
          metadataMap.set(file.id, metadata);
        }
      }
      setFileMetadataMap(metadataMap);
    } catch (err) {
      console.error('Failed to load file metadata:', err);
    }
  };

  const handleTogglePublic = async (file: AggregatedFile) => {
    try {
      if (!metadataIndexService) {
        setError('Metadata service not available');
        return;
      }
      
      await metadataIndexService.initialize();
      
      const existingMetadata = fileMetadataMap.get(file.id);
      const isCurrentlyPublic = existingMetadata?.isPublic || false;

      if (isCurrentlyPublic) {
        // Make private - remove from index
        await metadataIndexService.removeFromIndex(file.id);
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.delete(file.id);
          return next;
        });
      } else {
        // Make public - create metadata and index
        if (!resolvedAuth?.pnName || !resolvedAuth?.publicKey) {
          setError('Please unlock your pN to make files public');
          return;
        }

        // Generate public metadata with Semantic Web standards (JSON-LD)
        // CRITICAL: Never include pN name (username) in public metadata - it's a secret
        const fileTitle = file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name;
        
        // Detect file type from mimeType (if original) or filename
        // Encrypted files have mimeType "application/json", so we need to detect from filename
        let mimeCategory = file.mimeType?.split('/')[0] || 'file';
        if (mimeCategory === 'application' || mimeCategory === 'file') {
          // Try to detect from filename
          const fileName = fileTitle.toLowerCase();
          if (fileName.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/)) {
            mimeCategory = 'image';
          } else if (fileName.match(/\.(mp4|mov|avi|webm|mkv)$/)) {
            mimeCategory = 'video';
          } else if (fileName.match(/\.(mp3|wav|ogg|flac|aac)$/)) {
            mimeCategory = 'audio';
          } else if (fileName.match(/\.(pdf|doc|docx|txt|md)$/)) {
            mimeCategory = 'document';
          }
        }
        
        // Map file types to schema.org types
        const schemaType = 
          mimeCategory === 'image' ? 'ImageObject' :
          mimeCategory === 'video' ? 'VideoObject' :
          mimeCategory === 'audio' ? 'AudioObject' :
          'CreativeWork';
        
        // Generate resource URI (consistent with metadata service)
        const resourceUri = `https://parnoir.com/resource/${file.id}`;
        const didUri = resolvedAuth.publicKey.startsWith('did:') 
          ? resolvedAuth.publicKey 
          : `did:key:${resolvedAuth.publicKey}`;
        
        const publicMetadata: PublicMetadata = {
          "@context": [
            "https://schema.org/",
            "https://parnoir.com/ns/v1#"
          ],
          "@type": schemaType,
          "@id": resourceUri,
          
          // Core identifiers
          fileId: file.id,
          backend: file.backend,
          backendFileId: file.backendFileId,
          
          // Schema.org CreativeWork
          name: fileTitle,
          description: '',
          keywords: [], // Can be populated from tags
          uploadDate: file.modifiedTime || new Date().toISOString(),
          fileType: mimeCategory,
          
          // Author (schema.org:creator)
          creator: {
            "@type": "Person",
            "@id": didUri,
            identifier: {
              "@type": "PropertyValue",
              name: "DID",
              value: resolvedAuth.publicKey
            }
          },
          
          // Legacy author support (for backward compatibility)
          author: {
            did: didUri
          },
          
          // Initialize engagement metrics
          engagement: {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            lastUpdated: file.modifiedTime || new Date().toISOString()
          },
          
          // par Noir specific
          isPublic: true
        };

        // Phase 3: Generate share token for public file access
        let shareToken: ShareToken | undefined = undefined;
        
        // Try to get share token from cache first (generated during upload)
        // Try multiple possible cache keys since file ID might be stored differently
        shareToken = shareTokenCache.current.get(file.backendFileId) || 
                     shareTokenCache.current.get(file.id) ||
                     shareTokenCache.current.get((file as any).backendFile?.id);
        
        if (!shareToken) {
          // If not in cache, generate it now (for files uploaded before this change)
          console.log('🔑 [Phase 3] Share token not in cache, generating now...', {
            backendFileId: file.backendFileId,
            fileId: file.id,
            cacheSize: shareTokenCache.current.size
          });
          try {
            // Download the encrypted file to get the EncryptedFilePackage
            if (!aggregatorService) {
              throw new Error('Aggregator service not available');
            }
            const backend = aggregatorService.getBackend(file.backend);
            if (backend && backend.isConnected()) {
              const encryptedBlob = await backend.downloadFile(file.backendFileId);
              const encryptedPackageJson = await encryptedBlob.text();
              const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedPackageJson);

              // Create session object for token generation using stable pN identity
              // Use authenticatedUser.id if available (stable), otherwise fall back
              const session: AuthSession = {
                id: authenticatedUser?.id || resolvedAuth.publicKey,
                publicKey: resolvedAuth.publicKey,
                accessToken: authenticatedUser?.accessToken,
                nickname: authenticatedUser?.nickname
              };

              // Generate share token using stable pN identity (no passcode needed)
              console.log('🔑 [Phase 3] Starting token generation...', { 
                fileId: file.id, 
                hasSession: !!session,
                hasId: !!session.id,
                hasPublicKey: !!session.publicKey
              });
              if (!encryptionService) {
                throw new Error('Encryption service not available');
              }
              shareToken = await encryptionService.generateShareToken(
                encryptedPackage,
                session
              );
              
              // Cache it for future use
              shareTokenCache.current.set(file.backendFileId, shareToken);
              console.log('💾 [Phase 3] Share token cached for future use');
              
              // Store token in metadata
              publicMetadata.publicToken = JSON.stringify(shareToken);
              console.log('✅ [Phase 3] Share token generated and stored in metadata:', file.id, {
                tokenHasShareKey: !!shareToken.shareKey,
                tokenHasShareEncrypted: !!shareToken.shareEncrypted,
                tokenLength: JSON.stringify(shareToken).length
              });
            } else {
              throw new Error('Backend not connected');
            }
          } catch (tokenError) {
            console.error('❌ [Phase 3] Failed to generate share token:', tokenError);
            const errorMessage = tokenError instanceof Error ? tokenError.message : 'Unknown error';
            throw new Error(`Failed to generate share token: ${errorMessage}`);
          }
        } else {
          console.log('✅ [Phase 3] Using cached share token');
          // Store token in metadata
          publicMetadata.publicToken = JSON.stringify(shareToken);
        }

        // Index the file - pass pN identifier so metadata folder is created inside pN folder
        // Get pN identifier for metadata folder location (same as folder naming)
        let metadataPnIdentifier: string | undefined = undefined;
        try {
          // Use the same stable identifier generation as folder naming (id + publicKey hash)
          if (authenticatedUser?.id && resolvedAuth?.publicKey) {
            const combined = `${authenticatedUser.id}:${resolvedAuth.publicKey}`;
            const encoder = new TextEncoder();
            const data = encoder.encode(combined);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            const shortHash = hexHash.substring(0, 12);
            metadataPnIdentifier = `pn-${shortHash}`;
            console.log('📁 [Phase 3] Generated pN identifier for metadata folder:', metadataPnIdentifier);
          }
        } catch (err) {
          console.warn('Failed to generate pN identifier for metadata folder:', err);
        }
        
        // Index the file (will use pN identifier to create metadata folder inside pN folder)
        // Token is included in publicMetadata.publicToken
        console.log('📤 [Phase 3] Submitting metadata to index...', {
          fileId: file.id,
          hasToken: !!publicMetadata.publicToken,
          tokenLength: publicMetadata.publicToken?.length || 0
        });
        await metadataIndexService.indexFile(file, publicMetadata, metadataPnIdentifier);
        console.log('✅ [Phase 3] Metadata indexed with token');
        
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(file.id, publicMetadata);
          return next;
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update file visibility';
      console.error('Failed to toggle public status:', err);
      setError(errorMessage);
    }
  };

  const loadStorageQuota = async () => {
    try {
      // Ensure backends are initialized (gracefully fail if Google Drive not connected)
      await aggregatorService.ensureInitialized();

      const quotas = await aggregatorService.getAggregatedStorageQuota();
      setStorageQuotas(quotas);

      // Also load user info
      const userInfos = await aggregatorService.getAggregatedUserInfo();
      const emails = new Map<string, string>();
      userInfos.forEach((info, backendId) => {
        if (info.email) {
          emails.set(backendId, info.email);
        }
      });
      setUserEmails(emails);
    } catch (err) {
      // Don't log as error - this is expected if Google Drive isn't connected
      console.warn('⚠️ Could not load storage quota (Google Drive may not be connected):', err);
    }
  };

  // Helper function to exchange authorization code for tokens
  // Uses Google OAuth endpoint directly (client-side exchange)
  const exchangeCodeForTokens = async (code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
    const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || 
      '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
    const clientSecret = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_SECRET;
    
    // If we have client secret, use it (should be in backend, but allowing frontend for now)
    // Otherwise, try the API endpoint as fallback
    if (clientSecret) {
      // Direct exchange with Google (not recommended for production, but works)
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google token exchange failed: ${errorText}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
      };
    } else {
      // Fallback to API endpoint
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com';
      const response = await fetch(`${apiEndpoint}/api/auth/google-oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, redirectUri }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to exchange authorization code';
        try {
          const error = await response.json();
          errorMessage = error.message || error.error || JSON.stringify(error);
          console.error('[Google OAuth] API Error:', error);
        } catch (e) {
          const errorText = await response.text().catch(() => 'Unknown error');
          errorMessage = errorText || 'Failed to exchange authorization code';
          console.error('[Google OAuth] API Error (text):', errorText);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in || 3600,
      };
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // OAuth flow - authorization code flow for refresh tokens
      const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || 
        '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
      // Use oauth-callback.html as redirect URI (must match Google Cloud Console settings)
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
      
      // Debug: Log the exact redirect URI being used
      console.log('[Google OAuth] Redirect URI:', redirectUri);
      console.log('[Google OAuth] Client ID:', clientId);
      
      // Use authorization code flow to get refresh tokens
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}` +
        `&include_granted_scopes=true` +
        `&prompt=consent` +
        `&access_type=offline`; // Required for refresh token
      
      console.log('[Google OAuth] Full auth URL:', authUrl);

      const popup = window.open(
        authUrl,
        'Google Drive OAuth',
        'width=500,height=600,left=100,top=100'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Wait for OAuth callback with authorization code
      const tokenData = await new Promise<{ accessToken: string; refreshToken: string; expiresIn: number }>((resolve, reject) => {
        // Don't check popup.closed - COOP blocks it. Just wait for message
        // const checkClosed = setInterval(() => {
        //   try {
        //     if (popup.closed) {
        //       clearInterval(checkClosed);
        //       window.removeEventListener('message', messageHandler);
        //       reject(new Error('OAuth popup was closed'));
        //     }
        //   } catch (e) {
        //     // COOP policy - ignore
        //   }
        // }, 1000);
        
        // Set timeout instead of checking popup.closed
        const timeout = setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth timeout - please try again'));
        }, 300000); // 5 minute timeout

        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          if (event.data.type === 'GOOGLE_OAUTH_CODE') {
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            // Don't try to close popup - COOP blocks it, let it close itself
            try {
              popup.close();
            } catch (e) {
              // Ignore COOP errors
            }

            if (event.data.error) {
              reject(new Error(event.data.error));
            } else if (event.data.code) {
              // Exchange code for tokens via API
              exchangeCodeForTokens(event.data.code, redirectUri)
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error('No authorization code received'));
            }
          }
        };

        window.addEventListener('message', messageHandler);
      });

      const token = tokenData.accessToken;

      // Ensure backends are initialized, then get Google Drive backend
      await aggregatorService.ensureInitialized();
      const googleDriveBackend = aggregatorService.getBackend('google_drive');
      
      if (!googleDriveBackend) {
        // Last resort: try to initialize directly
        const { GoogleDriveBackend } = await import('../../services/storage/GoogleDriveBackend');
        const GoogleDriveBackendConstructor = GoogleDriveBackend;
        const backend = new GoogleDriveBackendConstructor();
        aggregatorService.registerBackend(backend);
        const restoredBackend = aggregatorService.getBackend('google_drive');
        if (!restoredBackend) {
          throw new Error('Google Drive backend not initialized');
        }
        await restoredBackend.connect({ token, refreshToken: tokenData.refreshToken, email: userInfo.email });
        const userInfo = await restoredBackend.getUserInfo();
        setConnectedBackends(prev => new Set([...prev, 'google_drive']));
        setUserEmails(prev => {
          const next = new Map(prev);
          next.set('google_drive', userInfo.email);
          return next;
        });
        try {
          if (userInfo.email) {
            localStorage.setItem('google_drive_email', userInfo.email);
          }
        } catch (e) {
          // ignore storage failures
        }
        await loadFiles();
        await loadStorageQuota();
        return;
      }

      // Get user info
      await googleDriveBackend.connect({ token, refreshToken: tokenData.refreshToken, email: userInfo.email });
      const userInfo = await googleDriveBackend.getUserInfo();

      setConnectedBackends(prev => new Set([...prev, 'google_drive']));
      setUserEmails(prev => {
        const next = new Map(prev);
        next.set('google_drive', userInfo.email);
        return next;
      });
      try {
        if (userInfo.email) {
          localStorage.setItem('google_drive_email', userInfo.email);
        }
      } catch (e) {
        // ignore storage failures
      }

      // Save token and refresh token to encrypted pN metadata for persistence
      if (resolvedAuth?.pnName && resolvedAuth?.passcode && authenticatedUser?.id) {
        try {
          const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
          await SecureMetadataStorage.updateMetadataField(
            resolvedAuth.pnName,
            resolvedAuth.pnName,
            resolvedAuth.passcode,
            'storageCredentials',
            {
              googleDrive: {
                accessToken: token,
                refreshToken: tokenData.refreshToken, // Store refresh token for automatic renewal
                email: userInfo.email,
                connectedAt: new Date().toISOString(),
                expiresIn: tokenData.expiresIn,
              }
            }
          );
          console.log('✅ [handleConnectGoogleDrive] Saved Google Drive tokens (including refresh token) to encrypted metadata');
        } catch (metadataError) {
          console.warn('⚠️ [handleConnectGoogleDrive] Failed to save token to metadata (non-critical):', metadataError);
          // Don't fail the connection if metadata save fails
        }
      }

      // Also store refresh token in localStorage for quick access (will be migrated to encrypted storage)
      if (tokenData.refreshToken) {
        localStorage.setItem('google_drive_refresh_token', tokenData.refreshToken);
        console.log('✅ [handleConnectGoogleDrive] Stored refresh token in localStorage');
      }

      // Load files and quota
      await loadFiles();
      await loadStorageQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Google Drive');
      console.error('Error connecting to Google Drive:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async (backendId: string) => {
    try {
      const backend = aggregatorService.getBackend(backendId);
      if (backend) {
        await backend.disconnect();
        setConnectedBackends(prev => {
          const next = new Set(prev);
          next.delete(backendId);
          return next;
        });
        setUserEmails(prev => {
          const next = new Map(prev);
          next.delete(backendId);
          return next;
        });
        setFiles(prev => prev.filter(f => f.backend !== backendId));
      }
    } catch (err) {
      console.error('Error disconnecting:', err);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('📤 [Upload] Starting upload...', { fileName: file.name, fileSize: file.size });

    // Resolve auth credentials - try multiple sources
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // Try 1: Use resolvedAuth state
    if (resolvedAuth?.pnName && resolvedAuth?.publicKey) {
      pnName = resolvedAuth.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = resolvedAuth.passcode || null;
      console.log('✅ [Upload] Using resolvedAuth state');
    }
    
    // Try 2: Extract from authenticatedUser prop
    if (!pnName || !publicKey) {
      if (authenticatedUser) {
        pnName = authenticatedUser.pnName || authenticatedUser.username || (authenticatedUser as any).name || null;
        publicKey = authenticatedUser.publicKey || 
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        console.log('✅ [Upload] Using authenticatedUser prop:', { pnName: !!pnName, publicKey: !!publicKey });
      }
    }

    // Try 3: Load from storage
    if (!pnName || !publicKey) {
      console.log('📤 [Upload] Loading from storage...');
      try {
        const { SecureStorage } = await import('../../utils/storage');
        const storage = new SecureStorage();
        await storage.init();
        const session = await storage.getCurrentSession();
        
        if (session) {
          pnName = (session as any).pnName || (session as any).username || (session as any).name || null;
          publicKey = (session as any).publicKey || 
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
          console.log('✅ [Upload] Loaded from storage:', { pnName: !!pnName, publicKey: !!publicKey });
        }
      } catch (err) {
        console.error('❌ [Upload] Storage load failed:', err);
      }
    }

    // Final check
    if (!pnName || !publicKey) {
      console.error('❌ [Upload] Could not resolve auth from any source');
      setError('Please unlock your pN first to encrypt files');
      return;
    }

    // Verify we have the stable pN identity (id + publicKey) required for encryption
    // The id (DID) is stable and doesn't change between sessions
    if (!authenticatedUser?.id || !publicKey) {
      console.error('❌ [Upload] Missing stable identity (id or publicKey)');
      setError('Please unlock your pN first. The pN identity is required to encrypt files.');
      return;
    }

    // Update resolvedAuth state for future use
    if (!resolvedAuth || resolvedAuth.pnName !== pnName || resolvedAuth.publicKey !== publicKey) {
      setResolvedAuth({ pnName: pnName!, publicKey: publicKey! });
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📤 [Upload] Proceeding with upload', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser?.id });

      // Create session object for encryption using stable pN identity
      // We use id (DID) + publicKey for encryption, which are stable across sessions
      const session: AuthSession = {
        id: authenticatedUser.id,
        publicKey: publicKey!,
        accessToken: authenticatedUser.accessToken, // Keep for other uses, but not for encryption
        nickname: authenticatedUser?.nickname
      };

      // Encrypt file using stable pN identity (no passcode needed)
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }
      
      console.log('🔐 [Upload] Starting encryption...', {
        hasId: !!session.id,
        idPreview: session.id?.substring(0, 20) + '...',
        hasPublicKey: !!session.publicKey,
        publicKeyPreview: session.publicKey?.substring(0, 20) + '...',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });
      
      let encryptedBlob: Blob;
      let packageData: EncryptedFilePackage;
      let shareToken: ShareToken | undefined = undefined; // Generate during upload
      try {
        const result = await encryptionService.encryptFileForUpload(
          file,
          session
        );
        encryptedBlob = result.encryptedBlob;
        packageData = result.packageData;
        console.log('✅ [Upload] Encryption successful');
        
        // Generate share token now (during upload) so it's ready for public sharing
        // This avoids having to regenerate it later and prevents "Maximum call stack" errors
        // IMPORTANT: Generate token BEFORE upload so we can cache it with the file ID
        console.log('🔑 [Upload] Generating share token for future public sharing...');
        try {
          shareToken = await encryptionService.generateShareToken(
            packageData,
            session
          );
          console.log('✅ [Upload] Share token generated successfully');
        } catch (tokenError: any) {
          console.error('❌ [Upload] Share token generation failed:', {
            error: tokenError?.message || tokenError,
            errorName: tokenError?.name,
            stack: tokenError?.stack
          });
          // Don't fail the upload if token generation fails - user can try making it public later
          shareToken = undefined;
        }
      } catch (encryptError: any) {
        console.error('❌ [Upload] Encryption failed:', {
          error: encryptError?.message || encryptError,
          errorName: encryptError?.name,
          stack: encryptError?.stack
        });
        setError(`Failed to encrypt file: ${encryptError?.message || 'Unknown error'}. Please make sure you are unlocked.`);
        return;
      }

      // Get Google Drive backend (default for now)
      const backendId = 'google_drive';
      const backend = aggregatorService.getBackend(backendId);
      if (!backend || !backend.isConnected()) {
        throw new Error(`${backendId} is not connected`);
      }

      // Get or create pN-specific folder using stable identifier
      // We use id:publicKey hash for stable volume ID (both are stable across sessions)
      let pnIdentifier: string;
      try {
        if (authenticatedUser?.id && publicKey) {
          // Generate stable volume ID from id:publicKey (stable across sessions)
          // Format: pn-{12-char-hex-hash} to match desktop app naming convention
          // The id (DID) is stable, so folder name is consistent across sessions
          const combined = `${authenticatedUser.id}:${publicKey}`;
          const encoder = new TextEncoder();
          const data = encoder.encode(combined);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          const shortHash = hexHash.substring(0, 12);
          pnIdentifier = `pn-${shortHash}`;
        } else {
          // Fallback to publicKey-based identifier if id unavailable
          pnIdentifier = publicKey ? `pn-${publicKey.substring(0, 12).replace(/[^a-f0-9]/g, '')}` : 'default';
        }
      } catch (err) {
        // Fallback if hash generation fails
        console.warn('Volume ID generation failed, using fallback:', err);
        pnIdentifier = publicKey ? `pn-${publicKey.substring(0, 12).replace(/[^a-f0-9]/g, '')}` : 'default';
      }
      
      const folderId = await backend.getOrCreateFolder('par Noir', pnIdentifier);
      console.log(`📁 [Upload] Uploading to folder ID: ${folderId.substring(0, 12)}...`);

        // Upload encrypted file
        const encryptedFileName = `${packageData.metadata.originalName}.encrypted`;
        // Use File constructor with explicit reference to avoid minification issues
        const FileConstructor = globalThis.File || (typeof window !== 'undefined' ? window.File : File);
        const uploadedFile = await aggregatorService.uploadToBackend(
          backendId,
          new FileConstructor([encryptedBlob], encryptedFileName, { type: 'application/json' }),
          folderId,
          { 
            fileName: encryptedFileName, 
            pnIdentifier,
            publicToken: shareToken // Pass share token so it's stored in metadata on upload
          }
        );

        // Store share token in cache if generated (keyed by backend file ID for easy lookup)
        // Use uploadedFile.id as the cache key - this should match file.backendFileId when we look it up
        const cacheKey = uploadedFile.id || uploadedFile.backendFileId;
        if (shareToken && cacheKey) {
          shareTokenCache.current.set(cacheKey, shareToken);
          console.log('💾 [Upload] Share token cached for file:', cacheKey.substring(0, 12) + '...');
        } else if (!shareToken) {
          console.warn('⚠️ [Upload] No share token to cache - file was uploaded but token generation failed');
        } else {
          console.warn('⚠️ [Upload] No file ID available for caching share token');
        }

      // Refresh file list - IMPORTANT: Force reload with the same pN identifier used for upload
      console.log(`🔄 [Upload] Reloading files for pN ${pnIdentifier?.substring(0, 8)}...`);
      await loadFiles();
      console.log('✅ [Upload] File uploaded successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      console.error('❌ [Upload] Upload failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleEditMetadata = (file: AggregatedFile) => {
    const metadata = fileMetadataMap.get(file.id);
    
    // Extract location data if present
    const location = (metadata as any)?.locationCreated || (metadata as any)?.schema?.locationCreated;
    const locationName = location?.name || '';
    const locationAddress = location?.address ? 
      `${location.address.addressLocality || ''}${location.address.addressRegion ? ', ' + location.address.addressRegion : ''}${location.address.addressCountry ? ', ' + location.address.addressCountry : ''}`.trim() : '';
    const locationLat = location?.geo?.latitude?.toString() || '';
    const locationLng = location?.geo?.longitude?.toString() || '';
    
    // Extract genre (can be array or string)
    const genre = (metadata as any)?.genre || (metadata as any)?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');
    
    // Extract category
    const category = (metadata as any)?.category || (metadata as any)?.schema?.category || '';
    
    // Extract license (can be object with name or string)
    const license = (metadata as any)?.license || (metadata as any)?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '');
    
    // Extract language (can be array or string)
    const language = (metadata as any)?.inLanguage || (metadata as any)?.schema?.inLanguage || '';
    const languageString = Array.isArray(language) ? language.join(', ') : (typeof language === 'string' ? language : '');
    
    setEditForm({
      name: metadata?.name || file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name,
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: category,
      locationName: locationName,
      locationAddress: locationAddress,
      locationLat: locationLat,
      locationLng: locationLng,
      license: licenseString,
      language: languageString
    });
    setEditingFile(file);
  };

  const handleSaveMetadata = async () => {
    if (!editingFile) return;

    try {
      setIsLoading(true);
      setError(null);

      // Parse tags from comma-separated string
      const tags = editForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Parse genre from comma-separated string
      const genre = editForm.genre
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);

      // Build location object if provided
      let locationCreated = undefined;
      if (editForm.locationName || editForm.locationAddress || editForm.locationLat || editForm.locationLng) {
        locationCreated = {
          '@type': 'Place',
          ...(editForm.locationName && { name: editForm.locationName }),
          ...(editForm.locationAddress && {
            address: {
              '@type': 'PostalAddress',
              addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
              addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
              addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
            }
          }),
          ...((editForm.locationLat || editForm.locationLng) && {
            geo: {
              '@type': 'GeoCoordinates',
              ...(editForm.locationLat && { latitude: parseFloat(editForm.locationLat) }),
              ...(editForm.locationLng && { longitude: parseFloat(editForm.locationLng) })
            }
          })
        };
      }

      // Parse language from comma-separated string or single value
      const language = editForm.language
        .split(',')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      // Update via API endpoint
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com';
      const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${editingFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          keywords: tags,
          tags: tags,
          genre: genre.length > 0 ? genre : undefined,
          category: editForm.category || undefined,
          locationCreated: locationCreated,
          license: editForm.license || undefined,
          inLanguage: language.length > 0 ? (language.length === 1 ? language[0] : language) : undefined
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update metadata: ${errorText}`);
      }

      const updatedMetadata = await response.json();

      // Also update Google Drive metadata file if we have access
      const backend = aggregatorService?.getBackend(editingFile.backend);
      if (backend && backend.isConnected() && resolvedAuth?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');
          
          if (token) {
            // Generate stable pN identifier
            let pnIdentifier: string;
            if (authenticatedUser?.id && resolvedAuth?.publicKey) {
              const combined = `${authenticatedUser.id}:${resolvedAuth.publicKey}`;
              const encoder = new TextEncoder();
              const data = encoder.encode(combined);
              const hashBuffer = await crypto.subtle.digest('SHA-256', data);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
              const shortHash = hexHash.substring(0, 12);
              pnIdentifier = `pn-${shortHash}`;
            } else {
              pnIdentifier = resolvedAuth.pnName;
            }

            // Get current metadata from fileMetadataMap or construct from file
            let currentMetadata = fileMetadataMap.get(editingFile.id);
            
            // If no metadata exists, create a basic structure
            if (!currentMetadata) {
              currentMetadata = {
                fileId: editingFile.id,
                backend: editingFile.backend,
                backendFileId: editingFile.backendFileId,
                name: editForm.name,
                description: editForm.description,
                keywords: tags,
                tags: tags,
                uploadDate: new Date().toISOString(),
                fileType: editingFile.mimeType?.split('/')[0] || 'other',
                isPublic: false,
                creator: {
                  '@type': 'Person',
                  '@id': resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`,
                  identifier: {
                    '@type': 'PropertyValue',
                    name: 'DID',
                    value: resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`
                  }
                }
              } as PublicMetadata;
            }

            // Parse genre and language for companion metadata
            const genre = editForm.genre
              .split(',')
              .map(g => g.trim())
              .filter(g => g.length > 0);

            const language = editForm.language
              .split(',')
              .map(l => l.trim())
              .filter(l => l.length > 0);

            // Build location object for companion metadata
            let locationCreated = undefined;
            if (editForm.locationName || editForm.locationAddress || editForm.locationLat || editForm.locationLng) {
              locationCreated = {
                '@type': 'Place',
                ...(editForm.locationName && { name: editForm.locationName }),
                ...(editForm.locationAddress && {
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
                    addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
                    addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
                  }
                }),
                ...((editForm.locationLat || editForm.locationLng) && {
                  geo: {
                    '@type': 'GeoCoordinates',
                    ...(editForm.locationLat && { latitude: parseFloat(editForm.locationLat) }),
                    ...(editForm.locationLng && { longitude: parseFloat(editForm.locationLng) })
                  }
                })
              };
            }

            // Preserve existing schema metadata (static/auto-extracted fields)
            const existingSchema = (currentMetadata as any)?.schema || {};
            
            // Update companion metadata file
            const companionMetadata = {
              fileId: editingFile.id,
              googleDriveFileId: editingFile.backendFileId,
              fileName: editingFile.name,
              originalName: editForm.name,
              mimeType: editingFile.mimeType || 'application/octet-stream',
              size: parseInt(editingFile.size?.toString() || '0', 10),
              visibility: currentMetadata.isPublic ? 'public' : 'private',
              uploadedAt: currentMetadata.uploadDate || new Date().toISOString(),
              owner: {
                did: resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`,
                identifier: pnIdentifier
              },
              tags: tags,
              description: editForm.description,
              metadata: {},
              publicToken: currentMetadata.publicToken,
              thumbnail: currentMetadata.thumbnail,
              inReplyTo: currentMetadata.inReplyTo,
              repostOf: currentMetadata.repostOf,
              isPartOf: currentMetadata.isPartOf,
              schema: {
                ...existingSchema, // Preserve auto-extracted technical metadata (width, height, duration, etc.)
                ...(genre.length > 0 && { genre }),
                ...(editForm.category && { category: editForm.category }),
                ...(locationCreated && { locationCreated }),
                ...(editForm.license && { license: editForm.license }),
                ...(language.length > 0 && { inLanguage: language.length === 1 ? language[0] : language })
              },
              engagement: currentMetadata.engagement || {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                lastUpdated: currentMetadata.uploadDate || new Date().toISOString()
              }
            };

            // Always update companion metadata (even for private files)
              await GoogleDriveMetadataService.createCompanionMetadataFile(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Always update owner index (contains ALL files)
              await GoogleDriveMetadataService.updateOwnerFileIndex(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Update public index if public
              if (currentMetadata.isPublic) {
                await GoogleDriveMetadataService.updatePublicFileIndex(
                  token,
                  pnIdentifier,
                  companionMetadata
                );
              }
          }
        } catch (driveError) {
          console.warn('Failed to update Google Drive metadata (non-critical):', driveError);
          // Don't fail the whole operation if Google Drive update fails
        }
      }

      // Update local state
      if (updatedMetadata.metadata) {
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(editingFile.id, updatedMetadata.metadata);
          return next;
        });
      }

      setEditingFile(null);
      setEditForm({ 
        name: '', 
        description: '', 
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        locationLat: '',
        locationLng: '',
        license: '',
        language: ''
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update metadata');
      console.error('Error updating metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewFile = async (file: AggregatedFile) => {
    setViewingFile(file);
  };

  const loadFilePreview = async (file: AggregatedFile) => {
    // Skip if already loading or loaded
    if (loadingPreviews.has(file.id) || filePreviewUrls.has(file.id)) {
      return;
    }

    // Only load previews for images and videos - check mimeType and file extension
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
    const isVideo = mimeType.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName);
    if (!isImage && !isVideo) {
      return;
    }

    setLoadingPreviews(prev => new Set(prev).add(file.id));

    try {
        // SIMPLIFIED: Use token-based decryption ONLY (same as aggregator browser)
        // No credentials needed - token is in the owner index
      // Get token from metadata map or cache
      let token: any = null;
      const metadata = fileMetadataMap.get(file.id);
      
      // Try 1: Get token from metadata map
      if (metadata?.publicToken) {
        token = typeof metadata.publicToken === 'string' 
          ? JSON.parse(metadata.publicToken) 
          : metadata.publicToken;
      }
      
      // Try 2: Get token from cache
      if (!token) {
        token = shareTokenCache.current.get(file.backendFileId);
      }
      
      // If no token, file can't be decrypted (shouldn't happen if owner index is loaded correctly)
      if (!token) {
        console.warn('⚠️ [Preview] No share token found for file:', file.id, {
          hasMetadata: !!metadata,
          hasTokenInMetadata: !!metadata?.publicToken,
          cacheSize: shareTokenCache.current.size,
          hasTokenInCache: shareTokenCache.current.has(file.backendFileId),
          fileMetadataMapSize: fileMetadataMap.size
        });
        setLoadingPreviews(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
        return;
      }
      
      console.log('✅ [Preview] Token found, decrypting...', {
        fileId: file.id,
        fileName: file.name,
        hasShareKey: !!token.shareKey,
        hasShareEncrypted: !!token.shareEncrypted
      });
      
      // Use token-based decryption (SAME as aggregator browser)
      try {
        const { decryptWithToken } = await import('../../utils/tokenDecryption');
        const decryptedBlob = await decryptWithToken(token);
        
        const previewUrl = URL.createObjectURL(decryptedBlob);
        setFilePreviewUrls(prev => {
          const next = new Map(prev);
          next.set(file.id, previewUrl);
          return next;
        });
        
        console.log('✅ [Preview] Token-based decryption successful (same as aggregator browser)');
      } catch (tokenError) {
        console.error('❌ [Preview] Token-based decryption failed:', tokenError);
        setLoadingPreviews(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorDetails = {
        error: err,
        errorMessage: errorMessage,
        fileId: file.id,
        backendFileId: file.backendFileId,
        fileName: file.name
      };
      console.error('❌ [Preview] Failed to load file preview:', errorDetails);
      
      // Log stack trace if available
      if (err instanceof Error && err.stack) {
        console.error('❌ [Preview] Error stack:', err.stack);
      }
      
      // Don't set error state (it's not defined in this scope)
      // The UI will show the lock icon for files that fail to load
    } finally {
      setLoadingPreviews(prev => {
        const next = new Set(prev);
        next.delete(file.id);
        return next;
      });
    }
  };


  // Auto-load previews for image/video files when files are loaded (since user owns them)
  useEffect(() => {
    if (files.length > 0) {
      console.log('🔄 [Auto-Preview] Checking files for auto-preview...', {
        fileCount: files.length,
        metadataMapSize: fileMetadataMap.size
      });
      // Load previews for all image/video files automatically (token-based, no credentials needed)
      files.forEach(file => {
        const mimeType = file.mimeType || '';
        const fileName = file.originalName || file.name || '';
        const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
        const isVideo = mimeType.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName);
        
        if ((isImage || isVideo) && !filePreviewUrls.has(file.id) && !loadingPreviews.has(file.id)) {
          console.log('🔄 [Auto-Preview] Loading preview for file:', file.id, file.name);
          loadFilePreview(file).catch(err => {
            // Silently fail for auto-preview - don't show error modal
            console.warn('⚠️ [Auto-Preview] Failed to load preview (non-critical):', err);
          });
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, fileMetadataMap.size]);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      // Cleanup all blob URLs
      filePreviewUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (file: AggregatedFile) => {
    console.log('📥 [Download] Starting download...', { fileName: file.name, fileId: file.backendFileId });

    // Resolve auth credentials - try multiple sources (same as upload)
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // Try 1: Use resolvedAuth state
    if (resolvedAuth?.pnName && resolvedAuth?.publicKey) {
      pnName = resolvedAuth.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = resolvedAuth.passcode || null;
      console.log('✅ [Download] Using resolvedAuth state');
    }
    
    // Try 2: Extract from authenticatedUser prop
    if (!pnName || !publicKey) {
      if (authenticatedUser) {
        pnName = authenticatedUser.pnName || authenticatedUser.username || (authenticatedUser as any).name || null;
        publicKey = authenticatedUser.publicKey || 
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        console.log('✅ [Download] Using authenticatedUser prop:', { pnName: !!pnName, publicKey: !!publicKey });
      }
    }

    // Try 3: Load from storage
    if (!pnName || !publicKey) {
      console.log('📥 [Download] Loading from storage...');
      try {
        const { SecureStorage } = await import('../../utils/storage');
        const storage = new SecureStorage();
        await storage.init();
        const session = await storage.getCurrentSession();
        
        if (session) {
          pnName = (session as any).pnName || (session as any).username || (session as any).name || null;
          publicKey = (session as any).publicKey || 
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
          console.log('✅ [Download] Loaded from storage:', { pnName: !!pnName, publicKey: !!publicKey });
        }
      } catch (err) {
        console.error('❌ [Download] Storage load failed:', err);
      }
    }

    // Final check
    if (!pnName || !publicKey) {
      console.error('❌ [Download] Could not resolve auth from any source');
      setError('Please unlock your pN first to decrypt files');
      return;
    }

    // Verify we have the stable pN identity (id + publicKey) required for decryption
    // The id (DID) is stable and doesn't change between sessions
    if (!authenticatedUser?.id || !publicKey) {
      console.error('❌ [Download] Missing stable identity (id or publicKey)');
      setError('Please unlock your pN first. The pN identity is required to decrypt files.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📥 [Download] Proceeding with download', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser?.id });

      // Download encrypted file from backend
      const encryptedBlob = await aggregatorService.downloadFromBackend(
        file.backend,
        file.backendFileId
      );

      console.log('📥 [Download] Encrypted file downloaded, size:', encryptedBlob.size);

      // Create session object for decryption using stable pN identity
      // We use id (DID) + publicKey for decryption, which are stable across sessions
      const session: AuthSession = {
        id: authenticatedUser!.id,
        publicKey: publicKey!,
        accessToken: authenticatedUser!.accessToken, // Keep for other uses, but not for decryption
        nickname: authenticatedUser?.nickname
      };

      console.log('📥 [Download] Attempting decryption with stable pN identity...', { 
        sessionId: session.id?.substring(0, 20) + '...',
        hasId: !!session.id,
        hasPublicKey: !!session.publicKey
      });

      // Decrypt file using stable pN identity (id + publicKey)
      // The id (DID) is stable and doesn't change between sessions, ensuring consistent decryption
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }
      
      // Parse the encrypted package from the blob
      const encryptedPackageText = await encryptedBlob.text();
      const encryptedPackage = JSON.parse(encryptedPackageText);
      
      // Decrypt using authenticated session token - no user input needed
      console.log('🔐 [Download] Starting decryption...', {
        hasId: !!session.id,
        idPreview: session.id?.substring(0, 20) + '...',
        hasPublicKey: !!session.publicKey,
        publicKeyPreview: session.publicKey?.substring(0, 20) + '...',
        encryptedPackageKeys: Object.keys(encryptedPackage),
        hasEncrypted: !!encryptedPackage.encrypted,
        encryptedLength: encryptedPackage.encrypted?.length,
        hasIv: !!encryptedPackage.iv,
        ivLength: encryptedPackage.iv?.length,
        hasSalt: !!encryptedPackage.salt,
        saltLength: encryptedPackage.salt?.length
      });
      
      let decryptedBlob: Blob;
      let metadata: any;
      try {
        const result = await encryptionService.decryptFileFromDownload(
          encryptedPackage,
          session
        );
        decryptedBlob = result.decryptedBlob;
        metadata = result.metadata;
      } catch (decryptError: any) {
        console.error('❌ [Download] Decryption failed:', {
          error: decryptError?.message || decryptError,
          errorName: decryptError?.name,
          stack: decryptError?.stack
        });
        const errorMsg = decryptError?.message || 'Unknown error';
        console.error('❌ [Download] Decryption failed:', {
          error: errorMsg,
          errorDetails: decryptError,
          fileId: file.id,
          backendFileId: file.backendFileId,
          fileName: file.name,
          hasSessionId: !!session?.id,
          hasPublicKey: !!session?.publicKey,
          stack: decryptError instanceof Error ? decryptError.stack : undefined
        });
        setError(`Failed to decrypt file: ${errorMsg}. This file may have been encrypted with a different method or credentials.`);
        return;
      }

      console.log('✅ [Download] Decryption successful, downloading file...', { originalName: metadata.originalName });

      // Download decrypted file
      const url = window.URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.originalName || file.name.replace('.encrypted', '');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('✅ [Download] File download initiated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      console.error('❌ [Download] Download failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };


  const totalFiles = files.length;
  const hasConnectedBackends = connectedBackends.size > 0;

  return (
    <div className="space-y-6">
      {/* Secure Folder / Desktop App Section */}
      <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-4">
            <Lock className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Secure Folder</h3>
              <p className="text-text-secondary text-sm">
                Access your encrypted files with the desktop app
              </p>
            </div>
          </div>
            
            <button
              onClick={() => setShowDesktopAppInfo(true)}
              className="flex items-center space-x-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <Info className="h-4 w-4" />
              <span className="text-sm">About the Desktop App</span>
            </button>
        </div>
        
          <a
            href="https://github.com/bymjmazzei/par-Noir/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors ml-4"
          >
            <Download className="h-4 w-4" />
            <span>Download Desktop App</span>
          </a>
        </div>

        {/* Desktop App Info Modal Overlay */}
        {showDesktopAppInfo && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDesktopAppInfo(false)}
          >
            <div 
              className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">About the Desktop App</h3>
                <button
                  onClick={() => setShowDesktopAppInfo(false)}
                  className="text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <p className="text-text-secondary text-sm mb-4">
            The par Noir Desktop App provides secure, local access to your encrypted files stored in Google Drive. 
            Files are automatically synced and encrypted with your pN credentials.
          </p>
              
          <div className="space-y-2 text-xs text-text-secondary">
            <p>• Secure local file access</p>
            <p>• Automatic encryption/decryption</p>
            <p>• Works offline with cached files</p>
            <p>• Native desktop integration</p>
          </div>
        </div>
          </div>
        )}
      </div>

      {/* Secure Cloud Providers */}
      <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Cloud className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Secure Cloud</h3>
              <p className="text-text-secondary text-sm">Connect encrypted cloud storage providers.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleConnectGoogleDrive}
              className={`p-2 rounded-lg border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/20 transition-colors ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              disabled={isLoading}
              title={connectedBackends.has('google_drive') ? 'Google Drive connected' : 'Connect Google Drive'}
            >
              <img
                src={GOOGLE_DRIVE_ICON_URL}
                alt="Google Drive"
                className="h-6 w-6"
                loading="lazy"
              />
            </button>
          </div>
        </div>
      </div>

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
      
      {/* Auth Status Warning */}
      {!resolvedAuth && !error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <div className="flex-1">
              <span className="text-yellow-400 text-sm">
                Please unlock your pN first to encrypt files
              </span>
              <p className="text-yellow-500/70 text-xs mt-1">
                Debug: authenticatedUser={authenticatedUser ? 'present' : 'null'}, resolvedAuth={resolvedAuth ? 'present' : 'null'}
              </p>
              <button
                onClick={async () => {
                  try {
                    const { SecureStorage } = await import('../../utils/storage');
                    const storage = new SecureStorage();
                    await storage.init();
                    const session = await storage.getCurrentSession();
                    alert(`Session check:\n\nSession exists: ${!!session}\nSession keys: ${session ? Object.keys(session).join(', ') : 'none'}\n\nAuthenticatedUser prop: ${authenticatedUser ? 'present' : 'null'}\nResolvedAuth: ${resolvedAuth ? 'present' : 'null'}`);
                  } catch (e) {
                    alert(`Error: ${e}`);
                  }
                }}
                className="mt-2 text-xs text-yellow-400 hover:text-yellow-300 underline"
              >
                Debug: Check Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      {hasConnectedBackends && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <img src={GOOGLE_DRIVE_ICON_URL} alt="Google Drive" className="h-5 w-5" />
              {googleDriveEmail && (
                <span className="text-white font-semibold truncate max-w-xs">
                  {googleDriveEmail}
                </span>
              )}
              {connectedBackends.has('google_drive') && (
                <button
                  onClick={() => handleDisconnect('google_drive')}
                  className="ml-3 text-red-400 hover:text-red-300 text-sm"
                >
                  Disconnect
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={loadFiles}
                disabled={isLoading}
                className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                title="Refresh Files"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleUpload}
                className="hidden"
                disabled={isLoading}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
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

          {isLoading && files.length === 0 ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 text-text-secondary animate-spin mx-auto mb-4" />
              <p className="text-text-secondary">Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12">
              <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">No files found</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {files.map((file) => {
                const metadata = fileMetadataMap.get(file.id);
                const previewUrl = filePreviewUrls.get(file.id);
                const isLoadingPreview = loadingPreviews.has(file.id);
                const mimeType = file.mimeType || '';
                const fileName = file.originalName || file.name || '';
                const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
                const isVideo = mimeType.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName);
                
                return (
                  <div
                    key={`${file.backend}-${file.backendFileId}`}
                    className="bg-neutral-800/50 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group cursor-pointer"
                    onClick={() => handleViewFile(file)}
                  >
                    {/* Preview - displays actual file at smaller size */}
                    <div 
                      className="relative aspect-square bg-neutral-700/50 overflow-hidden"
                      onMouseEnter={() => {
                        if ((isImage || isVideo) && !previewUrl && !isLoadingPreview) {
                          loadFilePreview(file);
                        }
                      }}
                    >
                      {previewUrl && isImage ? (
                        <img
                          src={previewUrl}
                          alt={file.encrypted ? file.originalName : file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : previewUrl && isVideo ? (
                        <video
                          src={previewUrl}
                          className="w-full h-full object-cover"
                          muted
                          loop
                        />
                      ) : isLoadingPreview ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <RefreshCw className="h-6 w-6 text-text-secondary animate-spin" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock className="h-8 w-8 text-blue-400" />
                        </div>
                      )}
                      {metadata?.isPublic && (
                        <div className="absolute top-2 right-2 bg-green-500/80 rounded-full p-1">
                          <Globe className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {(isImage || isVideo) && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Eye className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>
                    
                    {/* File Info */}
                    <div className="p-3">
                      <p className="text-white text-xs truncate mb-1" title={file.encrypted ? file.originalName : file.name}>
                        {file.encrypted ? file.originalName : file.name}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {(parseInt(file.size?.toString() || '0') / 1024).toFixed(1)} KB
                      </p>
                      
                      {/* Actions */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-700">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditMetadata(file);
                          }}
                          disabled={isLoading}
                          className="p-1.5 text-text-secondary hover:text-text-primary transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePublic(file);
                          }}
                          disabled={isLoading}
                          className="p-1.5 transition-colors"
                          title={metadata?.isPublic ? 'Make Private' : 'Make Public'}
                          style={{
                            color: metadata?.isPublic ? 'rgb(74, 222, 128)' : 'rgb(156, 163, 175)'
                          }}
                        >
                          {metadata?.isPublic ? (
                            <Globe className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file);
                          }}
                          disabled={isLoading}
                          className="p-1.5 text-blue-400 hover:text-blue-300 transition-colors"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => {
                const metadata = fileMetadataMap.get(file.id);
                const previewUrl = filePreviewUrls.get(file.id);
                const isLoadingPreview = loadingPreviews.has(file.id);
                const mimeType = file.mimeType || '';
                const fileName = file.originalName || file.name || '';
                const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
                const isVideo = mimeType.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName);
                
                return (
                <div
                  key={`${file.backend}-${file.backendFileId}`}
                  className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
                  onClick={() => handleViewFile(file)}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {/* Preview or icon - displays actual file at smaller size */}
                      {previewUrl && isImage ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                          <img
                            src={previewUrl}
                            alt={file.encrypted ? file.originalName : file.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : previewUrl && isVideo ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                          <video
                            src={previewUrl}
                            className="w-full h-full object-cover"
                            muted
                          />
                        </div>
                      ) : (isImage || isVideo) ? (
                        <div 
                          className="w-12 h-12 flex-shrink-0 rounded bg-neutral-700 flex items-center justify-center cursor-pointer"
                          onMouseEnter={() => {
                            if (!previewUrl && !isLoadingPreview) {
                              loadFilePreview(file);
                            }
                          }}
                        >
                          {isLoadingPreview ? (
                            <RefreshCw className="h-5 w-5 text-text-secondary animate-spin" />
                          ) : (
                            <Lock className="h-5 w-5 text-blue-400" />
                          )}
                        </div>
                      ) : (
                    <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      )}
                      
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-white text-sm truncate">
                          {file.encrypted ? file.originalName : file.name}
                        </p>
                          {metadata?.isPublic && (
                          <Globe className="h-3 w-3 text-green-400 flex-shrink-0" title="Public" />
                        )}
                      </div>
                      <p className="text-text-secondary text-xs">
                        {file.backend} • {(parseInt(file.size?.toString() || '0') / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditMetadata(file);
                        }}
                        disabled={isLoading}
                        className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 bg-neutral-700/50 hover:bg-neutral-700 text-text-secondary hover:text-text-primary"
                        title="Edit Metadata"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePublic(file);
                      }}
                      disabled={isLoading}
                      className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                        title={metadata?.isPublic ? 'Make Private' : 'Make Public'}
                      style={{
                          backgroundColor: metadata?.isPublic 
                          ? 'rgba(34, 197, 94, 0.2)' 
                          : 'rgba(107, 114, 128, 0.2)',
                          color: metadata?.isPublic 
                          ? 'rgb(74, 222, 128)' 
                          : 'rgb(156, 163, 175)'
                      }}
                    >
                        {metadata?.isPublic ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingFile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditingFile(null);
            setEditForm({ 
        name: '', 
        description: '', 
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        locationLat: '',
        locationLng: '',
        license: '',
        language: ''
      });
          }}
        >
          <div 
            className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-semibold">Edit Metadata</h3>
              <button
                onClick={() => {
                  setEditingFile(null);
                  setEditForm({ 
        name: '', 
        description: '', 
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        locationLat: '',
        locationLng: '',
        license: '',
        language: ''
      });
                }}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4 overflow-y-auto pr-2 -mr-2 flex-1">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Name / Title
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="File name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="File description"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.tags}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tag1, tag2, tag3"
                />
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Content Classification</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Genre (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={editForm.genre}
                      onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="photography, art, documentation"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Main category"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Location</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Place Name
                    </label>
                    <input
                      type="text"
                      value={editForm.locationName}
                      onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Central Park, New York"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Address (City, State, Country)
                    </label>
                    <input
                      type="text"
                      value={editForm.locationAddress}
                      onChange={(e) => setEditForm({ ...editForm, locationAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="New York, NY, USA"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editForm.locationLat}
                        onChange={(e) => setEditForm({ ...editForm, locationLat: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="40.785091"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editForm.locationLng}
                        onChange={(e) => setEditForm({ ...editForm, locationLng: e.target.value })}
                        className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="-73.968285"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Rights & Licensing</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      License
                    </label>
                    <input
                      type="text"
                      value={editForm.license}
                      onChange={(e) => setEditForm({ ...editForm, license: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., CC BY 4.0, All Rights Reserved"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Language</h4>
                
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Language (ISO 639-1 code, comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editForm.language}
                    onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="en, es, fr"
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Use ISO 639-1 language codes (e.g., en, es, fr, de)
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 flex-shrink-0 border-t border-neutral-700 mt-4">
                <button
                  onClick={() => {
                    setEditingFile(null);
                    setEditForm({ 
        name: '', 
        description: '', 
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        locationLat: '',
        locationLng: '',
        license: '',
        language: ''
      });
                  }}
                  className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMetadata}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
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
            
            <FileViewer 
              file={viewingFile} 
              previewUrl={filePreviewUrls.get(viewingFile.id) || null}
              fileMetadata={fileMetadataMap.get(viewingFile.id)}
              onClose={() => setViewingFile(null)} 
            />
          </div>
        </div>
      )}

    </div>
  );
};

// File Viewer Component
const FileViewer: React.FC<{ file: AggregatedFile; previewUrl: string | null; fileMetadata?: PublicMetadata; onClose: () => void }> = ({ file, previewUrl, fileMetadata, onClose }) => {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(previewUrl);
  const [loading, setLoading] = useState(!previewUrl);
  const [error, setError] = useState<string | null>(null);
  const mimeType = file.mimeType || '';
  const fileName = file.originalName || file.name || '';
  // Check mimeType first, then fallback to file extension
  const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
  const isVideo = mimeType.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName);
  const isAudio = mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fileName);

  useEffect(() => {
    // If preview URL already exists, use it (no need to decrypt again)
    if (previewUrl) {
      setDecryptedUrl(previewUrl);
      setLoading(false);
      return;
    }

    // SIMPLIFIED: Use token-based decryption (same as aggregator browser)
    // Get token from fileMetadata prop (no credentials needed)
    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!fileMetadata?.publicToken) {
          throw new Error('File token not found. Please reload the page.');
        }

        // Parse token and decrypt (SAME as aggregator browser)
        const shareToken = typeof fileMetadata.publicToken === 'string'
          ? JSON.parse(fileMetadata.publicToken)
          : fileMetadata.publicToken;

        const { decryptWithToken } = await import('../../utils/tokenDecryption');
        const decryptedBlob = await decryptWithToken(shareToken);
        const url = URL.createObjectURL(decryptedBlob);
        setDecryptedUrl(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
        console.error('Error loading file:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFile();

    // Cleanup - only revoke if we created the URL (not the preview URL)
    return () => {
      if (decryptedUrl && decryptedUrl !== previewUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id, previewUrl, fileMetadata]);

  if (loading) {
    return (
      <div className="text-center">
        <RefreshCw className="h-12 w-12 text-white animate-spin mx-auto mb-4" />
        <p className="text-white">Loading file...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400">{error}</p>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    );
  }

  // Debug logging
  console.log('🔍 [FileViewer] Render check:', {
    hasDecryptedUrl: !!decryptedUrl,
    mimeType,
    fileName,
    isImage,
    isVideo,
    isAudio,
    hasFileMetadata: !!fileMetadata,
    hasPublicToken: !!fileMetadata?.publicToken
  });

  if (!decryptedUrl) {
    // Still loading or failed - loading/error states are handled above
    return null;
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      {isImage && (
        <img
          src={decryptedUrl}
          alt={file.encrypted ? file.originalName : file.name}
          className="max-w-full max-h-full object-contain"
        />
      )}
      {isVideo && (
        <video
          src={decryptedUrl}
          controls
          autoPlay
          className="max-w-full max-h-full"
        />
      )}
      {isAudio && (
        <div className="bg-neutral-800 rounded-lg p-8">
          <audio src={decryptedUrl} controls className="w-full" />
          <p className="text-white mt-4 text-center">{file.encrypted ? file.originalName : file.name}</p>
        </div>
      )}
      {!isImage && !isVideo && !isAudio && (
        <div className="bg-neutral-800 rounded-lg p-8 max-w-2xl">
          <p className="text-white text-center mb-4">{file.encrypted ? file.originalName : file.name}</p>
          <p className="text-text-secondary text-center">
            Preview not available for this file type. Please download to view.
          </p>
          <p className="text-text-secondary text-center text-xs mt-2">
            Debug: mimeType={mimeType || 'none'}, fileName={fileName}
          </p>
          <button
            onClick={onClose}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto block"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};


