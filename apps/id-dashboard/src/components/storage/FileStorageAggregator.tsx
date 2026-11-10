/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState } from 'react';
import { AlertCircle, Lock, Cloud, Download, Edit, Flag, Minus, Plus, RefreshCw, Share2, Trash2 } from 'lucide-react';
import {
  OwnerFileExplorer,
  OwnerFileMenuItem,
  downloadFileName,
  openStoredBlob,
  type OwnerAccount,
  type OwnerExplorerSection,
  type OwnerFileRow,
} from '@par-noir/owner-files';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import {
  createDashboardOwnerFilesTransport,
  ownerRowToAggregatedFile,
} from '../../services/ownerFilesTransport';
import { publicKeyFromUnlockedUser } from '../../services/storageUnlockAuth';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { GoogleDriveBackend } from '../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../types/aggregator';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import { ReportContentModal } from './ReportContentModal';
import { getStoredToken, getStoredTokenForPn } from '../../services/parNoirOAuthInline';
import { MultiCloudStoragePanel } from './MultiCloudStoragePanel';
import {
  EMPTY_EDIT_FORM,
  GOOGLE_DRIVE_ICON_URL,
  type DriveAccountState,
  type FileStorageAggregatorProps,
  type EditFormState,
} from './FileStorageAggregatorTypes';
import { FileStorageEditMetadataModal } from './FileStorageEditMetadataModal';
import { FileStorageShareSettingsModal } from './FileStorageShareSettingsModal';
import { SecureFolderSection } from './SecureFolderSection';
import { DriveLayoutSetupProgress } from './DriveLayoutSetupProgress';
import { useDriveLayoutInit } from './hooks/useDriveLayoutInit';
import { useDriveStorageCredentials } from './hooks/useDriveStorageCredentials';
import { useStorageIdentity } from './hooks/useStorageIdentity';
import { useLoadFileMetadata } from './hooks/useLoadFileMetadata';
import { useLegacyDriveRestore } from './hooks/useLegacyDriveRestore';
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
  hasKeyedDevices = false,
  isKeyedSession = false,
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

  // Helper function to get Key 2 from SecureCredentialManager
  const getKey2FromSecureStorage = React.useCallback((sessionId: string | null | undefined): string | null => {
    if (!sessionId) return null;
    try {
      const credentials = SecureCredentialManager.getCredentials(sessionId);
      return credentials?.key2 || null;
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
  const loadFilesRef = React.useRef<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>(null);
  const loadStorageQuotaRef = React.useRef<(() => Promise<void>) | null>(null);
  const makeShareTokenCacheKey = React.useCallback((backendId: string, backendFileId: string) => `${backendId}|${backendFileId}`, []);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<OwnerFileRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const connectedBackendsRef = React.useRef(connectedBackends);
  connectedBackendsRef.current = connectedBackends;
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const userEmailsRef = React.useRef(userEmails);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccountState[]>([]);
  const driveAccountsRef = React.useRef(driveAccounts);
  driveAccountsRef.current = driveAccounts;
  const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, PublicMetadata>>(new Map());

  const [editingFile, setEditingFile] = useState<AggregatedFile | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({ ...EMPTY_EDIT_FORM });
  const [reportingFile, setReportingFile] = useState<AggregatedFile | null>(null);
  const [showReportModal, setShowReportModal] = useState<boolean>(false);

  React.useEffect(() => {
    userEmailsRef.current = userEmails;
  }, [userEmails]);

  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
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

  const {
    resolvedAuth,
    setResolvedAuth,
    resolvedAuthRef,
    authenticatedUserRef,
    pnIdentifierRef,
    cloudPnIdentifier,
    getPnIdentifier,
    getStorageIdentityCandidates,
  } = useStorageIdentity({
    authenticatedUser,
    setError,
    getKey2FromSecureStorage,
  });

  const [portableCloudAccounts, setPortableCloudAccounts] = React.useState<
    Array<{ provider: string; accountId: string; displayName?: string; isSocialCloud?: boolean }>
  >([]);
  const [moveDestKey, setMoveDestKey] = React.useState('');

  // Initialize services - useMemo to avoid re-initializing on every render
  const aggregatorService = React.useMemo(() => {
    try {
      return getFileAggregatorService();
    } catch (e) {
      console.error('Failed to initialize aggregator service:', e);
      return null;
    }
  }, []);

  const registerPortableCloudInFlightRef = React.useRef<Promise<void> | null>(null);
  const lastPortableAccountsKeyRef = React.useRef<string>('');

  const registerPortableCloudBackends = React.useCallback(async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !aggregatorService) return;
    if (registerPortableCloudInFlightRef.current) {
      await registerPortableCloudInFlightRef.current;
      return;
    }
    const run = (async () => {
      try {
        const { getStorageAccountsCached } = await import('../../services/dashboardSessionCache');
        const data = await getStorageAccountsCached(ownerToken, cloudPnIdentifier);
        const portable = (data.accounts ?? []).filter((a) => a.provider !== 'google_drive');
        const nextKey = JSON.stringify(
          portable.map((a) => [a.provider, a.accountId, a.displayName ?? '', a.isSocialCloud ? 1 : 0])
        );
        if (nextKey !== lastPortableAccountsKeyRef.current) {
          lastPortableAccountsKeyRef.current = nextKey;
          setPortableCloudAccounts(
            portable as Array<{
              provider: string;
              accountId: string;
              displayName?: string;
              isSocialCloud?: boolean;
            }>
          );
        }
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
          setConnectedBackends((prev) => {
            if (prev.has(backendId)) return prev;
            const next = new Set(prev);
            next.add(backendId);
            return next;
          });
        }
      } catch {
        /* non-fatal */
      } finally {
        registerPortableCloudInFlightRef.current = null;
      }
    })();
    registerPortableCloudInFlightRef.current = run;
    await run;
  }, [cloudPnIdentifier, resolveOwnerApiToken, aggregatorService]);

  React.useEffect(() => {
    void registerPortableCloudBackends();
  }, [registerPortableCloudBackends]);

  React.useEffect(() => {
    if (portableCloudAccounts.length === 0 || !loadFilesRef.current) return;
    void loadFilesRef.current();
  }, [portableCloudAccounts.length]);
  
  const getResolvedAuthCredentials = React.useCallback(() => {
    // SECURITY: Get Key 1 and Key 2 from SecureCredentialManager ONLY (secrets)
    // Never get Key 1 from resolvedAuth or authenticatedUser state - it's a SECRET
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // SECURITY: Key 1 is a SECRET - only get from SecureCredentialManager
    const key1 = credentials?.key1 || null;

    // Get publicKey from resolvedAuth or authenticatedUser (public data)
    let publicKey =
      resolvedAuth?.publicKey ||
      authenticatedUser?.publicKey ||
      (typeof authenticatedUser?.id === 'string' ? authenticatedUser.id : null) ||
      null;

    // SECURITY: Get Key 2 from SecureCredentialManager (secrets)
    const key2 = credentials?.key2 || null;

    if (!key1 || !publicKey) {
      return null;
    }

    return {
      key1,
      publicKey,
      key2: key2 || undefined,
    };
  }, [authenticatedUser, resolvedAuth]);
  
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
    getKey2FromSecureStorage,
    getPnIdentifier,
    getStorageIdentityCandidates,
    authenticatedUserRef,
    pnIdentifierRef,
    loadFilesRef,
    loadStorageQuotaRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
    hasKeyedDevices,
    isKeyedSession,
  });

  const hydrateStorageCredentialsFromAPIRef = React.useRef(hydrateStorageCredentialsFromAPI);
  hydrateStorageCredentialsFromAPIRef.current = hydrateStorageCredentialsFromAPI;
  const registerPortableCloudBackendsRef = React.useRef(registerPortableCloudBackends);
  registerPortableCloudBackendsRef.current = registerPortableCloudBackends;

  React.useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onReady = () => {
      // Coalesce burst READY events. Reconnect after disconnect must always hydrate —
      // do not skip when Drive backends briefly remain, and clear the disconnect guard
      // so intentional READY is not blocked for 10s.
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        disconnectTimestampRef.current = 0;
        disconnectedBackendIdsRef.current.clear();
        void hydrateStorageCredentialsFromAPIRef.current(true);
        void registerPortableCloudBackendsRef.current();
      }, 250);
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    return () => {
      window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
      if (debounceTimer != null) clearTimeout(debounceTimer);
    };
  }, []);

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

  const loadFileMetadata = useLoadFileMetadata({
    aggregatorService,
    authenticatedUser,
    resolvedAuth,
    metadataIndexService,
    resolveActiveBackendEntry,
    resolveOwnerApiToken,
    makeShareTokenCacheKey,
    setFileMetadataMap,
    shareTokenCache,
    pnIdentifierRef,
  });

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

  const ownerFilesTransport = React.useMemo(() => {
    if (!aggregatorService || !cloudPnIdentifier) return null;
    return createDashboardOwnerFilesTransport({
      aggregatorService,
      pnIdentifier: cloudPnIdentifier,
      resolveOwnerApiToken,
      ownerKey: () => {
        const user = authenticatedUserRef.current;
        const publicKey = resolvedAuthRef.current?.publicKey || publicKeyFromUnlockedUser(user);
        return user?.id && publicKey ? { id: user.id, publicKey } : null;
      },
      shareTokenCache: shareTokenCache.current,
      makeShareTokenCacheKey,
    });
  }, [aggregatorService, cloudPnIdentifier, resolveOwnerApiToken, makeShareTokenCacheKey]);

  const { loadFiles, loadStorageQuota } = useLoadAggregatedFiles({
    aggregatorService,
    transport: ownerFilesTransport,
    activeBackendId,
    setActiveBackendId,
    setRows,
    setError,
    setIsLoading,
    setFileMetadataMap,
    setStorageQuotas,
    setUserEmails,
    registerPortableCloudBackends,
    driveReadBlocked,
    deviceGate,
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

  // When layout init UI clears, ensure file load runs (covers the old one-shot defer miss).
  const wasDriveSetupActiveRef = React.useRef(false);
  React.useEffect(() => {
    if (showDriveSetupProgress) {
      wasDriveSetupActiveRef.current = true;
      return;
    }
    if (wasDriveSetupActiveRef.current) {
      wasDriveSetupActiveRef.current = false;
      void loadFiles();
      void loadStorageQuota();
    }
  }, [showDriveSetupProgress, loadFiles, loadStorageQuota]);

  const rowsByAccount = React.useMemo(() => {
    const map = new Map<string, OwnerFileRow[]>();
    rows.forEach((row) => {
      if (!map.has(row.accountKey)) map.set(row.accountKey, []);
      map.get(row.accountKey)!.push(row);
    });
    return map;
  }, [rows]);

  const filesByBackend = React.useMemo(() => {
    const map = new Map<string, AggregatedFile[]>();
    rowsByAccount.forEach((accountRows, accountKey) => {
      map.set(accountKey, accountRows.map(ownerRowToAggregatedFile));
    });
    return map;
  }, [rowsByAccount]);

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
    setRows,
    activeBackendId,
    setActiveBackendId,
    setError,
    setDriveSetupProgress,
    clearDriveSetupProgress,
    checkDeviceCapability,
    resolveOwnerApiToken,
    getResolvedAuthCredentials,
    getKey2FromSecureStorage,
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
    hasKeyedDevices,
    isKeyedSession,
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
    getKey2FromSecureStorage,
    makeShareTokenCacheKey,
    shareTokenCache,
    pnIdentifierRef,
    loadFiles,
  });

  const {
    handleEditMetadata,
    handleSaveMetadata,
    handleMoveToCloud,
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    handleDelete,
  } = useDriveFileActions({
    authenticatedUser,
    resolvedAuth,
    aggregatorService,
    driveAccounts,
    filesByBackend,
    fileMetadataMap,
    setFileMetadataMap,
    editingFile,
    setEditingFile,
    editForm,
    setEditForm,
    selectedFiles,
    setSelectedFiles,
    setIsBulkDeleteMode,
    setError,
    setSuccessMessage,
    setIsLoading,
    cloudPnIdentifier,
    moveDestKey,
    setMoveDestKey,
    checkDeviceCapability,
    requireDeviceCapability,
    resolveOwnerApiToken,
    loadFilesRef,
    loadFiles,
  });

  const handleDownload = async (row: OwnerFileRow, decrypted?: Blob) => {
    if (!ownerFilesTransport || row.origin === 'catalog' || !row.driveFileId) return;
    try {
      setError(null);
      const blob =
        decrypted ||
        (await openStoredBlob(ownerFilesTransport, {
          accountKey: row.accountKey,
          driveFileId: row.driveFileId,
          encrypted: row.encrypted,
          mimeType: row.mimeType,
        }));
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFileName(row);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? `Failed to download file: ${err.message}` : 'Failed to download file');
    }
  };


  useLegacyDriveRestore({
    aggregatorService,
    authenticatedUser,
    resolveIdentifiersForEmail,
    upsertDriveAccount,
    loadFiles,
    loadStorageQuota,
  });




  const [apiLayoutLinked, setApiLayoutLinked] = React.useState(false);
  const handleLayoutChange = React.useCallback(
    (info: { linked: boolean; socialCloudProvider: string | null; accountCount: number }) => {
      setApiLayoutLinked(info.linked);
    },
    []
  );

  const hasConnectedBackends =
    driveAccounts.length > 0 || portableCloudAccounts.length > 0;
  const connectedStorageCount = driveAccounts.length + portableCloudAccounts.length;

  const iconButton =
    'p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50';

  const accountSection = (
    account: OwnerAccount,
    icon: React.ReactNode,
    opts: { canDisconnect: boolean; extraLabel?: React.ReactNode }
  ): OwnerExplorerSection => {
    const backendId = account.accountKey;
    const accountRows = rowsByAccount.get(backendId) || [];
    const selectedCount = accountRows.filter((row) => selectedFiles.has(row.id)).length;
    const quota = storageQuotas.get(backendId);
    const percentUsed =
      quota && quota.totalBytes ? Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100)) : null;
    const allSelected = accountRows.length > 0 && selectedCount === accountRows.length;

    return {
      account,
      rows: accountRows,
      icon,
      loading: isLoading && rows.length === 0,
      emptyMessage: 'No files found for this account',
      headerActions: (
        <>
          {opts.extraLabel}
          {opts.canDisconnect && connectedBackends.has(backendId) && (
            <button onClick={() => handleDisconnect(backendId)} className="text-red-500 hover:text-red-600 text-sm">
              Disconnect
            </button>
          )}
          <button
            onClick={() => {
              setActiveBackendId(backendId);
              void loadFiles({ verifyWithDrive: true });
            }}
            disabled={isLoading || driveReadBlocked}
            className={iconButton}
            title={driveReadBlocked ? deviceGate?.blockedMessage : 'Refresh Files'}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <input
            type="file"
            data-backend-id={backendId}
            className="hidden"
            disabled={isLoading || driveUploadBlocked}
            onChange={handleUpload}
            ref={(el) => {
              if (el) fileInputRefs.current.set(backendId, el);
              else fileInputRefs.current.delete(backendId);
            }}
          />
          <button
            onClick={() => {
              if (driveUploadBlocked) {
                setError(deviceGate?.blockedMessage ?? null);
                return;
              }
              setActiveBackendId(backendId);
              fileInputRefs.current.get(backendId)?.click();
            }}
            disabled={isLoading || driveUploadBlocked}
            className={iconButton}
            title={driveUploadBlocked ? deviceGate?.blockedMessage : 'Upload File'}
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (isBulkDeleteMode) setSelectedFiles(new Set());
              setIsBulkDeleteMode(!isBulkDeleteMode);
            }}
            disabled={isLoading}
            className={iconButton}
            title={isBulkDeleteMode ? 'Cancel Bulk Delete' : 'Bulk Delete'}
          >
            <Minus className="h-4 w-4" />
          </button>
        </>
      ),
      banner: quota ? (
        <div className="flex items-center justify-between text-xs text-text-secondary bg-hover rounded-lg px-3 py-2">
          <span>
            Used {(quota.usedBytes / (1024 * 1024)).toFixed(1)} MB of {(quota.totalBytes / (1024 * 1024)).toFixed(1)} MB
          </span>
          <span>{percentUsed ?? 0}% full</span>
        </div>
      ) : undefined,
      body:
        showDriveSetupProgress && driveSetupProgress ? (
          <DriveLayoutSetupProgress progress={driveSetupProgress} />
        ) : undefined,
      footer: isBulkDeleteMode ? (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (allSelected) {
                  setSelectedFiles((prev) => {
                    const next = new Set(prev);
                    accountRows.forEach((row) => next.delete(row.id));
                    return next;
                  });
                } else {
                  selectAllFiles(backendId);
                }
              }}
              className="px-3 py-1.5 text-sm text-text-primary hover:bg-hover rounded transition-colors"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-text-secondary text-sm">
              {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={moveDestKey}
              onChange={(e) => setMoveDestKey(e.target.value)}
              className="text-sm bg-input-bg border border-input-border rounded px-2 py-1.5 text-text-primary"
              disabled={selectedCount === 0 || isLoading}
            >
              <option value="">Move to cloud…</option>
              {portableCloudAccounts.map((a) => (
                <option key={`${a.provider}|||${a.accountId}`} value={`${a.provider}|||${a.accountId}`}>
                  {a.displayName || a.provider}
                </option>
              ))}
            </select>
            <button
              onClick={handleMoveToCloud}
              disabled={selectedCount === 0 || !moveDestKey || isLoading}
              className="px-3 py-2 bg-violet-600 text-white rounded hover:bg-violet-500 text-sm disabled:opacity-50"
            >
              Move
            </button>
            <button
              onClick={() => handleBulkDelete(backendId)}
              disabled={selectedCount === 0 || isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedCount})
            </button>
          </div>
        </div>
      ) : undefined,
    };
  };

  const explorerSections: OwnerExplorerSection[] = [
    ...driveAccounts.map((account, index) => {
      const [provider, accountId = ''] = account.backendId.split('::');
      return accountSection(
        {
          accountKey: account.backendId,
          provider,
          accountId,
          label: userEmails.get(account.backendId) || `Drive ${index + 1}`,
        },
        <img src={GOOGLE_DRIVE_ICON_URL} alt="Google Drive" className="h-5 w-5" />,
        { canDisconnect: true }
      );
    }),
    ...portableCloudAccounts.map((acct) =>
      accountSection(
        {
          accountKey: `${acct.provider}::${acct.accountId}`,
          provider: acct.provider,
          accountId: acct.accountId,
          label: acct.displayName || acct.provider,
        },
        <Cloud className="h-5 w-5 text-text-secondary" />,
        {
          canDisconnect: false,
          extraLabel: acct.isSocialCloud ? (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/15 text-blue-500">Social cloud</span>
          ) : undefined,
        }
      )
    ),
  ];

  const renderRowMenu = (row: OwnerFileRow, close: () => void) => {
    const file = ownerRowToAggregatedFile(row);
    const rating = (fileMetadataMap.get(row.id) ?? row.metadata)?.contentRating;
    const run = (fn: () => void) => () => {
      close();
      fn();
    };
    return (
      <>
        {rating !== 'nsfw' && rating !== 'x-rated' && (
          <OwnerFileMenuItem
            icon={<Flag className="h-4 w-4" />}
            label="Report as NSFW"
            disabled={isLoading}
            onClick={run(() => {
              setReportingFile(file);
              setShowReportModal(true);
            })}
          />
        )}
        <OwnerFileMenuItem
          icon={<Edit className="h-4 w-4" />}
          label="Edit metadata"
          disabled={isLoading}
          onClick={run(() => handleEditMetadata(file))}
        />
        {row.origin !== 'catalog' && (
          <OwnerFileMenuItem
            icon={<Download className="h-4 w-4" />}
            label="Download"
            disabled={isLoading}
            onClick={run(() => void handleDownload(row))}
          />
        )}
        <OwnerFileMenuItem
          icon={<Share2 className="h-4 w-4" />}
          label="Share settings"
          disabled={isLoading}
          onClick={run(() => openShareSettings(file))}
        />
        <OwnerFileMenuItem
          icon={<Trash2 className="h-4 w-4" />}
          label="Delete"
          danger
          disabled={isLoading}
          onClick={run(() => void handleDelete(file))}
        />
      </>
    );
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <SecureFolderSection
        hideSecureFolderSection={hideSecureFolderSection}
      />

      <MultiCloudStoragePanel
        pnIdentifier={cloudPnIdentifier}
        authToken={apiToken ?? undefined}
        sessionId={authenticatedUser?.id ?? null}
        onConnectGoogleDrive={handleConnectGoogleDrive}
        onDisconnectGoogleDrive={async () => {
          const ids = driveAccounts.map((account) => account.backendId);
          if (ids.length === 0) {
            const sessionId = authenticatedUser?.id || authenticatedUser?.publicKey || null;
            const creds = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
            const token =
              (cloudPnIdentifier ? resolveOwnerApiToken(cloudPnIdentifier) : null) ||
              apiToken ||
              resolveOwnerApiToken();
            const { readShellMlKem } = await import('../../services/shellKeys');
            const { commitDashboardGoogleDriveDisconnect } = await import(
              '../../services/disconnectCloud'
            );
            await commitDashboardGoogleDriveDisconnect({
              pnIdentifier: cloudPnIdentifier || '',
              authToken: token || '',
              key1: creds?.key1,
              key2: creds?.key2,
              publicKey: authenticatedUser?.publicKey ?? sessionId,
              mlKemSecretKey:
                readShellMlKem(cloudPnIdentifier) ||
                readShellMlKem(sessionId) ||
                readShellMlKem(authenticatedUser?.publicKey),
            });
            return;
          }
          for (const id of ids) {
            await handleDisconnect(id);
          }
        }}
        googleDriveConnectedCount={driveAccounts.length}
        driveConnectDisabled={isLoading || showDriveSetupProgress}
        connectedStorageCount={connectedStorageCount}
        onLayoutChange={handleLayoutChange}
        onConnected={async () => {
          void hydrateStorageCredentialsFromAPI();
          await registerPortableCloudBackends();
          void loadFiles();
        }}
      />

      {!hasConnectedBackends && (
        <div className="bg-secondary border border-border border-dashed rounded-xl p-6 text-center">
          <Cloud className="h-10 w-10 text-text-secondary mx-auto mb-3" />
          <p className="text-text-primary font-medium mb-1">
            {apiLayoutLinked
              ? 'Linked — reconnect on this device'
              : 'No storage connected yet'}
          </p>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            {apiLayoutLinked
              ? 'This pN already has cloud storage linked. Reconnect above to sign in on this device and load files.'
              : 'Choose Google Drive, Dropbox, S3, Azure, OneDrive, or FTP above. One provider becomes your social cloud for tables and indexes; files can live on any connected account.'}
          </p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <span className="text-green-600 text-sm">{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="mt-2 text-xs text-green-600 hover:text-green-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="text-red-500 text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-500 hover:text-red-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {driveReadBlocked && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center space-x-2">
            <Lock className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-600 text-sm">{deviceGate?.blockedMessage}</span>
          </div>
        </div>
      )}

      {/* Auth Status Warning */}
      {!resolvedAuth && !error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-yellow-600 text-sm">
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
                    className="mt-2 text-xs text-yellow-600 hover:text-yellow-700 underline"
                  >
                    Debug: Check Session
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {hasConnectedBackends && ownerFilesTransport && (
        <OwnerFileExplorer
          transport={ownerFilesTransport}
          sections={explorerSections}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selection={{
            active: isBulkDeleteMode,
            selectedIds: selectedFiles,
            onToggle: (row) => toggleFileSelection(row.id),
          }}
          renderRowMenu={renderRowMenu}
          onDownload={(row, blob) => void handleDownload(row, blob)}
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
