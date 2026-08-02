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
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, EncryptedFilePackage, FeedCategory } from '../../types/aggregator';
import type { CompanionMetadata } from '../../services/storage/GoogleDriveMetadataService';
import type { ThirdPartyIndexer, IndexingPermissions } from '../../types/indexers';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';
import { ReportContentModal } from './ReportContentModal';
import { API_ENDPOINT } from '../../config/api';
import { ownerFetch, ownerGet } from '../../services/ownerApiService';
import { getStoredToken, getStoredTokenForPn } from '../../services/parNoirOAuthInline';
import { getGoogleDriveClientId } from '../../config/googleDriveClientId';
import { persistDriveAccounts } from './storageHelpers';
import { MultiCloudStoragePanel } from './MultiCloudStoragePanel';
import {
  DRIVE_ACCOUNTS_STORAGE_KEY,
  METADATA_SYNC_MIN_INTERVAL_MS,
  INDEXER_CACHE_TTL_MS,
  isDesktopShell,
  EMPTY_EDIT_FORM,
  type DesktopUnlockPayload,
  type DesktopLockPayload,
  type DriveAccountState,
  type FileStorageAggregatorProps,
  type EditFormState,
} from './FileStorageAggregatorTypes';
import { isImageFile, isVideoFile } from './FileStorageAggregatorHelpers';
import { FileStorageFileViewer } from './FileStorageFileViewer';
import { FileStorageEditMetadataModal } from './FileStorageEditMetadataModal';
import { FileStorageShareSettingsModal } from './FileStorageShareSettingsModal';
import { SecureFolderSection } from './SecureFolderSection';
import { DriveFilesListSection } from './DriveFilesListSection';
import { useDriveLayoutInit } from './hooks/useDriveLayoutInit';
import { useDriveStorageCredentials } from './hooks/useDriveStorageCredentials';
import { useLoadAggregatedFiles } from './hooks/useLoadAggregatedFiles';

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
  const previewRetryCounts = React.useRef<Map<string, number>>(new Map());
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
  const [sharingFile, setSharingFile] = useState<AggregatedFile | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'private'>('private');
  const [shareNSFW, setShareNSFW] = useState<boolean>(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [reportingFile, setReportingFile] = useState<AggregatedFile | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [thirdPartyIndexers, setThirdPartyIndexers] = useState<ThirdPartyIndexer[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [indexingPermissionsState, setIndexingPermissionsState] = useState<IndexingPermissions | null>(null);
  const [isLoadingIndexers, setIsLoadingIndexers] = useState(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);
  const thirdPartyIndexersCacheRef = React.useRef<{
    identity: string | null;
    indexers: ThirdPartyIndexer[];
    fetchedAt: number;
  } | null>(null);
  const metadataRefreshStateRef = React.useRef<{
    lastSyncAt: number;
    inFlight: Promise<void> | null;
  }>({
    lastSyncAt: 0,
    inFlight: null
  });

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
  
  const resolveShareVisibility = React.useCallback(
    (file: AggregatedFile): 'public' | 'private' => {
      const metadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);

      if (metadata) {
        if (metadata.isPublic === true) {
          return 'public';
        }
        if (metadata.isPublic === false) {
          return 'private';
        }
        if ((metadata as any).visibility === 'public') {
          return 'public';
        }
        if ((metadata as any).publicToken) {
          return 'public';
        }
      }

      const cacheKeyPrimary = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
      const cacheKeyFallback = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.id);
      if (shareTokenCache.current.has(cacheKeyPrimary) || shareTokenCache.current.has(cacheKeyFallback)) {
        return 'public';
      }

      if ((file as any).visibility === 'public') {
        return 'public';
      }

      return 'private';
    },
    [fileMetadataMap]
  );

  const deriveIndexingPermissions = React.useCallback(
    (metadata?: PublicMetadata | null): IndexingPermissions => {
      const permissions = metadata?.indexingPermissions;
      if (!permissions) {
        return {
          mode: 'all',
          blocked: []
        };
      }
      return {
        mode: permissions.mode || 'all',
        allowed: permissions.allowed ? [...permissions.allowed] : permissions.allowed,
        blocked: permissions.blocked ? [...permissions.blocked] : [],
        updatedAt: permissions.updatedAt
      };
    },
    []
  );

  const computeTogglesFromPermissions = React.useCallback(
    (indexers: ThirdPartyIndexer[], permissions: IndexingPermissions): Record<string, boolean> => {
      const blocked = new Set(permissions.blocked || []);
      const allowed = new Set(permissions.allowed || []);
      return indexers.reduce<Record<string, boolean>>((acc, indexer) => {
        let enabled = true;
        if (permissions.mode === 'none') {
          enabled = false;
        } else if (permissions.mode === 'custom') {
          if (allowed.size > 0) {
            enabled = allowed.has(indexer.id);
          } else {
            enabled = !blocked.has(indexer.id);
          }
        } else {
          enabled = !blocked.has(indexer.id);
        }
        acc[indexer.id] = enabled;
        return acc;
      }, {});
    },
    []
  );

  const applyIndexersState = React.useCallback(
    (indexers: ThirdPartyIndexer[], metadata?: PublicMetadata | null) => {
      setThirdPartyIndexers(indexers);
      const basePermissions = deriveIndexingPermissions(metadata);
      setIndexingPermissionsState(basePermissions);
      const toggles = computeTogglesFromPermissions(indexers, basePermissions);
      setIndexerToggles(toggles);
    },
    [computeTogglesFromPermissions, deriveIndexingPermissions]
  );

  React.useEffect(() => {
    if (sharingFile) {
      setShareVisibility((prev) => {
        const computed = resolveShareVisibility(sharingFile);
        return prev === computed ? prev : computed;
      });
    }
  }, [sharingFile, fileMetadataMap, resolveShareVisibility]);

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

  const loadThirdPartyIndexers = React.useCallback(
    async (metadata?: PublicMetadata | null, options?: { force?: boolean }) => {
      // Inline identity derivation to avoid circular dependency
      const candidates = getStorageIdentityCandidates();
      const identity = candidates.length > 0 ? candidates[0] : null;
      const cacheEntry = thirdPartyIndexersCacheRef.current;
      const shouldUseCache =
        !options?.force &&
        cacheEntry &&
        cacheEntry.indexers.length > 0 &&
        cacheEntry.identity === (identity || null) &&
        Date.now() - cacheEntry.fetchedAt < INDEXER_CACHE_TTL_MS;

      if (shouldUseCache) {
        setIndexerError(null);
        applyIndexersState(cacheEntry.indexers, metadata);
        return;
      }

      setIsLoadingIndexers(true);
      setIndexerError(null);

      try {
        const endpoint = new URL(`${API_ENDPOINT}/api/third-party/indexers`);
        if (identity) {
          endpoint.searchParams.set('identity', identity);
        }

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(errorText || `Failed to load indexers (${response.status})`);
        }

        const payload = await response.json();
        const indexers: ThirdPartyIndexer[] = Array.isArray(payload.indexers) ? payload.indexers : [];
        thirdPartyIndexersCacheRef.current = {
          identity: identity || null,
          indexers,
          fetchedAt: Date.now()
        };
        applyIndexersState(indexers, metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load third-party indexers';
        console.error('❌ [ShareSettings] Failed to load third-party indexers:', error);
        setIndexerError(message);
        thirdPartyIndexersCacheRef.current = null;
      } finally {
        setIsLoadingIndexers(false);
      }
    },
    [API_ENDPOINT, applyIndexersState, resolvedAuth?.publicKey, authenticatedUser?.id, authenticatedUser?.publicKey]
    // SECURITY: Removed resolvedAuth?.pnName, authenticatedUser?.pnName - these are secrets
  );

  const refreshMetadataInBackground = React.useCallback(
    async (
      file: AggregatedFile,
      options?: {
        forceSync?: boolean;
        refreshIndexers?: boolean;
      }
    ) => {
      if (!metadataIndexService) {
        return;
      }

      if (metadataRefreshStateRef.current.inFlight && !options?.forceSync) {
        return metadataRefreshStateRef.current.inFlight;
      }

      const execute = async () => {
        try {
          await metadataIndexService.initialize();

          const now = Date.now();
          const shouldSync =
            options?.forceSync ||
            !metadataRefreshStateRef.current.lastSyncAt ||
            now - metadataRefreshStateRef.current.lastSyncAt > METADATA_SYNC_MIN_INTERVAL_MS;

          if (shouldSync) {
            const preferredDid =
              resolvedAuth?.publicKey
                ? resolvedAuth.publicKey.startsWith('did:')
                  ? resolvedAuth.publicKey
                  : `did:key:${resolvedAuth.publicKey}`
                : authenticatedUser?.id && authenticatedUser.id.startsWith('did:')
                  ? authenticatedUser.id
                  : undefined;

            // Dashboard reads metadata directly from Google Drive, not from aggregator API
            // The aggregator API is for browser app and third-party consumers
            // Skip syncFromCentralAggregator - dashboard should read companion metadata from Google Drive files
            metadataRefreshStateRef.current.lastSyncAt = Date.now();
          }

          const refreshedMetadata =
            (await metadataIndexService.getFileMetadata(file.id)) ||
            (file.backendFileId ? await metadataIndexService.getFileMetadata(file.backendFileId) : null);

          if (refreshedMetadata) {
            setFileMetadataMap((prev) => {
              const next = new Map(prev);
              const normalizedVisibility =
                refreshedMetadata.isPublic === true ||
                (refreshedMetadata as any).visibility === 'public' ||
                !!(refreshedMetadata as any).publicToken;
              const normalizedMetadata: PublicMetadata = {
                ...refreshedMetadata,
                isPublic: normalizedVisibility
                  ? true
                  : refreshedMetadata.isPublic === false
                    ? false
                    : refreshedMetadata.isPublic,
              };
              next.set(file.id, normalizedMetadata);
              if (file.backendFileId) {
                next.set(file.backendFileId, normalizedMetadata);
              }
              if (normalizedMetadata.fileId) {
                next.set(normalizedMetadata.fileId, normalizedMetadata);
              }
              if ((normalizedMetadata as any).backendFileId) {
                next.set((normalizedMetadata as any).backendFileId, normalizedMetadata);
              }
              return next;
            });

            await loadThirdPartyIndexers(
              refreshedMetadata,
              options?.refreshIndexers ? { force: true } : undefined
            );
        }
        } catch (centralSyncError) {
          console.warn('⚠️ [ShareSettings] Central metadata sync failed (non-blocking):', centralSyncError);
        } finally {
          metadataRefreshStateRef.current.inFlight = null;
        }
      };

      const run = execute();
      metadataRefreshStateRef.current.inFlight = run;
      return run;
    },
    [authenticatedUser?.id, loadThirdPartyIndexers, metadataIndexService, resolvedAuth?.publicKey]
  );

  const removeDriveAccount = React.useCallback((backendId: string) => {
    let nextActiveId: string | null = null;

    driveCredentialCacheRef.current.delete(backendId);

    setDriveAccounts((prev) => {
      const updated = prev.filter((account) => account.backendId !== backendId);
      persistDriveAccounts(updated);
      nextActiveId = updated.length > 0 ? updated[0].backendId : null;
      return updated;
    });

    setConnectedBackends((prev) => {
      const next = new Set(prev);
      next.delete(backendId);
      return next;
    });

    setUserEmails((prev) => {
      if (!prev.has(backendId)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(backendId);
      return next;
    });

    setFiles((prev) => prev.filter((file) => file.backend !== backendId));

    setFilePreviewUrls((prev) => {
      const next = new Map(prev);
      Array.from(next.keys()).forEach((key) => {
        if (key.startsWith(`${backendId}:`)) {
          next.delete(key);
        }
      });
      return next;
    });

    shareTokenCache.current.forEach((_value, key) => {
      if (key.startsWith(`${backendId}|`)) {
        shareTokenCache.current.delete(key);
      }
    });

    if (activeBackendId === backendId) {
      setActiveBackendId(nextActiveId);
    }
  }, [activeBackendId]);

  const fetchDriveUserInfo = React.useCallback(async (accessToken: string) => {
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.user) {
          return {
            email: data.user.emailAddress as string | undefined,
            name: data.user.displayName as string | undefined,
          };
        }
      }
    } catch (driveError) {
      console.warn('⚠️ [fetchDriveUserInfo] drive/v3/about failed, falling back', driveError);
    }

    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          email: data?.email as string | undefined,
          name: data?.name as string | undefined,
        };
      }
    } catch (oauthError) {
      console.warn('⚠️ [fetchDriveUserInfo] oauth2 userinfo failed', oauthError);
    }

    return { email: undefined, name: undefined };
  }, []);
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

  const openShareSettings = React.useCallback(
    (file: AggregatedFile) => {
      const initialVisibility = resolveShareVisibility(file);
      setShareVisibility(initialVisibility);
      setSharingFile(file);
      const existingMetadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
      
      // Initialize NSFW state from existing metadata
      const isNSFW = existingMetadata?.isNSFW === true || (existingMetadata as any)?.isNSFW === true;
      setShareNSFW(isNSFW);
      
      loadThirdPartyIndexers(existingMetadata);

      if (initialVisibility === 'private') {
        const metadata =
          fileMetadataMap.get(file.id) ||
          (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);

        if (!metadata || typeof metadata.isPublic !== 'boolean') {
          loadFileMetadata([file]).catch((metadataError) => {
            console.warn('⚠️ [ShareSettings] Unable to hydrate metadata before opening modal:', metadataError);
          });
        }
      }

      void refreshMetadataInBackground(file, {
        forceSync: !existingMetadata,
        refreshIndexers: !existingMetadata,
      });
    },
    [resolveShareVisibility, fileMetadataMap, loadFileMetadata, loadThirdPartyIndexers, refreshMetadataInBackground]
  );

  const closeShareSettings = React.useCallback(() => {
    setSharingFile(null);
    setShareVisibility('private');
    setShareNSFW(false);
    setThirdPartyIndexers([]);
    setIndexerToggles({});
    setIndexingPermissionsState(null);
    setIndexerError(null);
  }, []);

  const handleIndexerToggle = React.useCallback((indexerId: string) => {
    setIndexerToggles((prev) => {
      const next = { ...prev };
      next[indexerId] = !prev[indexerId];
      return next;
    });
  }, []);

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

  const handleTogglePublic = async (file: AggregatedFile) => {
    try {
      requireDeviceCapability('drive.upload');
      if (!metadataIndexService) {
        setError('Metadata service not available');
        return;
      }

      await metadataIndexService.initialize();

      const existingMetadata =
        fileMetadataMap.get(file.id) ||
        (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
      const isCurrentlyPublic = existingMetadata?.isPublic || false;

      if (isCurrentlyPublic) {
        // Make private - remove from index
        await metadataIndexService.removeFromIndex(existingMetadata?.fileId || file.id);
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.delete(file.id);
          if (file.backendFileId) {
            next.delete(file.backendFileId);
          }
          if (existingMetadata?.fileId && existingMetadata.fileId !== file.id) {
            next.delete(existingMetadata.fileId);
          }
          return next;
        });
      } else {
        // Make public - create metadata and index
        // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        if (!credentials?.pnName || !resolvedAuth?.publicKey) {
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

        // CRITICAL: If this is a thought file and we don't have content, load it from Google Drive
        const thoughtFileName = fileTitle.toLowerCase();
        const isThoughtFile = /^thought-\d+\.(thought|png)/i.test(thoughtFileName);
        const isTextFile = mimeCategory === 'text' || file.fileType === 'text' || file.fileType === 'thought';
        
        let existingTextPost = existingMetadata?.textPost || existingMetadata?.thought || (file as any).textPost || (file as any).thought;
        
        // If it's a thought file but we don't have content, load it from Google Drive
        if ((isThoughtFile || isTextFile) && !existingTextPost?.content) {
          try {
            console.log(`[handleTogglePublic] Loading thought content from Google Drive for ${file.id}...`);
            const backend = aggregatorService?.getBackend(file.backend);
            if (backend && backend.isConnected()) {
              const encryptedBlob = await backend.downloadFile(file.backendFileId);
              const encryptedPackageJson = await encryptedBlob.text();
              const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedPackageJson);
              
              // Decrypt the thought file
              const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              if (credentials && encryptionService) {
                const { decryptedBlob } = await encryptionService.decryptFileFromDownload(
                  encryptedPackage,
                  {
                    id: authenticatedUser?.id || resolvedAuth.publicKey,
                    publicKey: resolvedAuth.publicKey
                  }
                );
                const decryptedData = new Uint8Array(await decryptedBlob.arrayBuffer());
                
                const decryptedText = new TextDecoder().decode(decryptedData);
                const thoughtData = JSON.parse(decryptedText);
                
                if (thoughtData.textPost || thoughtData.thought) {
                  existingTextPost = thoughtData.textPost || thoughtData.thought;
                  console.log(`[handleTogglePublic] ✅ Loaded thought content from Google Drive`);
                }
              }
            }
          } catch (error) {
            console.warn(`[handleTogglePublic] Failed to load thought content from Google Drive:`, error);
            // Continue without content - user can manually fix later
          }
        }
        
        let existingThumbnailFileId = existingMetadata?.thumbnailFileId || null;
        
        const existingDescription = existingMetadata?.description || '';
        const existingKeywords = existingMetadata?.keywords || existingMetadata?.tags || [];
        const existingSubjects = existingMetadata?.subjects || [];
        const existingFeedCategories = existingMetadata?.feedCategories || [];
        
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
          description: existingDescription,
          keywords: existingKeywords,
          uploadDate: file.modifiedTime || new Date().toISOString(),
          fileType: mimeCategory,
          
          // CRITICAL: Always include textPost/thought (even if null) so backend can preserve/clear it
          textPost: existingTextPost || null,
          thought: existingTextPost || null,
          
          thumbnailFileId: existingThumbnailFileId ?? undefined,
          
          // Preserve subjects and feed categories
          ...(existingSubjects.length > 0 && { subjects: existingSubjects }),
          ...(existingFeedCategories.length > 0 && { feedCategories: existingFeedCategories }),
          
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
        const candidateKeys: string[] = [];
        if (file.backend) {
          candidateKeys.push(makeShareTokenCacheKey(file.backend, file.backendFileId));
          candidateKeys.push(makeShareTokenCacheKey(file.backend, file.id));
        }

        for (const key of candidateKeys) {
          const cached = shareTokenCache.current.get(key);
          if (cached) {
            shareToken = cached;
            break;
          }
        }

        if (!shareToken) {
          // Fallback to legacy cache keys (pre multi-account)
          shareToken = shareTokenCache.current.get(file.backendFileId) ||
            shareTokenCache.current.get(file.id) ||
            shareTokenCache.current.get((file as any).backendFile?.id);
        }

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
              const shareTokenKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
              shareTokenCache.current.set(shareTokenKey, shareToken);
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
        // Get pN identifier for metadata folder location (use VolumeIdGenerator for consistency)
        let metadataPnIdentifier: string | undefined = undefined;
        try {
          const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
          const sessionId = authenticatedUser?.id;
          const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          
          // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth or authenticatedUser (public)
          const publicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey;
          
          if (credentials?.pnName && credentials?.passcode && publicKey) {
            // Use VolumeIdGenerator for consistent identifier (same as folder naming)
            metadataPnIdentifier = await VolumeIdGenerator.generateVolumeId({
              pnName: credentials.pnName,
              passcode: credentials.passcode,
              publicKey: publicKey
            });
            console.log('📁 [Phase 3] Generated pN identifier (standardized):', (metadataPnIdentifier || '').substring(0, 8) + '...');
          } else {
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            console.warn('⚠️ [Phase 3] Cannot generate standardized pN identifier - credentials required:', {
              hasPnName: !!credentials?.pnName,
              hasPasscode: !!credentials?.passcode,
              hasPublicKey: !!publicKey,
              hasResolvedAuth: !!resolvedAuth,
              hasAuthenticatedUser: !!authenticatedUser
            });
            console.warn('⚠️ [Phase 3] Metadata indexing skipped - credentials must be available');
          }
        } catch (err) {
          console.warn('Failed to generate pN identifier for metadata folder:', err);
        }

        // OPTIMIZATION: Run API metadata operations in parallel
        // POST and PUT are independent and can execute simultaneously
        const targetFileId = publicMetadata.fileId || file.backendFileId || file.id;
        console.log('📤 [Phase 3] Submitting metadata to index (parallel operations)...', {
          fileId: file.id,
          targetFileId,
          hasToken: !!publicMetadata.publicToken,
          tokenLength: publicMetadata.publicToken?.length || 0
        });
        
        const { retry: retryHelper } = await import('../../utils/helpers');
        
        // Run POST and PUT in parallel - they're independent operations
        const [indexResult, putResult] = await Promise.allSettled([
          // POST to submit metadata
          metadataIndexService.indexFile(file, publicMetadata, metadataPnIdentifier),
          // PUT to explicitly update isPublic (ensures database is updated even if POST didn't properly update existing entry)
          retryHelper(
            async () => {
              const res = await fetch(
                `${API_ENDPOINT}/api/aggregator/metadata-index/${encodeURIComponent(targetFileId)}${authenticatedUser?.accessToken ? `?accountId=${encodeURIComponent(file.backend || '')}` : ''}`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(authenticatedUser?.accessToken && {
                      'Authorization': `Bearer ${authenticatedUser.accessToken}`
                    })
                  },
                  body: JSON.stringify({
                    isPublic: publicMetadata.isPublic,
                    publicToken: publicMetadata.publicToken,
                    name: publicMetadata.name || file.name,
                    description: publicMetadata.description || '',
                    keywords: publicMetadata.keywords || [],
                    tags: publicMetadata.keywords || [],
                    fileType: publicMetadata.fileType || 'other',
                    uploadDate: publicMetadata.uploadDate || new Date().toISOString(),
                    subjects: publicMetadata.subjects || [],
                    // CRITICAL: Always include textPost/thought (even if null) so backend can preserve/clear it
                    textPost: publicMetadata.textPost ?? null,
                    thought: publicMetadata.thought ?? null,
                    // CRITICAL: Always include PDF slideshow data (even if null) so backend can preserve/clear it
                    thumbnailFileId: publicMetadata.thumbnailFileId ?? null,
                    feedCategories: publicMetadata.feedCategories || [],
                  }),
                }
              );

              // If 429, throw to trigger retry
              if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
                const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
                (error as any).status = 429;
                (error as any).retryAfter = delay;
                throw error;
              }

              // 202 = content pending copyright review (DMCA bot flagged; human review will decide)
              if (res.status === 202) {
                const data = await res.json().catch(() => ({}));
                setSuccessMessage(data.message || "Content is under copyright review. You'll be notified when it's decided. Check Services for status.");
                throw new Error('PENDING_REVIEW');
              }

              // 403 = e.g. account restricted (repeat infringer) or other denial
              if (res.status === 403) {
                const data = await res.json().catch(() => ({}));
                const msg = data.message || data.error || 'Request denied';
                setError(msg);
                throw new Error(msg);
              }

              if (!res.ok) {
                const errorText = await res.text().catch(() => res.statusText);
                throw new Error(`PUT failed: ${res.status} - ${errorText}`);
              }

              return res;
            },
            3, // maxAttempts
            2000 // baseDelay (2 seconds)
          )
        ]);
        
        // Log results
        if (indexResult.status === 'fulfilled') {
          console.log('✅ [Phase 3] Metadata indexed with token');
        } else {
          console.error('❌ [Phase 3] Failed to index metadata:', indexResult.reason);
        }
        
        if (putResult.status === 'fulfilled') {
          const putResponse = putResult.value;
          const putData = await putResponse.json().catch(() => ({}));
          console.log('✅ [Phase 3] PUT endpoint updated isPublic successfully', putData);
        } else {
          const reason = putResult.reason as Error | undefined;
          if (reason?.message === 'PENDING_REVIEW') {
            // Content is pending copyright review; success message already set; do not continue to Drive index update
            await loadFileMetadata([file]);
            return;
          }
          console.error('❌ [Phase 3] Failed to update isPublic via PUT endpoint (non-critical):', putResult.reason);
        }

        // CRITICAL: Update Google Drive public index file when making file public
        // This ensures the file appears in the public index that the API syncs from
        console.log('🔍 [Phase 3] Checking if Google Drive public index update is needed...', {
          hasMetadataPnIdentifier: !!metadataPnIdentifier,
          metadataPnIdentifier: metadataPnIdentifier ? `${metadataPnIdentifier.substring(0, 8)}...` : null,
          hasBackend: !!file.backend,
          backend: file.backend,
          fileId: file.id,
          backendFileId: file.backendFileId
        });
        
        if (metadataPnIdentifier && file.backend) {
          try {
            const backend = aggregatorService?.getBackend(file.backend);
            console.log('🔍 [Phase 3] Backend lookup result:', {
              backendFound: !!backend,
              backendId: file.backend,
              isConnected: backend ? backend.isConnected() : false
            });
            
            if (backend && backend.isConnected()) {
              // Get access token from backend
              const accessToken = backend.getAccessToken?.();
              
              console.log('🔍 [Phase 3] Access token check:', {
                hasAccessToken: !!accessToken,
                tokenLength: accessToken ? accessToken.length : 0
              });
              
              if (accessToken) {
                const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
                
                // SIMPLIFIED: The API endpoint already creates Google Sheets companion metadata
                // We only need to update the public-file-index.json as a backup/cache
                // The database (updated via API) is the source of truth
                // CRITICAL: Ensure we use the actual Google Drive file ID for googleDriveFileId
                // file.backendFileId is the Google Drive file ID, file.id might be a composite ID
                const companionMetadata: CompanionMetadata = {
                  fileId: file.id,
                  googleDriveFileId: file.backendFileId || file.id,
                  fileName: file.name,
                  originalName: file.originalName || file.name.replace('.encrypted', ''),
                  mimeType: file.mimeType || 'application/octet-stream',
                  size: parseInt(String(file.size || 0), 10),
                  visibility: 'public',
                  uploadedAt: file.aggregatedAt || new Date().toISOString(),
                  owner: {
                    did: resolvedAuth?.publicKey ? (resolvedAuth.publicKey.startsWith('did:') ? resolvedAuth.publicKey : `did:key:${resolvedAuth.publicKey}`) : undefined,
                    identifier: metadataPnIdentifier
                  },
                  tags: publicMetadata.keywords || [],
                  description: publicMetadata.description || '',
                  publicToken: shareToken ? (typeof shareToken === 'string' ? shareToken : JSON.stringify(shareToken)) : undefined,
                  engagement: publicMetadata.engagement
                };
                
                console.log('📝 [Phase 3] Updating public index file (backup/cache only)...', {
                  fileId: companionMetadata.fileId,
                  googleDriveFileId: companionMetadata.googleDriveFileId,
                  fileName: companionMetadata.fileName,
                  visibility: companionMetadata.visibility
                });
                
                // Only update the public index file - API endpoint handles Google Sheets creation
                const publicIndexResult = await GoogleDriveMetadataService.updatePublicFileIndex(
                  accessToken,
                  metadataPnIdentifier,
                  companionMetadata
                ).catch(err => {
                  console.warn('⚠️ [Phase 3] Failed to update public index (non-critical, API is source of truth):', err);
                  return null;
                });
                
                if (publicIndexResult) {
                  console.log('✅ [Phase 3] Public index file updated successfully (backup/cache)');
                  setSuccessMessage('File made public!');
                }
              } else {
                console.warn('⚠️ [Phase 3] No access token available to update Google Drive public index');
                setError('Failed to update public index: No access token available');
              }
            } else {
              console.warn('⚠️ [Phase 3] Backend not connected - cannot update Google Drive public index', {
                backendFound: !!backend,
                isConnected: backend ? backend.isConnected() : false
              });
              setError('Failed to update public index: Backend not connected');
            }
          } catch (driveIndexError) {
            console.error('❌ [Phase 3] Failed to update Google Drive public index file:', driveIndexError);
            const errorMessage = driveIndexError instanceof Error ? driveIndexError.message : String(driveIndexError);
            console.error('❌ [Phase 3] Error details:', {
              message: errorMessage,
              stack: driveIndexError instanceof Error ? driveIndexError.stack : undefined
            });
            setError(`Failed to update public index: ${errorMessage}`);
            // Non-critical - API database is updated, but Google Drive index won't be in sync
            // The API sync service will eventually sync it, but user won't see it immediately
          }
        } else {
          console.warn('⚠️ [Phase 3] Missing pN identifier or backend - cannot update Google Drive public index', {
            hasMetadataPnIdentifier: !!metadataPnIdentifier,
            hasBackend: !!file.backend,
            metadataPnIdentifier: metadataPnIdentifier ? `${metadataPnIdentifier.substring(0, 8)}...` : null,
            backend: file.backend
          });
          setError('Failed to update public index: Missing pN identifier or backend');
        }

        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(file.id, publicMetadata);
          if (file.backendFileId && !next.has(file.backendFileId)) {
            next.set(file.backendFileId, publicMetadata);
          }
          if (publicMetadata.fileId && !next.has(publicMetadata.fileId)) {
            next.set(publicMetadata.fileId, publicMetadata);
          }
          return next;
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update file visibility';
      if (errorMessage === 'PENDING_REVIEW') {
        // Success message already set; do not overwrite with error
        return;
      }
      console.error('Failed to toggle public status:', err);
      setError(errorMessage);
    }
  };

  const handleSaveShareSettings = React.useCallback(async () => {
    if (!sharingFile) {
      return;
    }

    try {
      requireDeviceCapability('drive.upload');
      setIsSavingShare(true);
      const fileForRefresh = sharingFile;
      const existingMetadata =
        fileMetadataMap.get(sharingFile.id) ||
        (sharingFile.backendFileId ? fileMetadataMap.get(sharingFile.backendFileId) : undefined);
      const targetFileId = existingMetadata?.fileId || sharingFile.id;

      const isCurrentlyPublic = existingMetadata?.isPublic || false;
      const makePublic = shareVisibility === 'public';

      const blockedIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => !enabled)
        .map(([id]) => id);
      const enabledIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

      let nextPermissions: IndexingPermissions | null = null;
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

      if (makePublic !== isCurrentlyPublic) {
        await handleTogglePublic(sharingFile);
        await loadFileMetadata([sharingFile]);
      }

      // Update NSFW flag if it changed (only for public content)
      if (makePublic) {
        const currentNSFW = existingMetadata?.isNSFW === true;
        if (shareNSFW !== currentNSFW) {
          try {
            const response = await fetch(
              `${API_ENDPOINT}/api/aggregator/metadata-index`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(authenticatedUser?.accessToken && {
                    'Authorization': `Bearer ${authenticatedUser.accessToken}`
                  })
                },
                body: JSON.stringify({
                  fileId: targetFileId,
                  isNSFW: shareNSFW,
                  isPublic: true
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ [ShareSettings] Failed to update NSFW flag:', errorText);
            } else {
              // Update local metadata cache
              setFileMetadataMap((prev) => {
                const next = new Map(prev);
                const targets = new Set<string>();
                targets.add(sharingFile.id);
                targets.add(targetFileId);
                if (sharingFile.backendFileId) {
                  targets.add(sharingFile.backendFileId);
                }
                if (existingMetadata?.fileId) {
                  targets.add(existingMetadata.fileId);
                }

                targets.forEach((key) => {
                  const current = next.get(key);
                  if (current) {
                    next.set(key, {
                      ...current,
                      isNSFW: shareNSFW
                    });
                  }
                });

                return next;
              });
            }
          } catch (nsfwError) {
            console.error('❌ [ShareSettings] Failed to update NSFW flag:', nsfwError);
            // Don't throw - this is non-critical
          }
        }
      }

      if (makePublic && nextPermissions) {
        try {
          // Retry on 429 (rate limit) errors with exponential backoff
          const { retry: retryHelper } = await import('../../utils/helpers');
          
          const response = await retryHelper(
            async () => {
              const res = await fetch(
                `${API_ENDPOINT}/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    indexingPermissions: nextPermissions
                  })
                }
              );

              // If 429, throw to trigger retry
              if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After');
                const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
                const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
                (error as any).status = 429;
                (error as any).retryAfter = delay;
                throw error;
              }

              if (!res.ok) {
                const errorText = await res.text().catch(() => res.statusText);
                throw new Error(errorText || `Failed to update index visibility (${res.status})`);
              }

              return res;
            },
            3, // maxAttempts
            2000 // baseDelay (2 seconds)
          );
        } catch (apiError) {
          const message = apiError instanceof Error ? apiError.message : 'Failed to update index visibility';
          setIndexerError(message);
          console.error('❌ [Sharing] Failed to update third-party visibility via API:', apiError);
          throw apiError;
        }
      }

      if (nextPermissions) {
        setFileMetadataMap((prev) => {
          const next = new Map(prev);
          const targets = new Set<string>();
          targets.add(sharingFile.id);
          targets.add(targetFileId);
          if (sharingFile.backendFileId) {
            targets.add(sharingFile.backendFileId);
          }
          if (existingMetadata?.fileId) {
            targets.add(existingMetadata.fileId);
          }

          targets.forEach((key) => {
            const current = next.get(key);
            if (current) {
              next.set(key, {
                ...current,
                indexingPermissions: nextPermissions
              });
            }
          });

          return next;
        });
        setIndexingPermissionsState(nextPermissions);
      }

      void refreshMetadataInBackground(fileForRefresh, {
        forceSync: true,
        refreshIndexers: true,
      });

      closeShareSettings();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update sharing settings';
      setError(message);
      console.error('❌ [Sharing] Failed to update sharing settings:', error);
    } finally {
      setIsSavingShare(false);
    }
  }, [
    sharingFile,
    shareVisibility,
    shareNSFW,
    fileMetadataMap,
    indexerToggles,
    thirdPartyIndexers,
    indexingPermissionsState,
    handleTogglePublic,
    loadFileMetadata,
    API_ENDPOINT,
    authenticatedUser,
    closeShareSettings,
    refreshMetadataInBackground,
    requireDeviceCapability,
  ]);

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

  useEffect(() => {
    const handleTokenExpired = (event: Event) => {
      const detailBackendId = (event as CustomEvent)?.detail?.backendId as string | undefined;
      const targetBackendId = detailBackendId || activeBackendId;

      if (!targetBackendId) {
        return;
      }

      console.warn('Google Drive token expired - disconnecting', { backendId: targetBackendId });
      removeDriveAccount(targetBackendId);
      setError('Google Drive authentication expired. Please reconnect.');
    };

    window.addEventListener('google-drive-token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('google-drive-token-expired', handleTokenExpired);
    };
  }, [activeBackendId, removeDriveAccount]);

  // Helper function to exchange authorization code for tokens
  // Uses Google OAuth endpoint directly (client-side exchange) or API fallback
  const exchangeCodeForTokens = async (code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> => {
    const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID || (await getGoogleDriveClientId());
    if (!clientId || clientId.trim() === '') {
      throw new Error('Google Drive client ID not configured. Set VITE_GOOGLE_DRIVE_CLIENT_ID or configure GOOGLE_DRIVE_CLIENT_ID on the API.');
    }
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
      // Fallback to API endpoint with retry for transient network errors (e.g. ERR_SOCKET_NOT_CONNECTED)
      const maxAttempts = 3;
      const delays = [0, 1000, 2000];
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
        }
        try {
          const response = await fetch(`${API_ENDPOINT}/api/auth/google-oauth/token`, {
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
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          const isNetwork = lastError?.message === 'Failed to fetch' || lastError?.name === 'TypeError';
          if (isNetwork && attempt < maxAttempts - 1) {
            console.warn(`[Google OAuth] Token exchange attempt ${attempt + 1} failed (network), retrying...`, lastError?.message);
          } else {
            throw lastError;
          }
        }
      }
      throw lastError || new Error('Failed to exchange authorization code');
    }
  };

  const handleConnectGoogleDrive = async () => {
    try {
      if (!checkDeviceCapability('drive.upload')) {
        return;
      }
      setError(null);
      setDriveSetupProgress({
        phase: 'starting',
        stepLabel: 'Connecting to Google Drive…',
        percent: 0,
      });

      const clientId = await getGoogleDriveClientId();
      if (!clientId || clientId.trim() === '') {
        setError('Google Drive OAuth not configured. Set VITE_GOOGLE_DRIVE_CLIENT_ID or configure GOOGLE_DRIVE_CLIENT_ID on the API.');
        clearDriveSetupProgress();
        return;
      }
      // Google OAuth requires an exact redirect URI match with the configured callback.
      const redirectUri = `${window.location.origin}/oauth-callback.html`;
      const scope = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
      
      // Use authorization code flow to get refresh tokens
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `prompt=consent` +
        `&access_type=offline`; // Required for refresh token

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

          if (event.data.type === 'GOOGLE_OAUTH_CODE' || event.data.type === 'oauth_callback') {
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            // Avoid popup.close() from opener: COOP can block it and trigger console errors.
            // oauth-callback.html will try to close itself; user can close manually if it stays open.

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

      if (!aggregatorService) {
        throw new Error('File aggregator service is not available');
      }

      await aggregatorService.ensureInitialized();

      // Resolve user info so we can scope the backend to a specific account
    const oauthUserInfo = await fetchDriveUserInfo(token);
    const connectedEmail = oauthUserInfo?.email || null;
    const identifiers = resolveIdentifiersForEmail(connectedEmail);

      const backend = await upsertDriveAccount({
        backendId: identifiers.backendId,
        keyPrefix: identifiers.keyPrefix,
        token,
        refreshToken: tokenData.refreshToken,
        email: connectedEmail
      });

      if (!backend) {
        throw new Error('Unable to register Google Drive backend for this account');
      }

      setActiveBackendId(identifiers.backendId);

      // Resolve metadata auth inputs (pnName + passcode) so we can encrypt credentials
      const resolvedCredentials = getResolvedAuthCredentials();
      // SECURITY: pnName is a SECRET - only get from getResolvedAuthCredentials (which uses SecureCredentialManager)
      let metadataPnName = resolvedCredentials?.pnName || null;
      let metadataPasscode = resolvedCredentials?.passcode || null;
      if (!metadataPasscode) {
        try {
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          metadataPasscode = getPasscodeFromSecureStorage(sessionId);
        } catch (e) {
          metadataPasscode = null;
        }
      }

      if (!metadataPnName && authenticatedUser?.id && typeof authenticatedUser.id === 'string') {
        const idParts = authenticatedUser.id.split('-');
        if (idParts.length > 0 && idParts[0] !== 'did:key') {
          metadataPnName = idParts[0];
        }
      }

    const credentialsSnapshot = buildStorageCredentialPayload();
    let payloadForPersistence: any = credentialsSnapshot || null;

    // Save token and refresh token to encrypted pN metadata for persistence (optional)
    if (metadataPnName && metadataPasscode && authenticatedUser?.id && credentialsSnapshot) {
      try {
        const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
        const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');

        const existingMetadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);
        let baseCredentials: any = {};

        if (existingMetadata) {
          try {
            const decrypted = await SecureMetadataCrypto.decryptMetadata(
              existingMetadata,
              metadataPnName,
              metadataPasscode
            );
            baseCredentials = { ...(decrypted.storageCredentials || {}) };
          } catch (decryptError) {
            console.warn('⚠️ [handleConnectGoogleDrive] Failed to decrypt existing storage credentials:', decryptError);
          }
        }

        payloadForPersistence = {
          ...baseCredentials,
          googleDriveAccounts: credentialsSnapshot.googleDriveAccounts,
        };

        await SecureMetadataStorage.updateMetadataField(
          authenticatedUser.id,
          metadataPnName,
          metadataPasscode,
          'storageCredentials',
          payloadForPersistence
        );
        console.log('✅ [handleConnectGoogleDrive] Saved Google Drive account credentials to encrypted metadata');
      } catch (metadataError) {
        console.warn('⚠️ [handleConnectGoogleDrive] Failed to save token to metadata (non-critical):', metadataError);
        // Don't fail the connection if metadata save fails
      }
    } else {
      console.warn('ℹ️ [handleConnectGoogleDrive] Skipping secure metadata update; session passcode unavailable');
    }

    // CRITICAL: Persist immediately after connect - auto-persist is disabled
    // This ensures credentials are saved to API when user explicitly connects
    try {
      const payload = buildStorageCredentialPayload();
      if (payload && payload.googleDriveAccounts && payload.googleDriveAccounts.length > 0) {
        await persistStorageCredentialsToAPI(payload);
        console.log('✅ [handleConnectGoogleDrive] Credentials persisted to API after connection');
      }
    } catch (persistError) {
      console.warn('⚠️ [handleConnectGoogleDrive] Failed to persist credentials to API (non-critical):', persistError);
    }

      clearDriveSetupProgress();

      // loadFiles also triggered from persistStorageCredentialsToAPI after init
      void loadFiles();
      void loadStorageQuota();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Google Drive');
      clearDriveSetupProgress();
      console.error('Error connecting to Google Drive:', err);
    }
  };

  const handleDisconnect = async (backendId: string) => {
    try {
      if (!aggregatorService) {
        console.warn('⚠️ [handleDisconnect] Aggregator service unavailable');
        return;
      }
      
      // Find the account to get its email for metadata removal
      const accountToRemove = driveAccounts.find(acc => acc.backendId === backendId);
      const accountEmail = accountToRemove
        ? userEmails.get(accountToRemove.backendId) || null
        : null;
      
      const backend = aggregatorService.getBackend(backendId);
      if (backend) {
        // Disconnect the backend (clears tokens, folder cache, encrypted credentials)
        await backend.disconnect();
        console.log(`✅ [handleDisconnect] Backend ${backendId} disconnected`);
      }
      
      // CRITICAL: Mark disconnect timestamp and backendId to prevent immediate re-connection
      disconnectTimestampRef.current = Date.now();
      disconnectedBackendIdsRef.current.add(backendId);
      
      // Remove account from state FIRST (before updating API/metadata)
      // This ensures buildStorageCredentialPayload() excludes the removed account
      removeDriveAccount(backendId);
      console.log(`✅ [handleDisconnect] Account ${(backendId || '').substring(0, 8)}... removed from dashboard state and blocked for ${DISCONNECT_BLOCK_DURATION_MS}ms`);
      
      // Remove account from encrypted metadata storage
      // This prevents it from being restored after lock/unlock
      if (authenticatedUser?.id && accountEmail) {
        try {
          const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
          const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');
          
          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from state
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          const effectivePnName = credentials?.pnName || null;
          
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const passcode = getPasscodeFromSecureStorage(sessionId);
          
          if (effectivePnName && passcode) {
            // Sync from cloud first to get latest metadata
            try {
              await SecureMetadataStorage.syncMetadataFromCloud(authenticatedUser.id);
            } catch (cloudSyncError) {
              console.warn('⚠️ [handleDisconnect] Unable to sync metadata from cloud (non-blocking):', cloudSyncError);
            }
            
            let metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);
            
            if (!metadata) {
              try {
                metadata = await SecureMetadataStorage.getMetadataFromCloud(authenticatedUser.id);
              } catch (fallbackError) {
                console.warn('⚠️ [handleDisconnect] Fallback cloud fetch failed (non-blocking):', fallbackError);
              }
            }
            
            if (metadata) {
              // Decrypt metadata
              const decrypted = await SecureMetadataCrypto.decryptMetadata(metadata, effectivePnName, passcode);
              
              // Remove account from storageCredentials
              if (decrypted.storageCredentials) {
                const updatedCredentials = { ...decrypted.storageCredentials };
                
                // Handle googleDriveAccounts array
                if (Array.isArray(updatedCredentials.googleDriveAccounts)) {
                  const beforeCount = updatedCredentials.googleDriveAccounts.length;
                  updatedCredentials.googleDriveAccounts = updatedCredentials.googleDriveAccounts.filter(
                    (creds: any) => creds?.email?.toLowerCase() !== accountEmail.toLowerCase()
                  );
                  const afterCount = updatedCredentials.googleDriveAccounts.length;
                  if (beforeCount > afterCount) {
                    console.log(`✅ [handleDisconnect] Removed account from googleDriveAccounts array (${beforeCount} -> ${afterCount})`);
                  }
                }
                
                // Handle single googleDrive object (legacy format)
                if (updatedCredentials.googleDrive && 
                    typeof updatedCredentials.googleDrive === 'object' &&
                    !Array.isArray(updatedCredentials.googleDrive) &&
                    updatedCredentials.googleDrive.email?.toLowerCase() === accountEmail.toLowerCase()) {
                  // Remove the single googleDrive object
                  delete updatedCredentials.googleDrive;
                  console.log(`✅ [handleDisconnect] Removed account from googleDrive object`);
                }
                
                // Update encrypted metadata with removed account
                await SecureMetadataStorage.updateMetadataField(
                  authenticatedUser.id,
                  effectivePnName,
                  passcode,
                  'storageCredentials',
                  updatedCredentials
                );
                
                console.log(`✅ [handleDisconnect] Removed account [REDACTED] from encrypted metadata`);
              }
            }
          } else {
            console.warn('⚠️ [handleDisconnect] Missing pnName or passcode - cannot update encrypted metadata');
            console.warn('⚠️ [handleDisconnect] Will rely on API storage credentials update instead');
          }
        } catch (metadataError) {
          console.error('❌ [handleDisconnect] Failed to remove account from encrypted metadata:', metadataError);
          // Continue with API update even if metadata update fails
        }
      } else {
        console.warn('⚠️ [handleDisconnect] Missing authenticatedUser.id or accountEmail - skipping metadata removal');
      }
      
      // CRITICAL: Update API storage credentials to remove the account
      // This prevents it from being restored via hydrateStorageCredentialsFromAPI
      // We need to explicitly send the current state (without the removed account) to the API
      try {
        console.log('🔄 [handleDisconnect] Updating API storage credentials to remove account...');
        
        // CRITICAL: Clean up cache BEFORE building payload to ensure duplicates are removed
        cleanupDuplicateCacheEntries();
        
        // Build payload from current state (after removal)
        const payload = buildStorageCredentialPayload();
        
        // Even if payload is empty (no accounts left), we need to persist it to clear the API
        // This ensures the disconnected account is removed from API storage
        // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
        const identityCandidates = getStorageIdentityCandidates();
        const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;
        
        if (pnId) {
          const disconnectToken = resolveOwnerApiToken();
          if (disconnectToken) {
          try {
            const response = await ownerFetch(
              disconnectToken,
              'PUT',
              `/api/storage/credentials/${encodeURIComponent(pnId)}`,
              {
                credentials: payload || { googleDriveAccounts: [] },
                cid: null,
              }
            );
              
              if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.warn('⚠️ [handleDisconnect] Failed to update API storage credentials:', {
                  status: response.status,
                  error: errorText,
                });
              } else {
                const accountsCount = payload?.googleDriveAccounts?.length || 0;
                console.log(`✅ [handleDisconnect] API storage credentials updated (account removed). Current accounts: ${accountsCount}`);
              }
            } catch (apiError) {
              console.error('❌ [handleDisconnect] Failed to update API storage credentials:', apiError);
            }
          }
        } else {
          console.warn('⚠️ [handleDisconnect] No pn identifier available for API update');
        }
      } catch (apiError) {
        console.error('❌ [handleDisconnect] Failed to update API storage credentials:', apiError);
        // Non-critical - account is already removed from state
      }
    } catch (err) {
      console.error('❌ [handleDisconnect] Error disconnecting:', err);
      // Still try to remove from state even if backend.disconnect() fails
      removeDriveAccount(backendId);
      // Try to update API even on error
      try {
        const payload = buildStorageCredentialPayload();
        // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
        const identityCandidates = getStorageIdentityCandidates();
        const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;
        
        if (pnId) {
          const errToken = resolveOwnerApiToken();
          if (errToken) {
            await ownerFetch(errToken, 'PUT', `/api/storage/credentials/${encodeURIComponent(pnId)}`, {
              credentials: payload || { googleDriveAccounts: [] },
              cid: null,
            });
          }
        } else {
          console.warn('⚠️ [handleDisconnect] No pn identifier available for API update after error');
        }
      } catch (apiError) {
        console.error('❌ [handleDisconnect] Failed to update API after error:', apiError);
      }
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!checkDeviceCapability('drive.upload')) {
      event.target.value = '';
      return;
    }

    console.log('📤 [Upload] Starting upload...', { fileName: file.name, fileSize: file.size });

    const targetBackendIdAttr = event.target.dataset.backendId;
    const overrideBackendId = targetBackendIdAttr && typeof targetBackendIdAttr === 'string' ? targetBackendIdAttr : null;

    // Resolve auth credentials - try multiple sources
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // SECURITY: Get credentials from SecureCredentialManager (secrets)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // Try 1: Use credentials and resolvedAuth (public data)
    if (credentials?.pnName && resolvedAuth?.publicKey) {
      pnName = credentials.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = credentials.passcode || null;
      console.log('✅ [Upload] Using credentials and resolvedAuth');
    }
    
    // Try 2: Extract from authenticatedUser prop and credentials
    if (!pnName || !publicKey) {
      if (authenticatedUser && credentials) {
        pnName = credentials.pnName;
        publicKey = authenticatedUser.publicKey || 
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        passcodeToUse = credentials.passcode || null;
        console.log('✅ [Upload] Using authenticatedUser prop and credentials:', { pnName: !!pnName, publicKey: !!publicKey });
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
          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from session storage
          const sessionId = session.id || (session as any)?.publicKey || null;
          const sessionCredentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          pnName = sessionCredentials?.pnName || null;
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

    // Update resolvedAuth state for future use (only public data)
    if (!resolvedAuth || resolvedAuth.publicKey !== publicKey) {
      let sessionPasscode: string | null = passcodeToUse;
      if (!sessionPasscode) {
        try {
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          sessionPasscode = getPasscodeFromSecureStorage(sessionId);
        } catch (e) {
          sessionPasscode = null;
        }
      }
      // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      if (sessionId && pnName && sessionPasscode) {
        SecureCredentialManager.setCredentials(sessionId, pnName, sessionPasscode);
      }
      
      // SECURITY: Only store public data in resolvedAuth (no secrets)
      setResolvedAuth({
        publicKey: publicKey!,
      });
    } else {
      // Ensure credentials are stored if they exist
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (!credentials && passcodeToUse && pnName) {
        // Store credentials if we have them but they're not in SecureCredentialManager
        if (sessionId) {
          SecureCredentialManager.setCredentials(sessionId, pnName, passcodeToUse);
        }
      }
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

      if (!aggregatorService) {
        throw new Error('Storage service not available');
      }

      const portableBackendId = portableCloudAccounts[0]
        ? `${portableCloudAccounts[0].provider}::${portableCloudAccounts[0].accountId}`
        : null;
      const targetBackendId =
        overrideBackendId || activeBackendId || driveAccounts[0]?.backendId || portableBackendId;
      if (!targetBackendId) {
        throw new Error('No storage account connected');
      }

      const backend = aggregatorService.getBackend(targetBackendId);
      if (!backend || !backend.isConnected()) {
        throw new Error(`${targetBackendId} is not connected`);
      }

      // Get or create pN-specific folder using stable identifier
      // Use VolumeIdGenerator for consistency across all implementations (desktop, web, etc.)
      // Format: pn-{12-char-hex-hash} from pnName:passcode:publicKey
      let pnIdentifier: string;
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // SECURITY: Get pnName from credentials (secrets), not from resolvedAuth or authenticatedUser
        const pnName = credentials?.pnName || null;
        
        if (pnName && credentials?.passcode && publicKey) {
          // Use VolumeIdGenerator for consistent identifier (same as desktop app)
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode: credentials.passcode,
            publicKey
          });
          console.log(`✅ [Upload] Generated pN identifier (VolumeIdGenerator): ${(pnIdentifier || '').substring(0, 8)}...`);
          console.log(`📁 [Upload] Will use folder: "par Noir - ${(pnIdentifier || '').substring(0, 8)}..."`);
          
          // Also log the fallback identifier for comparison
          if (pnIdentifierRef.current) {
            // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
            const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
            console.log(`ℹ️ [Upload] Fallback identifier (did:publicKey): ${(fallbackId || '').substring(0, 8)}...`);
            if (fallbackId !== pnIdentifier) {
              console.warn(`⚠️ [Upload] Identifier mismatch! VolumeIdGenerator: ${(pnIdentifier || '').substring(0, 8)}..., Fallback: ${(fallbackId || '').substring(0, 8)}...`);
              console.warn(`⚠️ [Upload] Using VolumeIdGenerator identifier (${(pnIdentifier || '').substring(0, 8)}...) - this is the CORRECT one`);
            }
          }
        } else {
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            // If credentials aren't available, we cannot upload (identifier required)
            throw new Error('Cannot generate pN identifier: credentials (pnName, passcode, publicKey) required. Please ensure you are fully authenticated.');
        }
      } catch (err) {
        // STANDARDIZED: No fallbacks - fail if identifier cannot be generated
        console.error('❌ [Upload] Failed to generate standardized pN identifier:', err);
        throw new Error(`Cannot upload file: pN identifier generation failed. ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
      
      const folderId = await backend.getOrCreateFolder('par Noir', pnIdentifier);
      console.log(`📁 [Upload] Uploading to folder ID: ${folderId.substring(0, 12)}...`);

        // Upload encrypted file
        const encryptedFileName = `${packageData.metadata.originalName}.encrypted`;
        // Use File constructor with explicit reference to avoid minification issues
        const FileConstructor = globalThis.File || (typeof window !== 'undefined' ? window.File : File);
      const uploadedFile = await aggregatorService.uploadToBackend(
        targetBackendId,
          new FileConstructor([encryptedBlob], encryptedFileName, { type: 'application/json' }),
          folderId,
          { 
            fileName: encryptedFileName, 
            pnIdentifier,
          }
        );

        // Store share token in cache if generated (keyed by backend file ID for easy lookup)
        // Use uploadedFile.id as the cache key - this should match file.backendFileId when we look it up
        const cacheId = uploadedFile.id || uploadedFile.backendFileId;
        if (shareToken && cacheId) {
          const cacheKey = makeShareTokenCacheKey(targetBackendId, cacheId);
          shareTokenCache.current.set(cacheKey, shareToken);
          console.log('💾 [Upload] Share token cached for file:', cacheKey);
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
    
    // Extract genre (can be array or string)
    const genre = (metadata as any)?.genre || (metadata as any)?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');
    
    // Extract category (prefer feedCategories, fallback to category)
    const feedCategories = (metadata as any)?.feedCategories || [];
    const category = feedCategories.length > 0 ? feedCategories[0] : ((metadata as any)?.category || '');
    
    // Extract license (can be object with name or string)
    const license = (metadata as any)?.license || (metadata as any)?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '') || 'all-rights-reserved';
    
    setEditForm({
      name: metadata?.name || file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name,
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: category as FeedCategory | '',
      locationName: locationName,
      locationAddress: locationAddress,
      license: licenseString
    });
    setEditingFile(file);
  };

  const handleSaveMetadata = async () => {
    if (!editingFile) return;

    try {
      requireDeviceCapability('drive.upload');
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

      // Extract subjects from description, tags, and keywords
      const { extractSubjects } = await import('../../utils/subjectExtractor');
      const subjects = extractSubjects(
        editForm.description,
        tags,
        tags // keywords same as tags
      );

      // Validate required category
      if (!editForm.category) {
        setError('Category is required');
        setIsLoading(false);
        return;
      }

      // Build location object if provided (without lat/lng)
      let locationCreated = undefined;
      if (editForm.locationName || editForm.locationAddress) {
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
          })
        };
      }

      // Update via API endpoint
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }
      const metaPath = `/api/aggregator/metadata-index/${editingFile.id}`;
      const response = await ownerFetch(accessToken, 'PUT', metaPath, {
          name: editForm.name,
          description: editForm.description,
          keywords: tags,
          tags: tags,
          genre: genre.length > 0 ? genre : undefined,
          feedCategories: editForm.category ? [editForm.category as FeedCategory] : undefined,
          category: editForm.category || undefined,
          locationCreated: locationCreated,
          license: editForm.license || undefined,
          subjects: subjects.length > 0 ? subjects : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update metadata: ${errorText}`);
      }

      const updatedMetadata = await response.json();

      // Also update Google Drive metadata file if we have access
      const backend = aggregatorService?.getBackend(editingFile.backend);
      // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (backend && backend.isConnected() && credentials?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');
          
          if (token) {
            const publicKey = resolvedAuth?.publicKey;
            if (!publicKey) {
              throw new Error('Public identity key is required to update metadata');
            }
            // Generate stable pN identifier using VolumeIdGenerator for consistency
            let pnIdentifier: string | undefined;
            try {
              const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth (public)
              if (credentials?.pnName && credentials?.passcode) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: credentials.pnName,
                  passcode: credentials.passcode,
                  publicKey
                });
              }
            } catch (volumeIdError) {
              console.warn('⚠️ [UpdateMetadata] Failed to generate volume ID:', volumeIdError);
            }
            
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            if (!pnIdentifier) {
              console.warn('⚠️ [UpdateMetadata] Cannot generate standardized pN identifier - credentials required');
              console.warn('⚠️ [UpdateMetadata] Metadata update skipped - pN identifier required');
              return;
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
                  '@id': publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                  identifier: {
                    '@type': 'PropertyValue',
                    name: 'DID',
                    value: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`
                  }
                }
              } as PublicMetadata;
            }

            // Parse genre for companion metadata
            const genre = editForm.genre
              .split(',')
              .map(g => g.trim())
              .filter(g => g.length > 0);

            // Build location object for companion metadata (without lat/lng)
            let locationCreated = undefined;
            if (editForm.locationName || editForm.locationAddress) {
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
                })
              };
            }

            // Preserve existing schema metadata (static/auto-extracted fields)
            const existingSchema = (currentMetadata as any)?.schema || {};
            
            // Update companion metadata file
            const companionMetadata: CompanionMetadata = {
              fileId: editingFile.id,
              googleDriveFileId: editingFile.backendFileId,
              fileName: editingFile.name,
              originalName: editForm.name,
              mimeType: editingFile.mimeType || 'application/octet-stream',
              size: parseInt(editingFile.size?.toString() || '0', 10),
              visibility: currentMetadata.isPublic ? 'public' : 'private',
              uploadedAt: currentMetadata.uploadDate || new Date().toISOString(),
              owner: {
                did: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                identifier: pnIdentifier
              },
              tags: tags,
              description: editForm.description,
              metadata: {},
              publicToken: currentMetadata.publicToken,
              thumbnail:
                typeof currentMetadata.thumbnail === 'string'
                  ? currentMetadata.thumbnail
                  : currentMetadata.thumbnail?.['@id'],
              inReplyTo: currentMetadata.inReplyTo,
              repostOf: currentMetadata.repostOf,
              isPartOf: currentMetadata.isPartOf,
              indexingPermissions: currentMetadata.indexingPermissions,
              schema: {
                ...existingSchema, // Preserve auto-extracted technical metadata (width, height, duration, etc.)
                ...(genre.length > 0 && { genre }),
                ...(editForm.category && { category: editForm.category }),
                ...(editForm.category && { feedCategories: [editForm.category as FeedCategory] }),
                ...(locationCreated && { locationCreated }),
                ...(editForm.license && { license: editForm.license }),
                // Preserve existing NSFW value (managed via Share Settings)
                ...(currentMetadata.isNSFW !== undefined && { isNSFW: currentMetadata.isNSFW })
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
          const metadata = updatedMetadata.metadata;
          next.set(editingFile.id, metadata);
          if (editingFile.backendFileId && editingFile.backendFileId !== editingFile.id) {
            next.set(editingFile.backendFileId, metadata);
          }
          if (metadata.fileId && metadata.fileId !== editingFile.id) {
            next.set(metadata.fileId, metadata);
          }
          if (metadata.backendFileId && metadata.backendFileId !== editingFile.id) {
            next.set(metadata.backendFileId, metadata);
          }
          return next;
        });
      }

      // Refresh files to show updated metadata
      if (loadFilesRef.current) {
        loadFilesRef.current();
      }

      setEditingFile(null);
      setEditForm({ ...EMPTY_EDIT_FORM });
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

    // Load previews for images, videos, and PDFs - check mimeType and file extension
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = isImageFile(mimeType, fileName);
    const isVideo = isVideoFile(mimeType, fileName);
    if (!isImage && !isVideo) {
      return;
    }

    setLoadingPreviews(prev => new Set(prev).add(file.id));

    try {
      let previewUrl: string | null = null;

      // ---------- Attempt 1: Token-based preview (preferred) ----------
      const metadata = fileMetadataMap.get(file.id);
      let token: any = null;

      if (metadata?.publicToken) {
        token = typeof metadata.publicToken === 'string'
          ? JSON.parse(metadata.publicToken)
          : metadata.publicToken;
      }

      if (!token) {
        const cacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
        token = shareTokenCache.current.get(cacheKey);
      }

      if (!token) {
        const currentRetries = previewRetryCounts.current.get(file.id) || 0;
        if (currentRetries < 1) {
          console.log('🔁 [Preview] Share token missing, refreshing metadata once...', { fileId: file.id });
          previewRetryCounts.current.set(file.id, currentRetries + 1);
          try {
            await loadFileMetadata([file]);
          } catch (refreshError) {
            console.warn('⚠️ [Preview] Metadata refresh failed:', refreshError);
          }

          const refreshedMetadata = fileMetadataMap.get(file.id);
          if (refreshedMetadata?.publicToken) {
            token = typeof refreshedMetadata.publicToken === 'string'
              ? JSON.parse(refreshedMetadata.publicToken)
              : refreshedMetadata.publicToken;
          } else {
            const refreshedCacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
            token = shareTokenCache.current.get(refreshedCacheKey) || null;
          }
        }
      }

      if (token) {
        try {
          console.log('✅ [Preview] Token found, decrypting...', {
            fileId: file.id,
            fileName: file.name,
            hasShareKey: !!token.shareKey,
            hasShareEncrypted: !!token.shareEncrypted
          });

          const { decryptWithToken } = await import('../../utils/tokenDecryption');
          const decryptedBlob = await decryptWithToken(token);
          previewUrl = URL.createObjectURL(decryptedBlob);
          previewRetryCounts.current.delete(file.id);
        } catch (tokenError) {
          console.warn('⚠️ [Preview] Token-based decryption failed, will attempt owner fallback:', tokenError);
        }
      }

      // ---------- Attempt 2: Owner fallback (private files) ----------
      if (!previewUrl) {
        try {
          if (!aggregatorService || !encryptionService) {
            throw new Error('Aggregator or encryption service not available');
          }

          const sessionId = authenticatedUser?.id;
          let sessionPublicKey = resolvedAuth?.publicKey || authenticatedUser?.publicKey || (authenticatedUser?.id?.startsWith('did:key:') ? authenticatedUser.id : undefined);

          if (!sessionId || !sessionPublicKey) {
            // Try secure storage as last resort
            try {
              const { SecureStorage } = await import('../../utils/storage');
              const storage = new SecureStorage();
              await storage.init();
              const session = await storage.getCurrentSession();
              if (session) {
                if (!sessionPublicKey) {
                  sessionPublicKey = (session as any).publicKey || (session.id && session.id.startsWith('did:key:') ? session.id : undefined);
                }
              }
            } catch (storageError) {
              console.warn('⚠️ [Preview] Secure storage unavailable during fallback:', storageError);
            }
          }

          if (!sessionId || !sessionPublicKey) {
            throw new Error('Missing pN identity (id/publicKey) for owner decryption');
          }

          console.log('🔐 [Preview] Using owner fallback decryption...', {
            fileId: file.id,
            backendFileId: file.backendFileId,
            sessionId: sessionId.substring(0, 24) + '...',
            hasPublicKey: !!sessionPublicKey
          });

          const encryptedBlob = await aggregatorService.downloadFromBackend(
            file.backend,
            file.backendFileId
          );

          const encryptedPackageText = await encryptedBlob.text();
          const encryptedPackage = JSON.parse(encryptedPackageText);

          const session: AuthSession = {
            id: sessionId,
            publicKey: sessionPublicKey,
          };

          const { decryptedBlob, metadata } = await encryptionService.decryptFileFromDownload(
            encryptedPackage,
            session
          );

          previewUrl = URL.createObjectURL(decryptedBlob);
          previewRetryCounts.current.delete(file.id);

          // Cache metadata fields for future reference
          if (metadata?.publicToken) {
            try {
              const parsedToken = typeof metadata.publicToken === 'string'
                ? JSON.parse(metadata.publicToken)
                : metadata.publicToken;
              const fallbackCacheKey = makeShareTokenCacheKey(file.backend || activeBackendId || 'google_drive', file.backendFileId);
              shareTokenCache.current.set(fallbackCacheKey, parsedToken);
            } catch (cacheError) {
              console.warn('⚠️ [Preview] Unable to cache token from owner metadata:', cacheError);
            }
          }

          setFileMetadataMap(prev => {
            const next = new Map(prev);
            const lookupKeys = [
              file.id,
              file.backendFileId && file.backendFileId !== file.id ? file.backendFileId : null,
            ].filter(Boolean) as string[];
            if (metadata?.fileId && !lookupKeys.includes(metadata.fileId)) {
              lookupKeys.push(metadata.fileId);
            }
            if (metadata?.backendFileId && !lookupKeys.includes(metadata.backendFileId)) {
              lookupKeys.push(metadata.backendFileId);
            }
            const existingKey = lookupKeys.find((key) => next.has(key));
            const existing = existingKey ? next.get(existingKey)! : ({} as PublicMetadata);
            const merged: PublicMetadata = {
              ...existing,
              thumbnail: existing.thumbnail || metadata?.thumbnail,
              name: existing.name || metadata?.originalName || file.originalName || file.name,
              description: existing.description || metadata?.description,
              publicToken: metadata?.publicToken || existing.publicToken,
            };
            lookupKeys.forEach((key) => {
              next.set(key, merged);
            });
            return next;
          });

          console.log('✅ [Preview] Owner fallback decryption successful');
        } catch (ownerError) {
          console.error('❌ [Preview] Owner fallback failed:', ownerError);
        }
      }

      if (previewUrl) {
        setFilePreviewUrls(prev => {
          const next = new Map(prev);
          next.set(file.id, previewUrl!);
          return next;
        });
      } else {
        console.warn('⚠️ [Preview] Unable to generate preview for file after all attempts:', file.id);
        setLoadingPreviews(prev => {
          const next = new Set(prev);
          next.delete(file.id);
          return next;
        });
        return;
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
      if (filePreviewUrls.has(file.id)) {
        previewRetryCounts.current.delete(file.id);
      }
    }
  };


  // Auto-load previews for image/video files when files are loaded (since user owns them)
  useEffect(() => {
    if (files.length > 0) {
      console.log('🔄 [Auto-Preview] Checking files for auto-preview...', {
        fileCount: files.length,
        metadataMapSize: fileMetadataMap.size
      });
      // Load previews for all image/video/PDF files automatically (token-based, no credentials needed)
      files.forEach(file => {
        const mimeType = file.mimeType || '';
        const fileName = file.originalName || file.name || '';
        const isImage = isImageFile(mimeType, fileName);
        const isVideo = isVideoFile(mimeType, fileName);
        
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
    if (!aggregatorService) {
      console.error('⚠️ [Download] Aggregator service unavailable');
      setError('Storage service not available. Try reconnecting your drive.');
      return;
    }

    console.log('📥 [Download] Starting download...', { fileName: file.name, fileId: file.backendFileId });

    // Resolve auth credentials - try multiple sources (same as upload)
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // SECURITY: Get credentials from SecureCredentialManager (secrets)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // Try 1: Use credentials and resolvedAuth (public data)
    if (credentials?.pnName && resolvedAuth?.publicKey) {
      pnName = credentials.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = credentials.passcode || null;
      console.log('✅ [Download] Using credentials and resolvedAuth');
    }
    
    // Try 2: Extract from authenticatedUser prop and credentials
    if (!pnName || !publicKey) {
      if (authenticatedUser && credentials) {
        pnName = credentials.pnName;
        publicKey = authenticatedUser.publicKey || 
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        passcodeToUse = credentials.passcode || null;
        console.log('✅ [Download] Using authenticatedUser prop and credentials:', { pnName: !!pnName, publicKey: !!publicKey });
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
          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from session storage
          const sessionId = session.id || (session as any)?.publicKey || null;
          const sessionCredentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          pnName = sessionCredentials?.pnName || null;
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

  const handleSetProfileImage = async (file: AggregatedFile) => {
    if (!authenticatedUser?.id) {
      setError('Please unlock your pN first');
      return;
    }
    if (!checkDeviceCapability('profile.write')) return;

    // Check if file is an image
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = isImageFile(mimeType, fileName);
    
    if (!isImage) {
      setError('Only image files can be set as profile image');
      return;
    }

    // Get fileId from metadata if available, otherwise use file.id
    const metadata = fileMetadataMap.get(file.id) || 
                     (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
    const fileId = metadata?.fileId || file.id;

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const ownerPnId = (() => {
        const pk = authenticatedUser?.publicKey || authenticatedUser?.id;
        if (!pk) return null;
        return String(pk).startsWith('pn-') ? String(pk) : `pn-${pk}`;
      })();
      if (!ownerPnId) {
        throw new Error('Missing identity identifier');
      }

      const response = await ownerFetch(accessToken, 'POST', '/api/profile/image', {
        userPnIdentifier: ownerPnId,
        fileId: fileId,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to set profile image' }));
        throw new Error(error.error || 'Failed to set profile image');
      }

      console.log('✅ [Profile Image] Profile image updated successfully');
      // Could show success message here if there's a success handler
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set profile image';
      console.error('❌ [Profile Image] Failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setOpenMenuFor(null);
      actionMenuRef.current = null;
    }
  };

  const handleMoveToCloud = async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !moveDestKey) {
      setError('Select a destination cloud and unlock your identity.');
      return;
    }
    const sep = moveDestKey.indexOf('|||');
    if (sep < 0) return;
    const destProvider = moveDestKey.slice(0, sep);
    const destAccountId = moveDestKey.slice(sep + 3);
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        ownerToken,
        'POST',
        '/api/storage/migrate/files/start',
        {
          pnIdentifier: cloudPnIdentifier,
          fileIds,
          destProvider,
          destAccountId,
          mode: 'move'
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Move failed');
      }
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      setMoveDestKey('');
      await loadFiles();
      setSuccessMessage(`Moved ${fileIds.length} file(s) to ${destProvider}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async (backendId: string) => {
    if (!checkDeviceCapability('drive.upload')) return;

    const accountFiles = filesByBackend.get(backendId) || [];
    const filesToDelete = accountFiles.filter(file => selectedFiles.has(file.id));
    
    if (filesToDelete.length === 0) return;
    
    const fileCount = filesToDelete.length;
    if (!window.confirm(`Are you sure you want to delete ${fileCount} file${fileCount > 1 ? 's' : ''}? This action cannot be undone.`)) return;

    setIsLoading(true);
    setError(null);

    try {
      let successCount = 0;
      let failCount = 0;
      
      // Delete files sequentially
      for (const file of filesToDelete) {
        try {
          await handleDelete(file, true); // Skip confirmation for bulk delete
          successCount++;
        } catch (err: any) {
          failCount++;
          console.error(`[FileStorageAggregator] Error deleting file ${file.id}:`, err);
        }
      }

      // Clear selection and exit bulk delete mode
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      
      if (failCount > 0) {
        setError(`Deleted ${successCount} file${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete files');
      console.error('[FileStorageAggregator] Bulk delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Select all files in current backend
  const selectAllFiles = (backendId: string) => {
    const accountFiles = filesByBackend.get(backendId) || [];
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

  const handleDelete = async (file: AggregatedFile, skipConfirm: boolean = false) => {
    if (!file.backendFileId) {
      setError('Cannot delete file: missing file ID');
      return;
    }
    if (!checkDeviceCapability('drive.upload')) return;

    // Confirm deletion (skip confirmation if called from bulk delete)
    if (!skipConfirm) {
      const confirmed = window.confirm(`Are you sure you want to delete "${file.originalName || file.name}"? This action cannot be undone.`);
      if (!confirmed) {
        return;
      }
    }

    try {
      setIsLoading(true);
      setError(null);

      // Use backend directly to delete file (bypasses API token validation)
      const backend = aggregatorService?.getBackend(file.backend);
      if (!backend) {
        throw new Error(`Backend not found for ${file.backend}`);
      }

      if (!backend.isConnected()) {
        throw new Error('Backend is not connected');
      }

      console.log('🗑️ [Delete] Deleting file via API endpoint...', {
        fileId: file.backendFileId,
        fileName: file.name,
        backend: file.backend
      });

      // Use API endpoint for complete deletion (handles file, thumbnail, and metadata)
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const account = driveAccounts.find(acc => acc.backendId === file.backend);
      const accountId = account?.backendId;
      const accountIdParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';

      try {
        const deletePath = `/api/drive/files/${file.backendFileId}${accountIdParam}`;
        const response = await ownerFetch(accessToken, 'DELETE', deletePath);

        if (response.ok) {
          const result = await response.json().catch(() => ({}));
          console.log('✅ [Delete] File deleted successfully via API (includes file, thumbnail, and metadata)', result);
        } else if (response.status === 401) {
          // Token expired - try fallback to direct backend deletion
          console.warn('⚠️ [Delete] Token expired - attempting fallback to direct backend deletion...');
          try {
            await backend.deleteFile(file.backendFileId);
            console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');
            
            // Try to remove from database via metadata-index endpoint
            try {
              const metaPath = `/api/aggregator/metadata-index/${file.backendFileId}`;
              const dbResponse = await ownerFetch(accessToken, 'DELETE', metaPath);
              if (dbResponse.ok) {
                console.log('✅ [Delete] File removed from database via fallback endpoint');
              }
            } catch (fallbackError) {
              console.warn('⚠️ [Delete] Fallback database removal failed:', fallbackError);
            }
          } catch (backendError) {
            throw new Error(`Failed to delete file: ${backendError instanceof Error ? backendError.message : 'Unknown error'}`);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          // If API fails, try fallback to direct backend deletion
          console.warn(`⚠️ [Delete] API deletion failed (${response.status}): ${errorText} - attempting fallback...`);
          try {
            await backend.deleteFile(file.backendFileId);
            console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');
          } catch (backendError) {
            throw new Error(`Failed to delete file via API and fallback: ${errorText}`);
          }
        }
      } catch (apiError) {
        // If API call fails completely, try fallback to direct backend deletion
        console.warn('⚠️ [Delete] API deletion failed - attempting fallback to direct backend deletion:', apiError);
        try {
          await backend.deleteFile(file.backendFileId);
          console.log('✅ [Delete] File deleted from Google Drive via backend (fallback)');
        } catch (backendError) {
          throw new Error(`Failed to delete file: ${apiError instanceof Error ? apiError.message : 'API error'} and ${backendError instanceof Error ? backendError.message : 'backend error'}`);
        }
      }

      // Reload files after deletion
      if (loadFilesRef.current) {
        await loadFilesRef.current();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete file';
      console.error('❌ [Delete] Delete failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };



  const totalFiles = files.length;
  const hasConnectedBackends =
    driveAccounts.length > 0 || portableCloudAccounts.length > 0;
  const connectedStorageCount = driveAccounts.length + portableCloudAccounts.length;

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
