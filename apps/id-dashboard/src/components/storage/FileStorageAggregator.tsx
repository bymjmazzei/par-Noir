/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Lock, X, Cloud } from 'lucide-react';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { GoogleDriveBackend } from '../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../types/aggregator';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';
import { ReportContentModal } from './ReportContentModal';
import { ownerGet } from '../../services/ownerApiService';
import { getStoredToken, getStoredTokenForPn } from '../../services/parNoirOAuthInline';
import { MultiCloudStoragePanel } from './MultiCloudStoragePanel';
import {
  DRIVE_ACCOUNTS_STORAGE_KEY,
  isDesktopShell,
  EMPTY_EDIT_FORM,
  type DesktopUnlockPayload,
  type DesktopLockPayload,
  type DriveAccountState,
  type FileStorageAggregatorProps,
  type EditFormState,
} from './FileStorageAggregatorTypes';
import { FileStorageFileViewer } from './FileStorageFileViewer';
import { FileStorageEditMetadataModal } from './FileStorageEditMetadataModal';
import { FileStorageShareSettingsModal } from './FileStorageShareSettingsModal';
import { SecureFolderSection } from './SecureFolderSection';
import { DriveFilesListSection } from './DriveFilesListSection';
import { useDriveLayoutInit } from './hooks/useDriveLayoutInit';
import { useDriveStorageCredentials } from './hooks/useDriveStorageCredentials';
import { useLoadAggregatedFiles } from './hooks/useLoadAggregatedFiles';
import { useGoogleDriveOAuthConnect } from './hooks/useGoogleDriveOAuthConnect';
import { useDriveUpload } from './hooks/useDriveUpload';
import { useDriveFileActions } from './hooks/useDriveFileActions';
import { useShareAndIndexing } from './hooks/useShareAndIndexing';

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({
  authenticatedUser,
  apiToken = null,
  ensureOwnerApiToken,
  hideSecureFolderSection = false,
  deviceGate,
}) => {
  const apiTokenRef = React.useRef(apiToken);
  React.useEffect(() => {
    apiTokenRef.current = apiToken;
  }, [apiToken]);

  /** par Noir OAuth JWT for owner API routes — not the local unlock session token. */
  const resolveOwnerApiToken = React.useCallback((wantedPn?: string | null): string | null => {
    if (wantedPn) {
      return getStoredTokenForPn(wantedPn)?.accessToken ?? null;
    }
    return apiTokenRef.current ?? getStoredToken()?.accessToken ?? null;
  }, []);

  const waitForOwnerApiToken = React.useCallback(
    async (wantedPn?: string | null, maxMs = 45000): Promise<string | null> => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        const token = resolveOwnerApiToken(wantedPn);
        if (token) return token;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return resolveOwnerApiToken(wantedPn);
    },
    [resolveOwnerApiToken]
  );

  // Helper function to get passcode from SecureCredentialManager
  const getPasscodeFromSecureStorage = React.useCallback((sessionId: string | null | undefined): string | null => {
    if (!sessionId) return null;
    try {
      const credentials = SecureCredentialManager.getCredentials(sessionId);
      return credentials?.passcode || null;
    } catch (e) {
      return null;
    }
  }, []);

  type DeviceGateCapability = 'drive.read' | 'drive.upload' | 'profile.write';

  const checkDeviceCapability = React.useCallback(
    (cap: DeviceGateCapability): boolean => {
      if (!deviceGate) return true;
      const allowed =
        cap === 'drive.read'
          ? deviceGate.canDriveRead
          : cap === 'drive.upload'
            ? deviceGate.canDriveUpload
            : deviceGate.canProfileWrite;
      if (!allowed) {
        setError(deviceGate.blockedMessage);
        return false;
      }
      return true;
    },
    [deviceGate]
  );

  const requireDeviceCapability = React.useCallback(
    (cap: DeviceGateCapability): void => {
      if (!checkDeviceCapability(cap)) {
        throw new Error(deviceGate?.blockedMessage || 'This action requires a keyed device.');
      }
    },
    [checkDeviceCapability, deviceGate]
  );

  const driveReadBlocked = Boolean(deviceGate && !deviceGate.canDriveRead);
  const driveUploadBlocked = Boolean(deviceGate && !deviceGate.canDriveUpload);

  // Cache for share tokens (fileId -> shareToken) - generated during upload for quick access
  const shareTokenCache = React.useRef<Map<string, ShareToken>>(new Map());
  const fileInputRefs = React.useRef<Map<string, HTMLInputElement | null>>(new Map());
  const hasInitializedLegacyRef = React.useRef<boolean>(false);
  const loadFilesRef = React.useRef<(() => Promise<void>) | null>(null);
  const loadStorageQuotaRef = React.useRef<(() => Promise<void>) | null>(null);
  const makeShareTokenCacheKey = React.useCallback((backendId: string, backendFileId: string) => `${backendId}|${backendFileId}`, []);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<AggregatedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const userEmailsRef = React.useRef(userEmails);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccountState[]>([]);
  const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, PublicMetadata>>(new Map());
  // SECURITY: resolvedAuth should NOT contain secrets (pnName, passcode)
  // Use SecureCredentialManager.getCredentials(sessionId) to retrieve secrets when needed
  const [resolvedAuth, setResolvedAuth] = useState<{ publicKey: string; authToken?: string } | null>(null);
  const lastDesktopPayloadRef = React.useRef<DesktopUnlockPayload | null>(null);
  const lastDesktopAuthStateRef = React.useRef<'locked' | 'unlocked'>('locked');
  
  const [showDesktopAppInfo, setShowDesktopAppInfo] = useState(false);
  const [editingFile, setEditingFile] = useState<AggregatedFile | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ ...EMPTY_EDIT_FORM });
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const actionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [reportingFile, setReportingFile] = useState<AggregatedFile | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!actionMenuRef.current) {
        return;
      }
      if (event.target instanceof Node && !actionMenuRef.current.contains(event.target)) {
        setOpenMenuFor(null);
        actionMenuRef.current = null;
      }
    };

    if (openMenuFor) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuFor]);

  React.useEffect(() => {
    userEmailsRef.current = userEmails;
  }, [userEmails]);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [viewingFile, setViewingFile] = useState<AggregatedFile | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [filePreviewUrls, setFilePreviewUrls] = useState<Map<string, string>>(new Map()); // fileId -> decrypted blob URL
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());
  const lastIdentityLogRef = React.useRef<string | null>(null);
  const missingIdentityLogRef = React.useRef(false);
  /** Shared between useLoadAggregatedFiles (scheduleTokenRetry, loadFiles) and the credentials token-refresh handler. */
  const ownerIndexWarningLoggedRef = React.useRef<Set<string>>(new Set());
  const ownerIndexRetryCountsRef = React.useRef<Map<string, number>>(new Map());
  const rateLimitedBackendsRef = React.useRef<Set<string>>(new Set());
  const pendingRetryTimeoutRef = React.useRef<number | null>(null);

  const {
    driveSetupProgress,
    setDriveSetupProgress,
    driveSetupProgressRef,
    clearDriveSetupProgress,
    showDriveSetupProgress,
    driveLayoutInitInFlightRef,
    postDriveInitializeWithRetry,
  } = useDriveLayoutInit({ setError });

  // Use refs to avoid accessing state/props during initialization
  // Initialize with null to completely avoid any initialization order issues
  const resolvedAuthRef = React.useRef<any>(null);
  const authenticatedUserRef = React.useRef<any>(null);
  
  // Keep refs in sync with state/props - update whenever they change
  React.useEffect(() => {
    resolvedAuthRef.current = resolvedAuth;
    authenticatedUserRef.current = authenticatedUser;
  }, [resolvedAuth, authenticatedUser]);

  // Derive pN identifier asynchronously and store in ref (must be declared before getStorageIdentityCandidates)
  // STANDARDIZED pN Identifier - Single source of truth
  // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
  // This is the ONLY method used across all implementations (web, desktop, mobile)
  const pnIdentifierRef = React.useRef<string | null>(null);
  const [cloudPnIdentifier, setCloudPnIdentifier] = React.useState<string | null>(null);
  const [portableCloudAccounts, setPortableCloudAccounts] = React.useState<
    Array<{ provider: string; accountId: string; displayName?: string; isSocialCloud?: boolean }>
  >([]);
  const [moveDestKey, setMoveDestKey] = React.useState('');

  React.useEffect(() => {
    const derivePnIdentifier = async () => {
      const currentResolvedAuth = resolvedAuthRef.current;
      const currentAuthenticatedUser = authenticatedUserRef.current;
      
      // STANDARDIZED: Use VolumeIdGenerator - the ONLY method for pN identifier generation
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = currentAuthenticatedUser?.id;
        // SECURITY: Get pnName and passcode from SecureCredentialManager (secrets)
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // SECURITY: Get publicKey from resolvedAuth or authenticatedUser (public data)
      const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
      
        // SECURITY: Use credentials.pnName (from SecureCredentialManager), not from state
        if (credentials?.pnName && credentials?.passcode && publicKey) {
          // STANDARDIZED FORMULA: pnName:passcode:publicKey → SHA256 → pn-{12-char-hex}
          const identifier = await VolumeIdGenerator.generateVolumeId({
            pnName: credentials.pnName,
            passcode: credentials.passcode,
            publicKey
          });
          // CRITICAL: Store WITH 'pn-' prefix - this is the standardized format
          // API expects pn-{hash} format, not just {hash}
          pnIdentifierRef.current = identifier; // Keep full format: pn-{12-char-hex}
          setCloudPnIdentifier(identifier);
          console.log('[StorageCredentials] Derived pN identifier (standardized):', identifier);
        } else {
        pnIdentifierRef.current = null;
          setCloudPnIdentifier(null);
          console.warn('[StorageCredentials] Cannot derive pN identifier - missing credentials');
        }
      } catch (error) {
        console.error('[StorageCredentials] Error deriving pN identifier:', error);
        pnIdentifierRef.current = null;
        setCloudPnIdentifier(null);
      }
    };
    
    derivePnIdentifier();
  }, [resolvedAuth, authenticatedUser]);
  
  // Helper function to generate pn identifier synchronously if available, or return null
  // This ensures we always use the standardized pn identifier format
  async function getPnIdentifier(): Promise<string | null> {
    // First check if we already have it cached
    if (pnIdentifierRef.current) {
      return pnIdentifierRef.current;
    }
    
    // If not cached, try to generate it on-demand
    const currentResolvedAuth = resolvedAuthRef.current;
    const currentAuthenticatedUser = authenticatedUserRef.current;
    const sessionId = currentAuthenticatedUser?.id;
    // SECURITY: Get pnName and passcode from SecureCredentialManager (secrets)
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // SECURITY: Get publicKey from resolvedAuth or authenticatedUser (public data)
    const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
    
    // SECURITY: Use credentials.pnName (from SecureCredentialManager), not from state
    if (credentials?.pnName && credentials?.passcode && publicKey) {
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const identifier = await VolumeIdGenerator.generateVolumeId({
          pnName: credentials.pnName,
          passcode: credentials.passcode,
          publicKey
        });
        // Cache it for future use
        pnIdentifierRef.current = identifier;
        return identifier;
      } catch (error) {
        console.error('[StorageCredentials] Error generating pn identifier on-demand:', error);
        return null;
      }
    }
    
    return null;
  }

  // Use a function declaration (not const arrow function) so it's hoisted and available during initialization
  // This function reads from refs to avoid circular dependency issues
  // CRITICAL: Returns ONLY the standardized pn identifier - no other candidates
  // SECURITY: NEVER include pnName in identity candidates - it's a secret credential
  function getStorageIdentityCandidates(): string[] {
    const candidates: string[] = [];
    
    // CRITICAL: Use ONLY the standardized pn identifier
    // If pnIdentifierRef is not set yet, return empty array (don't fall back to other identifiers)
    // This prevents duplicate API calls with different identityIds
    if (pnIdentifierRef.current && pnIdentifierRef.current.startsWith('pn-')) {
      candidates.push(pnIdentifierRef.current);
    }
    
    // REMOVED: All other candidates (DID, public key, pn name) - they cause duplicate API calls
    // Only use standardized pn identifier: pn-{12-char-hex-hash}
    
    return Array.from(new Set(candidates.filter((value) => value && value.trim().length > 0)));
  }

  // Don't use useCallback here - just inline the logic where needed to avoid circular dependencies
  // This function is only used in a few places, so inlining is fine

  // Initialize services - useMemo to avoid re-initializing on every render
  const aggregatorService = React.useMemo(() => {
    try {
      return getFileAggregatorService();
    } catch (e) {
      console.error('Failed to initialize aggregator service:', e);
      return null;
    }
  }, []);

  const registerPortableCloudBackends = React.useCallback(async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !aggregatorService) return;
    try {
      const res = await ownerGet(
        ownerToken,
        `/api/storage/accounts/${encodeURIComponent(cloudPnIdentifier)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        accounts?: Array<{ provider: string; accountId: string; displayName?: string; isSocialCloud?: boolean }>;
      };
      const portable = (data.accounts ?? []).filter((a) => a.provider !== 'google_drive');
      setPortableCloudAccounts(portable);
      const { PortableBlobBackend } = await import('../../services/storage/PortableBlobBackend');
      for (const acct of portable) {
        const backendId = `${acct.provider}::${acct.accountId}`;
        aggregatorService.registerBackend(
          backendId,
          new PortableBlobBackend(
            cloudPnIdentifier,
            ownerToken,
            acct.provider,
            acct.accountId
          )
        );
        setConnectedBackends((prev) => new Set(prev).add(backendId));
      }
    } catch {
      /* non-fatal */
    }
  }, [cloudPnIdentifier, apiToken, resolveOwnerApiToken, aggregatorService]);

  React.useEffect(() => {
    void registerPortableCloudBackends();
  }, [registerPortableCloudBackends]);

  React.useEffect(() => {
    if (portableCloudAccounts.length === 0 || !loadFilesRef.current) return;
    void loadFilesRef.current();
  }, [portableCloudAccounts.length]);
  
  const getResolvedAuthCredentials = React.useCallback(() => {
    // SECURITY: Get pnName and passcode from SecureCredentialManager ONLY (secrets)
    // Never get pnName from resolvedAuth or authenticatedUser state - it's a SECRET
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // SECURITY: pnName is a SECRET - only get from SecureCredentialManager
    const pnName = credentials?.pnName || null;

    // Get publicKey from resolvedAuth or authenticatedUser (public data)
    let publicKey =
      resolvedAuth?.publicKey ||
      authenticatedUser?.publicKey ||
      (typeof authenticatedUser?.id === 'string' ? authenticatedUser.id : null) ||
      null;

    // SECURITY: Get passcode from SecureCredentialManager (secrets)
    const passcode = credentials?.passcode || null;

    if (!pnName || !publicKey) {
      return null;
    }

    return {
      pnName,
      publicKey,
      passcode: passcode || undefined,
    };
  }, [authenticatedUser, resolvedAuth]);
  
  React.useEffect(() => {
    // SECURITY: Check if credentials exist in SecureCredentialManager
    // resolvedAuth no longer contains passcode (it's a secret)
    try {
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      
      if (!resolvedAuth || credentials) {
        // Credentials already exist, no need to hydrate
        return;
      }
    } catch (e) {
      console.warn('⚠️ [FileStorageAggregator] Unable to get credentials from SecureCredentialManager:', e);
    }
  }, [resolvedAuth, authenticatedUser]);
  
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

  const {
    driveCredentialCacheRef,
    cleanupDuplicateCacheEntries,
    resolveIdentifiersForEmail,
    buildStorageCredentialPayload,
    persistStorageCredentialsToAPI,
    hydrateStorageCredentialsFromAPI,
    upsertDriveAccount,
    disconnectTimestampRef,
    disconnectedBackendIdsRef,
    DISCONNECT_BLOCK_DURATION_MS,
  } = useDriveStorageCredentials({
    authenticatedUser,
    apiToken,
    ensureOwnerApiToken,
    resolvedAuth,
    aggregatorService,
    driveAccounts,
    setDriveAccounts,
    userEmails,
    setUserEmails,
    setConnectedBackends,
    activeBackendId,
    setActiveBackendId,
    setDriveSetupProgress,
    clearDriveSetupProgress,
    postDriveInitializeWithRetry,
    resolveOwnerApiToken,
    waitForOwnerApiToken,
    getResolvedAuthCredentials,
    getPasscodeFromSecureStorage,
    getPnIdentifier,
    getStorageIdentityCandidates,
    authenticatedUserRef,
    pnIdentifierRef,
    loadFilesRef,
    loadStorageQuotaRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
  });

  function getDriveAccountByBackendId(backendId: string | null | undefined) {
      if (!backendId) {
        return null;
      }
      return driveAccounts.find((account) => account.backendId === backendId) || null;
  }
  

  const resolveActiveBackendEntry = React.useCallback(() => {
    const empty = {
      backendId: null as string | null,
      backend: null as GoogleDriveBackend | null,
      account: null as DriveAccountState | null,
      keyPrefix: null as string | null,
    };

    if (!aggregatorService) {
      return empty;
    }

    const finalize = (backendId: string, backend: GoogleDriveBackend) => {
      const account =
        driveAccounts.find((entry) => entry.backendId === backendId) || null;
      const keyPrefix =
        account?.keyPrefix ||
        (typeof backend.getStorageKeyPrefix === 'function' ? backend.getStorageKeyPrefix() : null);
      return { backendId, backend, account, keyPrefix };
    };

    let backendId = activeBackendId;
    if (!backendId && driveAccounts.length > 0) {
      backendId = driveAccounts[0].backendId;
    }

    if (backendId) {
      const backend = aggregatorService.getBackend(backendId) as GoogleDriveBackend | null;
      if (backend) {
        return finalize(backendId, backend);
      }
    }

    if (typeof aggregatorService.listBackendEntries === 'function') {
      const connectedEntry = aggregatorService
        .listBackendEntries()
        .find(({ backend }) => backend.isConnected());
      if (connectedEntry) {
        return finalize(
          connectedEntry.id,
          connectedEntry.backend as GoogleDriveBackend
        );
      }
    }

    return empty;
  }, [aggregatorService, activeBackendId, driveAccounts]);


  // Version check - this will help verify new code is loading
  React.useEffect(() => {
    console.log('🚀 [FileStorageAggregator] Component loaded - Version: 2024-12-05-v2');
  }, []);

  // Resolve auth credentials
  useEffect(() => {
    const resolveAuth = async () => {
      // Always log - this is critical debugging
      if (import.meta.env.DEV) {
        console.log('🔍 [FileStorageAggregator] Resolving auth...');
      }
      // pnName is secret - not logged
      if (import.meta.env.DEV) {
        console.log('🔍 [FileStorageAggregator] authenticatedUser prop received');
      }

      // Try prop first
      if (authenticatedUser) {
        if (import.meta.env.DEV) {
          try {
            const safeKeys = Object.keys(authenticatedUser).filter(k => k !== 'pnName' && k !== 'passcode');
            console.log('🔍 [FileStorageAggregator] authenticatedUser keys:', safeKeys);
            console.log('🔍 [FileStorageAggregator] authenticatedUser structure:', {
              hasId: !!authenticatedUser.id,
              hasPublicKey: !!authenticatedUser.publicKey,
              hasNickname: !!authenticatedUser.nickname,
            });
          } catch (e) {
            console.warn('🔍 [FileStorageAggregator] Could not inspect authenticatedUser:', e);
          }
        }
        
        // SECURITY: Get pnName from SecureCredentialManager ONLY (secrets)
        // Never extract pnName from authenticatedUser - it's a SECRET and shouldn't be there
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        const pnName = credentials?.pnName || null;
        
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
        
        if (import.meta.env.DEV) {
          console.log('🔍 [FileStorageAggregator] Extracted from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser.id });
        }
        
        let passcode: string | null = null;
        try {
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          passcode = getPasscodeFromSecureStorage(sessionId);
          if (import.meta.env.DEV) {
            console.log('🔍 [FileStorageAggregator] Passcode from SecureCredentialManager:', passcode ? 'found' : 'not found');
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn('🔍 [FileStorageAggregator] SecureCredentialManager not available');
          }
        }
        
        const authToken = authenticatedUser?.authToken;
        
        if (pnName && publicKey && passcode) {
          // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          if (sessionId) {
            SecureCredentialManager.setCredentials(sessionId, pnName, passcode);
          }
          
          if (import.meta.env.DEV) {
            console.log('✅ [FileStorageAggregator] Auth resolved from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey });
          }
          // SECURITY: Only store public data in resolvedAuth (no secrets)
          setResolvedAuth({
            publicKey,
            authToken: authToken || undefined,
          });
          setError(null);
          return;
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ [FileStorageAggregator] Missing credentials from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, authenticatedUserKeys: Object.keys(authenticatedUser || {}) });
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.log('⚠️ [FileStorageAggregator] No authenticatedUser prop');
        }
      }
      
      // Fallback: Try to load from storage
      try {
        if (import.meta.env.DEV) {
          console.log('🔍 [FileStorageAggregator] Trying storage fallback...');
        }
        const { SecureStorage } = await import('../../utils/storage');
        const storage = new SecureStorage();
        await storage.init(); // Initialize database first
        const session = await storage.getCurrentSession();
        
        if (session) {
          const pnName = (session as any).pnName || (session as any).username || (session as any).name;
          const publicKey = (session as any).publicKey || 
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id);
          const sessionAuthToken = (session as any).authToken;
          
          if (import.meta.env.DEV) {
            console.log('🔍 [FileStorageAggregator] Extracted from storage:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, sessionKeys: Object.keys(session) });
          }
          
          let passcode: string | null = null;
          try {
            // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
            passcode = getPasscodeFromSecureStorage(sessionId);
          } catch (e) {
            // SecureCredentialManager might not be available
          }
          
          if (pnName && publicKey && passcode) {
            // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || session?.id || null;
            if (sessionId) {
              SecureCredentialManager.setCredentials(sessionId, pnName, passcode);
            }
            
            if (import.meta.env.DEV) {
              console.log('✅ [FileStorageAggregator] Auth resolved from storage');
            }
            // SECURITY: Only store public data in resolvedAuth (no secrets)
            setResolvedAuth({
              publicKey,
              authToken: sessionAuthToken || undefined,
            });
            setError(null);
          } else {
            if (import.meta.env.DEV) {
              console.warn('⚠️ [FileStorageAggregator] Missing credentials from storage:', { hasPnName: !!pnName, hasPublicKey: !!publicKey });
            }
          }
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ [FileStorageAggregator] No session found in storage');
          }
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

  React.useEffect(() => {
    // No-op: legacy effect retained for backward compatibility
  }, [resolvedAuth]);

  const loadFileMetadata = React.useCallback(async (filesToLoad: AggregatedFile[]) => {
    try {
      console.log('📋 [Metadata] Loading file metadata...', { fileCount: filesToLoad.length });
      const { backend, backendId, keyPrefix } = resolveActiveBackendEntry();
      // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (backend && backend.isConnected() && credentials?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
          let ensuredToken: string | null = null;
          if (typeof (backend as any).ensureAccessToken === 'function') {
            try {
              ensuredToken = await (backend as any).ensureAccessToken();
            } catch (ensureError) {
              console.warn('⚠️ [Metadata] ensureAccessToken failed (non-blocking):', ensureError);
            }
          }
          const localTokenKey = keyPrefix
            ? `${keyPrefix}_token`
            : backendId
              ? `${backendId}_token`
              : 'google_drive_token';
          const token =
            ensuredToken ||
            (typeof backend.getAccessToken === 'function' ? backend.getAccessToken() : null) ||
            (backend as any).token ||
            localStorage.getItem(localTokenKey);

          if (token) {
            console.log('✅ [Metadata] Google Drive connected, loading owner index...');
            let pnIdentifier: string | undefined;
            
            // Use VolumeIdGenerator for consistent pnIdentifier generation (same as desktop app)
            try {
              const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth or authenticatedUser (public)
              const publicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey;
              
              if (credentials?.pnName && credentials?.passcode && publicKey) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: credentials.pnName,
                  passcode: credentials.passcode,
                  publicKey: publicKey
                });
                console.log(`✅ [Metadata] Generated pN identifier (VolumeIdGenerator): ${(pnIdentifier || '').substring(0, 8)}...`);
                console.log(`📁 [Metadata] Expected folder: "par Noir - ${(pnIdentifier || '').substring(0, 8)}..."`);
                
                // Also log fallback for comparison
                if (pnIdentifierRef.current) {
                  // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
                  const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
                  if (fallbackId !== pnIdentifier) {
                    console.warn(`⚠️ [Metadata] Identifier mismatch! Correct: ${(pnIdentifier || '').substring(0, 8)}..., Fallback: ${(fallbackId || '').substring(0, 8)}...`);
                    console.warn(`⚠️ [Metadata] Using CORRECT identifier: ${(pnIdentifier || '').substring(0, 8)}...`);
                  }
                }
              } else {
                console.warn('⚠️ [Metadata] Missing credentials for volume ID generation:', {
                  hasPnName: !!credentials?.pnName,
                  hasPasscode: !!credentials?.passcode,
                  hasPublicKey: !!publicKey,
                  hasResolvedAuth: !!resolvedAuth,
                  hasAuthenticatedUser: !!authenticatedUser
                });
              }
            } catch (volumeIdError) {
              console.warn('⚠️ [Metadata] Failed to generate volume ID, using fallback:', volumeIdError);
            }
            
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            // If credentials aren't available, we cannot generate the identifier
            if (!pnIdentifier) {
              console.warn('⚠️ [Metadata] Cannot generate standardized pN identifier - credentials required');
              console.warn('⚠️ [Metadata] Metadata indexing skipped - credentials must be available');
              return;
            }

            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(token, pnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(token, pnFolderId);
            
            // Try loading from content class-specific indices first, fallback to root index
            const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndexFromContentClasses(
              token,
              metadataFolderId,
              pnIdentifier,
              resolveOwnerApiToken()
            );

            if (ownerIndex && ownerIndex.files) {
              const metadataMap = new Map<string, PublicMetadata>();
              const indexMap = new Map<string, any>();
              ownerIndex.files.forEach(entry => {
                indexMap.set(entry.googleDriveFileId, entry);
              });

              for (const file of filesToLoad) {
                const indexEntry = indexMap.get(file.backendFileId);
                if (indexEntry) {
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
                    publicToken: indexEntry.publicToken,
                    engagement: indexEntry.engagement,
                    inReplyTo: indexEntry.inReplyTo,
                    repostOf: indexEntry.repostOf,
                    isPartOf: indexEntry.isPartOf,
                    thumbnailFileId: (indexEntry as any).thumbnailFileId || null,
                    '@context': ['https://schema.org/'],
                    '@type': 'CreativeWork',
                    '@id': `https://parnoir.com/resource/${indexEntry.fileId || file.id}`
                  };
                  metadataMap.set(file.id, publicMetadata);

                  if (indexEntry.publicToken) {
                    try {
                      const token = typeof indexEntry.publicToken === 'string'
                        ? JSON.parse(indexEntry.publicToken)
                        : indexEntry.publicToken;
                      const cacheKey = makeShareTokenCacheKey(file.backend || '', file.backendFileId);
                      shareTokenCache.current.set(cacheKey, token);
                      console.log('💾 [Metadata] Cached share token from owner index for file:', file.id);
                    } catch (e) {
                      console.warn('⚠️ [Metadata] Failed to cache token from owner index:', e);
                    }
                  }
                }
              }

              const normalized = new Map<string, PublicMetadata>();
              metadataMap.forEach((item, key) => {
                normalized.set(key, item);
                if (item.backendFileId && item.backendFileId !== key) {
                  normalized.set(item.backendFileId, item);
                }
                if (item.fileId && item.fileId !== key) {
                  normalized.set(item.fileId, item);
                }
              });
              setFileMetadataMap(normalized);
              return;
            }
          }
        } catch (ownerIndexError) {
          console.warn('Failed to load from owner index, falling back to metadata service:', ownerIndexError);
        }
      }

      if (!metadataIndexService) {
        return;
      }

      await metadataIndexService.initialize();

      try {
        const preferredDid =
          resolvedAuth?.publicKey
            ? (resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`)
            : authenticatedUser?.id && authenticatedUser.id.startsWith('did:')
              ? authenticatedUser.id
              : undefined;

        // Dashboard reads metadata directly from Google Drive, not from aggregator API
        // The aggregator API is for browser app and third-party consumers
        // Skip syncFromCentralAggregator - dashboard should read companion metadata from Google Drive files
      } catch (centralSyncError) {
        console.warn('⚠️ [Metadata] Central aggregator sync failed (non-blocking):', centralSyncError);
      }

      const metadataMap = new Map<string, PublicMetadata>();
      const allPublicMetadata = await metadataIndexService.getAllPublicMetadata();
      allPublicMetadata.forEach((item) => {
        if (!item.fileId) {
          return;
        }
        metadataMap.set(item.fileId, item);
        if (item.backendFileId && item.backendFileId !== item.fileId) {
          metadataMap.set(item.backendFileId, item);
        }
      });
      for (const file of filesToLoad) {
        const candidateIds = new Set<string>([file.id]);
        if (file.backendFileId) {
          candidateIds.add(file.backendFileId);
        }

        let metadata: PublicMetadata | null = null;
        for (const candidateId of candidateIds) {
          if (metadataMap.has(candidateId)) {
            metadata = metadataMap.get(candidateId)!;
            break;
          }
          const fetched = await metadataIndexService.getFileMetadata(candidateId);
          if (fetched) {
            metadataMap.set(candidateId, fetched);
            if (fetched.fileId && fetched.fileId !== candidateId) {
              metadataMap.set(fetched.fileId, fetched);
            }
            if (fetched.backendFileId && fetched.backendFileId !== candidateId) {
              metadataMap.set(fetched.backendFileId, fetched);
            }
            metadata = fetched;
            break;
          }
        }

        if (!metadata && metadataIndexService) {
          const fetched = await metadataIndexService.getFileMetadata(file.id);
          if (fetched) {
            metadataMap.set(file.id, fetched);
            if (fetched.backendFileId && fetched.backendFileId !== file.id) {
              metadataMap.set(fetched.backendFileId, fetched);
            }
          }
        }
      }
      setFileMetadataMap(new Map(metadataMap));
    } catch (err) {
      console.error('Failed to load file metadata:', err);
    }
  }, [aggregatorService, resolvedAuth, authenticatedUser, metadataIndexService, resolveActiveBackendEntry]);

  const {
    sharingFile,
    shareVisibility,
    setShareVisibility,
    shareNSFW,
    setShareNSFW,
    isSavingShare,
    thirdPartyIndexers,
    indexerToggles,
    isLoadingIndexers,
    indexerError,
    refreshMetadataInBackground,
    openShareSettings,
    closeShareSettings,
    handleIndexerToggle,
    handleSaveShareSettings,
  } = useShareAndIndexing({
    authenticatedUser,
    resolvedAuth,
    aggregatorService,
    encryptionService,
    metadataIndexService,
    activeBackendId,
    fileMetadataMap,
    setFileMetadataMap,
    setError,
    setSuccessMessage,
    requireDeviceCapability,
    getStorageIdentityCandidates,
    makeShareTokenCacheKey,
    loadFileMetadata,
    shareTokenCache,
  });

  const { loadFiles, loadStorageQuota } = useLoadAggregatedFiles({
    aggregatorService,
    authenticatedUser,
    resolvedAuth,
    driveAccounts,
    activeBackendId,
    setActiveBackendId,
    setFiles,
    setError,
    setIsLoading,
    setFileMetadataMap,
    setStorageQuotas,
    setUserEmails,
    loadFileMetadata,
    registerPortableCloudBackends,
    driveReadBlocked,
    deviceGate,
    resolveOwnerApiToken,
    getPasscodeFromSecureStorage,
    makeShareTokenCacheKey,
    shareTokenCache,
    pnIdentifierRef,
    driveLayoutInitInFlightRef,
    driveSetupProgressRef,
    loadFilesRef,
    loadStorageQuotaRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
    pendingRetryTimeoutRef,
  });

  const filesByBackend = React.useMemo(() => {
    const map = new Map<string, AggregatedFile[]>();
    files.forEach((file) => {
      const key = file.backend || 'google_drive';
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(file);
    });
    return map;
  }, [files]);

  const {
    handleConnectGoogleDrive,
    handleDisconnect,
  } = useGoogleDriveOAuthConnect({
    authenticatedUser,
    aggregatorService,
    driveAccounts,
    setDriveAccounts,
    userEmails,
    setUserEmails,
    setConnectedBackends,
    setFiles,
    setFilePreviewUrls,
    activeBackendId,
    setActiveBackendId,
    setError,
    setDriveSetupProgress,
    clearDriveSetupProgress,
    checkDeviceCapability,
    resolveOwnerApiToken,
    getResolvedAuthCredentials,
    getPasscodeFromSecureStorage,
    getStorageIdentityCandidates,
    driveCredentialCacheRef,
    cleanupDuplicateCacheEntries,
    resolveIdentifiersForEmail,
    buildStorageCredentialPayload,
    persistStorageCredentialsToAPI,
    upsertDriveAccount,
    disconnectTimestampRef,
    disconnectedBackendIdsRef,
    DISCONNECT_BLOCK_DURATION_MS,
    shareTokenCache,
    loadFiles,
    loadStorageQuota,
  });

  const { handleUpload } = useDriveUpload({
    authenticatedUser,
    resolvedAuth,
    setResolvedAuth,
    aggregatorService,
    encryptionService,
    driveAccounts,
    activeBackendId,
    portableCloudAccounts,
    setError,
    setIsLoading,
    checkDeviceCapability,
    getPasscodeFromSecureStorage,
    makeShareTokenCacheKey,
    shareTokenCache,
    pnIdentifierRef,
    loadFiles,
  });

  const {
    handleEditMetadata,
    handleSaveMetadata,
    handleViewFile,
    loadFilePreview,
    handleDownload,
    handleMoveToCloud,
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    handleDelete,
  } = useDriveFileActions({
    authenticatedUser,
    resolvedAuth,
    aggregatorService,
    encryptionService,
    driveAccounts,
    activeBackendId,
    files,
    filesByBackend,
    fileMetadataMap,
    setFileMetadataMap,
    filePreviewUrls,
    setFilePreviewUrls,
    loadingPreviews,
    setLoadingPreviews,
    editingFile,
    setEditingFile,
    editForm,
    setEditForm,
    setViewingFile,
    selectedFiles,
    setSelectedFiles,
    setIsBulkDeleteMode,
    setOpenMenuFor,
    actionMenuRef,
    setError,
    setSuccessMessage,
    setIsLoading,
    cloudPnIdentifier,
    moveDestKey,
    setMoveDestKey,
    checkDeviceCapability,
    requireDeviceCapability,
    resolveOwnerApiToken,
    makeShareTokenCacheKey,
    loadFileMetadata,
    shareTokenCache,
    loadFilesRef,
    loadFiles,
  });


  // Initialize and restore connections (legacy localStorage fallback)
  useEffect(() => {
    if (!aggregatorService || hasInitializedLegacyRef.current) {
      return;
    }

    hasInitializedLegacyRef.current = true;

    const init = async () => {
      try {
        await aggregatorService.ensureInitialized();
      } catch (initError) {
        console.warn('⚠️ [init] Unable to initialize aggregator service:', initError);
        return;
      }

      // SECURITY: Immediately clean up any email data from localStorage
      try {
        // Clean up email from accounts array
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            let hasEmail = false;
            const cleaned = parsed.map((entry: any) => {
              if (entry && entry.email) {
                hasEmail = true;
                const { email, ...rest } = entry;
                return rest;
              }
              return entry;
            });
            
            if (hasEmail) {
              localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(cleaned));
              console.log('[Security] Removed email from pn_google_drive_accounts on component load');
            }
          }
        }

        // SECURITY: Clean up localStorage keys that contain email patterns
        // These are keys like "google_drive_bymjmazzei-gmail-com-87d29d6d_*"
        const allKeys = Object.keys(localStorage);
        const emailPattern = /[a-z0-9]+-gmail-com-[a-z0-9]+|@[a-z0-9]+\.[a-z]+/i;
        let cleanedKeys = 0;
        
        for (const key of allKeys) {
          // Check if key contains email pattern and is Google Drive related
          if (key.includes('google_drive') && emailPattern.test(key)) {
            try {
              // Only remove credential-related keys, keep folder cache and other non-sensitive data
              if (key.includes('_token') || key.includes('_email') || key.includes('_refresh')) {
                localStorage.removeItem(key);
                cleanedKeys++;
                console.log(`[Security] Removed localStorage key containing email pattern`);
              }
            } catch (e) {
              console.warn(`[Security] Failed to remove key ${key}:`, e);
            }
          }
        }
        
        if (cleanedKeys > 0) {
          console.log(`[Security] Cleaned ${cleanedKeys} localStorage keys containing email patterns`);
        }
      } catch (cleanupError) {
        console.warn('⚠️ [init] Failed to clean email from drive accounts', cleanupError);
      }

      let storedAccounts: DriveAccountState[] = [];
      try {
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Filter out any entries that still have email (defensive)
            storedAccounts = parsed
              .filter((entry) => entry && entry.backendId && entry.keyPrefix && !entry.email)
              .map((entry: any) => ({
                backendId: entry.backendId,
                keyPrefix: entry.keyPrefix
                // Explicitly exclude email
              }));
          }
        }
      } catch (parseError) {
        console.warn('⚠️ [init] Failed to parse stored drive accounts', parseError);
      }

      if (storedAccounts.length === 0) {
        // SECURITY: Do not load plaintext tokens from localStorage
        // Legacy tokens should be migrated via IntegrationCredentialManager
        // For now, skip legacy token loading to prevent exposure
        // const legacyToken = localStorage.getItem('google_drive_token'); // REMOVED - security risk
        // if (legacyToken) {
        //   const legacyEmail = localStorage.getItem('google_drive_email'); // REMOVED - security risk
        //   const legacyRefresh = localStorage.getItem('google_drive_refresh_token'); // REMOVED - security risk
        //   ...
        // }
        
        // Instead, try to load from encrypted storage if user is authenticated
        if (authenticatedUser?.id) {
          try {
            const credentials = await IntegrationCredentialManager.getCredentials(
              'google_drive',
              authenticatedUser.id
            );
            if (credentials?.email && credentials.accessToken) {
              const identifiers = resolveIdentifiersForEmail(credentials.email);
          await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
                token: credentials.accessToken,
                refreshToken: credentials.refreshToken ?? null,
                email: credentials.email
          });
            }
          } catch (error) {
            console.warn('[FileStorageAggregator] Failed to load encrypted credentials:', error);
          }
        }
      } else {
        for (const account of storedAccounts) {
          // SECURITY: Do not load tokens from plaintext localStorage
          // Load from encrypted storage if user is authenticated
          let token: string | null = null;
          let refresh: string | null = null;
          
          if (authenticatedUser?.id) {
            try {
              const credentials = await IntegrationCredentialManager.getCredentials(
                account.backendId,
                authenticatedUser.id
              );
              if (credentials) {
                token = credentials.accessToken ?? null;
                refresh = credentials.refreshToken || null;
              }
            } catch (error) {
              console.warn('[FileStorageAggregator] Failed to load encrypted credentials:', error);
            }
          }
          
          // Legacy fallback removed - security risk
          // const token = localStorage.getItem(`${account.keyPrefix}_token`); // REMOVED
          // const refresh = localStorage.getItem(`${account.keyPrefix}_refresh_token`); // REMOVED

          if (!token) {
            continue;
          }

          // SECURITY: Do not pass email - it's sensitive and should be in encrypted storage only
          await upsertDriveAccount({
            backendId: account.backendId,
            keyPrefix: account.keyPrefix,
            token,
            refreshToken: refresh,
            // email removed - should be retrieved from encrypted storage if needed
          });
        }
      }

      try {
        await loadFiles();
        await loadStorageQuota();
      } catch (loadError) {
        console.warn('⚠️ [init] Failed to load files during initialization', loadError);
      }
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatorService]);




  const totalFiles = files.length;
  const hasConnectedBackends =
    driveAccounts.length > 0 || portableCloudAccounts.length > 0;
  const connectedStorageCount = driveAccounts.length + portableCloudAccounts.length;

  React.useEffect(() => {
    if (!isDesktopShell) {
      lastDesktopAuthStateRef.current = 'locked';
      lastDesktopPayloadRef.current = null;
      return;
    }

    // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    const hasAuth = Boolean(credentials?.pnName && resolvedAuth?.publicKey && resolvedAuth?.authToken);

    if (!hasAuth) {
      if (lastDesktopAuthStateRef.current === 'unlocked') {
        window.dispatchEvent(
          new CustomEvent<DesktopLockPayload>('pn-auth-locked', {
            detail: lastDesktopPayloadRef.current ?? undefined,
          })
        );
        lastDesktopAuthStateRef.current = 'locked';
        lastDesktopPayloadRef.current = null;
      }
      return;
    }

    let disposed = false;

    void (async () => {
      let pnIdentifier: string | undefined;

      // STANDARDIZED: Use VolumeIdGenerator - the ONLY method for pN identifier
      // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth (public)
        if (credentials?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName: credentials.pnName,
            passcode: credentials.passcode,
            publicKey: resolvedAuth.publicKey
          });
          console.log('[DesktopUnlock] Generated pN identifier (standardized):', (pnIdentifier || '').substring(0, 8) + '...');
        } else {
          console.warn('[DesktopUnlock] Cannot generate standardized pN identifier - credentials required');
        }
      } catch (err) {
        console.error('[DesktopUnlock] Failed to generate standardized pN identifier:', err);
      }

      if (disposed) {
        return;
      }

      // SECURITY: Get pnName from credentials (secrets) for desktop unlock payload
      const pnNameForPayload = credentials?.pnName || null;
      if (!pnNameForPayload || !resolvedAuth?.publicKey || !resolvedAuth.authToken) {
        console.error('[DesktopUnlock] Missing credentials or publicKey');
        return;
      }

      const payload: DesktopUnlockPayload = {
        pnName: pnNameForPayload,
        publicKey: resolvedAuth.publicKey,
        authToken: resolvedAuth.authToken,
        pnIdentifier,
      };

      lastDesktopPayloadRef.current = payload;
      lastDesktopAuthStateRef.current = 'unlocked';

      console.debug('[FileStorageAggregator] Dispatching pn-auth-session', {
        hasAuthToken: Boolean(payload.authToken),
        pnIdentifier: payload.pnIdentifier,
      });

      window.dispatchEvent(new CustomEvent<DesktopUnlockPayload>('pn-auth-session', { detail: payload }));
    })();

    return () => {
      disposed = true;
    };
  }, [isDesktopShell, resolvedAuth, authenticatedUser]);

  React.useEffect(() => {
    if (!authenticatedUser && resolvedAuth) {
      setResolvedAuth(null);
    }
  }, [authenticatedUser, resolvedAuth]);

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <SecureFolderSection
        hideSecureFolderSection={hideSecureFolderSection}
        showDesktopAppInfo={showDesktopAppInfo}
        setShowDesktopAppInfo={setShowDesktopAppInfo}
      />

      <MultiCloudStoragePanel
        pnIdentifier={cloudPnIdentifier}
        authToken={apiToken ?? undefined}
        sessionId={authenticatedUser?.id ?? null}
        onConnectGoogleDrive={handleConnectGoogleDrive}
        googleDriveConnectedCount={driveAccounts.length}
        driveConnectDisabled={isLoading || showDriveSetupProgress}
        connectedStorageCount={connectedStorageCount}
        onConnected={async () => {
          void hydrateStorageCredentialsFromAPI();
          await registerPortableCloudBackends();
          void loadFiles();
        }}
      />

      {!hasConnectedBackends && (
        <div className="bg-neutral-900/40 border border-neutral-700/60 border-dashed rounded-xl p-6 text-center">
          <Cloud className="h-10 w-10 text-text-secondary mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">No storage connected yet</p>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Choose Google Drive, Dropbox, S3, Azure, OneDrive, or FTP above. One provider becomes your social cloud for tables and indexes; files can live on any connected account.
          </p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-green-400 text-sm">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="mt-2 text-xs text-green-400 hover:text-green-300 underline"
          >
            Dismiss
          </button>
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
      
      {driveReadBlocked && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2">
            <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-amber-200 text-sm">{deviceGate?.blockedMessage}</span>
          </div>
        </div>
      )}

      {/* Auth Status Warning */}
      {!resolvedAuth && !error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-yellow-400 text-sm">
                Please unlock your pN first to encrypt files
              </span>
              {import.meta.env.DEV && (
                <>
                  <p className="text-yellow-500/70 text-xs mt-1 break-all">
                    Debug: authenticatedUser={authenticatedUser ? 'present' : 'null'}, resolvedAuth={resolvedAuth ? 'present' : 'null'}
                  </p>
                  <button
                    type="button"
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {hasConnectedBackends && (
        <DriveFilesListSection
          driveAccounts={driveAccounts}
          userEmails={userEmails}
          filesByBackend={filesByBackend}
          storageQuotas={storageQuotas}
          connectedBackends={connectedBackends}
          files={files}
          fileMetadataMap={fileMetadataMap}
          filePreviewUrls={filePreviewUrls}
          loadingPreviews={loadingPreviews}
          selectedFiles={selectedFiles}
          isBulkDeleteMode={isBulkDeleteMode}
          viewMode={viewMode}
          openMenuFor={openMenuFor}
          isLoading={isLoading}
          driveReadBlocked={driveReadBlocked}
          driveUploadBlocked={driveUploadBlocked}
          deviceGateBlockedMessage={deviceGate?.blockedMessage}
          showDriveSetupProgress={showDriveSetupProgress}
          driveSetupProgress={driveSetupProgress}
          authenticatedUserId={authenticatedUser?.id ?? null}
          portableCloudAccounts={portableCloudAccounts}
          moveDestKey={moveDestKey}
          fileInputRefs={fileInputRefs}
          actionMenuRef={actionMenuRef}
          setActiveBackendId={setActiveBackendId}
          setError={setError}
          setIsBulkDeleteMode={setIsBulkDeleteMode}
          setSelectedFiles={setSelectedFiles}
          setViewMode={setViewMode}
          setOpenMenuFor={setOpenMenuFor}
          setReportingFile={setReportingFile}
          setShowReportModal={setShowReportModal}
          setMoveDestKey={setMoveDestKey}
          loadFiles={loadFiles}
          handleDisconnect={handleDisconnect}
          handleUpload={handleUpload}
          toggleFileSelection={toggleFileSelection}
          handleViewFile={handleViewFile}
          loadFilePreview={loadFilePreview}
          handleEditMetadata={handleEditMetadata}
          handleDownload={handleDownload}
          openShareSettings={openShareSettings}
          handleDelete={handleDelete}
          selectAllFiles={selectAllFiles}
          handleMoveToCloud={handleMoveToCloud}
          handleBulkDelete={handleBulkDelete}
        />
      )}

      {editingFile && (
        <FileStorageEditMetadataModal
          editForm={editForm}
          setEditForm={setEditForm}
          isLoading={isLoading}
          onSave={handleSaveMetadata}
          onClose={() => setEditingFile(null)}
        />
      )}

      {sharingFile && (
        <FileStorageShareSettingsModal
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
          onIndexerToggle={handleIndexerToggle}
          onSave={handleSaveShareSettings}
          onClose={closeShareSettings}
        />
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
            
            <FileStorageFileViewer 
              file={viewingFile} 
              previewUrl={filePreviewUrls.get(viewingFile.id) || null}
              fileMetadata={fileMetadataMap.get(viewingFile.id)}
              onClose={() => setViewingFile(null)} 
            />
          </div>
        </div>
      )}

      {/* Report Content Modal */}
      {reportingFile && (
        <ReportContentModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setReportingFile(null);
          }}
          file={reportingFile}
          authenticatedUser={authenticatedUser}
          accessToken={apiToken}
          onReportSubmitted={() => {
            // Refresh metadata to show updated report count
            if (reportingFile) {
              refreshMetadataInBackground(reportingFile, { forceSync: true });
            }
          }}
        />
      )}

    </div>
  );
};
