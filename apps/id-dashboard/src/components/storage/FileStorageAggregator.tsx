/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState, useEffect } from 'react';
import { HardDrive, Upload, Download, Trash2, File, RefreshCw, AlertCircle, Lock, Globe, EyeOff } from 'lucide-react';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, EncryptedFilePackage } from '../../types/aggregator';
import { AuthSession as CryptoAuthSession } from '../../types/crypto';

interface FileStorageAggregatorProps {
  authenticatedUser?: AuthSession | CryptoAuthSession | any | null;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ authenticatedUser }) => {
  // Use global constructors directly - terser will preserve them via reserved list
  
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<AggregatedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [resolvedAuth, setResolvedAuth] = useState<{ pnName: string; publicKey: string; passcode?: string } | null>(null);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcodeForEncryption, setPasscodeForEncryption] = useState<string>('');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [pendingDownloadFile, setPendingDownloadFile] = useState<AggregatedFile | null>(null);
  
  // Initialize services - use useMemo to avoid re-initializing on every render
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
      
      // Aggregate files - backend will use pnIdentifier if available, or search for folders if not
      try {
        const aggregatedFiles = await aggregatorService.aggregateFiles(currentPnIdentifier || undefined);
        console.log(`📁 [loadFiles] Found ${aggregatedFiles.length} file(s)`);
        setFiles(aggregatedFiles);
        
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
        
        // Generate URI for this resource
        const resourceUri = `https://parnoir.com/file/${file.id}`;
        const didUri = resolvedAuth.publicKey.startsWith('did:') 
          ? resolvedAuth.publicKey 
          : `did:key:${resolvedAuth.publicKey}`;
        
        const publicMetadata: PublicMetadata = {
          "@context": [
            "https://schema.org",
            "https://parnoir.com/contexts/metadata/v1"
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
          
          // par Noir specific
          isPublic: true
        };

        // Phase 3: Generate share token for public file access
        let shareToken: ShareToken | undefined = undefined;
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

            // Get passcode for token generation
            let passcodeForToken: string | undefined = resolvedAuth?.passcode;
            if (!passcodeForToken) {
              try {
                passcodeForToken = sessionStorage.getItem('pn_session_passcode') || undefined;
              } catch (e) {
                console.warn('Could not access sessionStorage for passcode');
              }
            }

            if (!passcodeForToken) {
              throw new Error('Passcode required to generate share token');
            }

            // Create session object for token generation
            const session: AuthSession = {
              id: resolvedAuth.publicKey,
              pnName: resolvedAuth.pnName,
              publicKey: resolvedAuth.publicKey,
              nickname: undefined
            };

            // Generate share token
            console.log('🔑 [Phase 3] Starting token generation...', { fileId: file.id, hasSession: !!session, hasPasscode: !!passcodeForToken });
            if (!encryptionService) {
              throw new Error('Encryption service not available');
            }
            shareToken = await encryptionService.generateShareToken(
              encryptedPackage,
              session.pnName!,
              session.publicKey!,
              passcodeForToken!
            );

            // Store token in metadata
            publicMetadata.publicToken = JSON.stringify(shareToken);
            console.log('✅ [Phase 3] Share token generated and stored in metadata:', file.id, {
              tokenHasShareKey: !!shareToken.shareKey,
              tokenHasShareEncrypted: !!shareToken.shareEncrypted,
              tokenLength: JSON.stringify(shareToken).length
            });
          }
        } catch (tokenError) {
          console.error('❌ [Phase 3] Failed to generate share token:', tokenError);
          const errorMessage = tokenError instanceof Error ? tokenError.message : 'Unknown error';
          console.error('❌ [Phase 3] Token generation error details:', errorMessage);
          // Continue without token - file will be public but not decryptable by aggregators yet
          setError(`File marked as public, but share token generation failed: ${errorMessage}. Aggregators may not be able to decrypt it.`);
        }

        // Index the file - pass pN identifier so metadata folder is created inside pN folder
        // Get pN identifier for metadata folder location
        let metadataPnIdentifier: string | undefined = undefined;
        try {
          const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
          if (resolvedAuth?.pnName && resolvedAuth?.publicKey && resolvedAuth?.passcode) {
            metadataPnIdentifier = await VolumeIdGenerator.generateVolumeId({
              pnName: resolvedAuth.pnName, // SECRET
              passcode: resolvedAuth.passcode, // SECRET
              publicKey: resolvedAuth.publicKey
            });
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
        await restoredBackend.connect({ token, refreshToken: tokenData.refreshToken });
        const userInfo = await restoredBackend.getUserInfo();
        setConnectedBackends(prev => new Set([...prev, 'google_drive']));
        setUserEmails(prev => {
          const next = new Map(prev);
          next.set('google_drive', userInfo.email);
          return next;
        });
        await loadFiles();
        await loadStorageQuota();
        return;
      }

      // Get user info
      await googleDriveBackend.connect({ token, refreshToken: tokenData.refreshToken });
      const userInfo = await googleDriveBackend.getUserInfo();

      setConnectedBackends(prev => new Set([...prev, 'google_drive']));
      setUserEmails(prev => {
        const next = new Map(prev);
        next.set('google_drive', userInfo.email);
        return next;
      });

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

    // Get passcode if not already set
    if (!passcodeToUse) {
      passcodeToUse = passcodeForEncryption || null;
    }
    
    if (!passcodeToUse) {
      try {
        passcodeToUse = sessionStorage.getItem('pn_session_passcode');
      } catch (e) {
        // sessionStorage might not be available
      }
    }
    if (!passcodeToUse) {
      try {
        passcodeToUse = sessionStorage.getItem('pn_session_passcode') || undefined;
      } catch (e) {
        // sessionStorage might not be available
      }
    }

    if (!passcodeToUse) {
      console.log('📤 [Upload] Passcode missing, showing modal');
      setPendingUploadFile(file);
      setShowPasscodeModal(true);
      return;
    }

    // Update resolvedAuth state for future use (even though we're using local vars now)
    if (!resolvedAuth || resolvedAuth.pnName !== pnName || resolvedAuth.publicKey !== publicKey) {
      setResolvedAuth({ pnName: pnName!, publicKey: publicKey!, passcode: passcodeToUse || undefined });
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📤 [Upload] Proceeding with upload', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasPasscode: !!passcodeToUse });

      // Create session object for encryption using resolved values
      const session: AuthSession = {
        id: authenticatedUser?.id || publicKey!,
        pnName: pnName!,
        publicKey: publicKey!,
        nickname: authenticatedUser?.nickname
      };

      // Encrypt file
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }
      
      const { encryptedBlob, packageData } = await encryptionService.encryptFileForUpload(
        file,
        session,
        passcodeToUse!
      );

      // Get Google Drive backend (default for now)
      const backendId = 'google_drive';
      const backend = aggregatorService.getBackend(backendId);
      if (!backend || !backend.isConnected()) {
        throw new Error(`${backendId} is not connected`);
      }

      // Get or create pN-specific folder using volume ID generator (matches desktop app)
      // IMPORTANT: pnName is SECRET - never log or display
      let pnIdentifier: string;
      try {
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        if (pnName && publicKey && passcodeToUse) {
          // Generate stable volume ID from credentials (matching desktop app format: pn-{12-char-hex})
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName, // SECRET - not logged
            passcode: passcodeToUse, // SECRET - not logged
            publicKey
          });
        } else {
          // Fallback to publicKey-based identifier if credentials incomplete
          pnIdentifier = publicKey ? `pn-${publicKey.substring(0, 12).replace(/[^a-f0-9]/g, '')}` : 'default';
        }
      } catch (err) {
        // Fallback if volume ID generation fails
        console.warn('Volume ID generation failed, using fallback');
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
          { fileName: encryptedFileName, pnIdentifier } // Pass pN identifier for folder management
        );

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

    // Get passcode
    if (!passcodeToUse) {
      passcodeToUse = passcodeForEncryption || null;
    }
    if (!passcodeToUse) {
      try {
        passcodeToUse = sessionStorage.getItem('pn_session_passcode');
      } catch (e) {
        // sessionStorage might not be available
      }
    }
    if (!passcodeToUse) {
      console.log('📥 [Download] Passcode missing, showing modal');
      setPendingDownloadFile(file);
      setShowPasscodeModal(true);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📥 [Download] Proceeding with download', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasPasscode: !!passcodeToUse });

      // Download encrypted file
      const encryptedBlob = await aggregatorService.downloadFromBackend(
        file.backend,
        file.backendFileId
      );

      console.log('📥 [Download] Encrypted file downloaded, size:', encryptedBlob.size);

      // Create session object for decryption using resolved values
      const session: AuthSession = {
        id: authenticatedUser?.id || publicKey!,
        pnName: pnName!,
        publicKey: publicKey!,
        nickname: authenticatedUser?.nickname
      };

      console.log('📥 [Download] Attempting decryption...', { 
        sessionId: session.id?.substring(0, 20) + '...',
        pnName: session.pnName?.substring(0, 10) + '...',
        hasPasscode: !!passcodeToUse
      });

      // Decrypt file
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }
      
      const { decryptedBlob, metadata } = await encryptionService.decryptFileFromDownload(
        encryptedBlob,
        session,
        passcodeToUse!
      );

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

  const handlePasscodeSubmit = async () => {
    if (!passcodeForEncryption) return;

    setShowPasscodeModal(false);

    if (pendingUploadFile) {
      // Retry upload with passcode
      const fakeEvent = {
        target: { files: [pendingUploadFile] }
      } as any;
      const fileToUpload = pendingUploadFile;
      setPendingUploadFile(null);
      setTimeout(() => handleUpload(fakeEvent), 100);
    } else if (pendingDownloadFile) {
      // Retry download with passcode
      const fileToDownload = pendingDownloadFile;
      setPendingDownloadFile(null);
      setTimeout(() => handleDownload(fileToDownload), 100);
    }
  };

  const totalFiles = files.length;
  const hasConnectedBackends = connectedBackends.size > 0;

  return (
    <div className="space-y-6">
      {/* Secure Folder / Desktop App Section */}
      <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Lock className="h-5 w-5 text-blue-400" />
            <div>
              <h3 className="text-lg font-semibold text-white">Secure Folder</h3>
              <p className="text-text-secondary text-sm">
                Access your encrypted files with the desktop app
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-neutral-800/50 rounded-lg p-4 mb-4">
          <p className="text-text-secondary text-sm mb-3">
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

        <a
          href="https://github.com/bymjmazzei/par-Noir/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>Download Desktop App</span>
        </a>
      </div>

      {/* Connection Status */}
      <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Storage Backends</h3>
          <button
            onClick={loadFiles}
            disabled={isLoading}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Google Drive */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <HardDrive className="h-5 w-5 text-blue-400" />
              <div>
                <span className="text-white font-medium">Google Drive</span>
                {connectedBackends.has('google_drive') && userEmails.has('google_drive') && (
                  <p className="text-text-secondary text-sm">
                    Connected as {userEmails.get('google_drive')}
                  </p>
                )}
              </div>
            </div>
            {connectedBackends.has('google_drive') ? (
              <button
                onClick={() => handleDisconnect('google_drive')}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnectGoogleDrive}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Connect
              </button>
            )}
          </div>

          {/* Storage Quota */}
          {connectedBackends.has('google_drive') && storageQuotas.has('google_drive') && (
            <div className="mt-4 pl-8">
              {(() => {
                const quota = storageQuotas.get('google_drive');
                const usedGB = (quota.usageInDrive / (1024 * 1024 * 1024)).toFixed(2);
                const totalGB = (quota.limit / (1024 * 1024 * 1024)).toFixed(0);
                const percentUsed = ((quota.usageInDrive / quota.limit) * 100).toFixed(1);
                const percentAvailable = (100 - parseFloat(percentUsed)).toFixed(1);
                return (
                  <div className="text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-text-secondary">Drive: {usedGB} GB</span>
                      <span className="text-text-secondary">{percentAvailable}% available</span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                    <p className="text-text-secondary mt-1">
                      {usedGB} GB of {totalGB} GB used
                    </p>
                  </div>
                );
              })()}
            </div>
          )}
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

      {/* File Upload */}
      {hasConnectedBackends && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
          <label className="flex items-center space-x-3 cursor-pointer">
            <Upload className="h-5 w-5 text-blue-400" />
            <span className="text-white font-medium">Upload File</span>
            <input
              type="file"
              onChange={handleUpload}
              className="hidden"
              disabled={isLoading}
            />
          </label>
          <p className="text-text-secondary text-sm mt-2">
            Files are encrypted before upload using your pN credentials
          </p>
        </div>
      )}

      {/* File List */}
      {hasConnectedBackends && (
        <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Your Files ({totalFiles})
          </h3>

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
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={`${file.backend}-${file.backendFileId}`}
                  className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-white text-sm truncate">
                          {file.encrypted ? file.originalName : file.name}
                        </p>
                        {fileMetadataMap.get(file.id)?.isPublic && (
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
                      onClick={() => handleTogglePublic(file)}
                      disabled={isLoading}
                      className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                      title={fileMetadataMap.get(file.id)?.isPublic ? 'Make Private' : 'Make Public'}
                      style={{
                        backgroundColor: fileMetadataMap.get(file.id)?.isPublic 
                          ? 'rgba(34, 197, 94, 0.2)' 
                          : 'rgba(107, 114, 128, 0.2)',
                        color: fileMetadataMap.get(file.id)?.isPublic 
                          ? 'rgb(74, 222, 128)' 
                          : 'rgb(156, 163, 175)'
                      }}
                    >
                      {fileMetadataMap.get(file.id)?.isPublic ? (
                        <Globe className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDownload(file)}
                      disabled={isLoading}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Passcode Modal */}
      {showPasscodeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Enter Passcode</h3>
            <p className="text-text-secondary text-sm mb-4">
              {pendingUploadFile ? 'Enter your passcode to encrypt and upload this file.' : 'Enter your passcode to decrypt and download this file.'}
            </p>
            <input
              type="password"
              value={passcodeForEncryption}
              onChange={(e) => setPasscodeForEncryption(e.target.value)}
              placeholder="Enter passcode"
              className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && passcodeForEncryption) {
                  handlePasscodeSubmit();
                }
              }}
              autoFocus
            />
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => {
                  setShowPasscodeModal(false);
                  setPasscodeForEncryption('');
                  setPendingUploadFile(null);
                }}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePasscodeSubmit}
                disabled={!passcodeForEncryption}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {pendingUploadFile ? 'Encrypt & Upload' : 'Decrypt & Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

