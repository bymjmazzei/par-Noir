/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState } from 'react';
import { AlertCircle, Lock, X, Cloud } from 'lucide-react';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { GoogleDriveBackend } from '../../services/storage/GoogleDriveBackend';
import { AggregatedFile, PublicMetadata, ShareToken } from '../../types/aggregator';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import { ReportContentModal } from './ReportContentModal';
import { ownerGet } from '../../services/ownerApiService';
import { getStoredToken, getStoredTokenForPn } from '../../services/parNoirOAuthInline';
import { MultiCloudStoragePanel } from './MultiCloudStoragePanel';
import {
  EMPTY_EDIT_FORM,
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
    getPasscodeFromSecureStorage,
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
        const res = await ownerGet(
          ownerToken,
          `/api/storage/accounts/${encodeURIComponent(cloudPnIdentifier)}`,
          { pnIdentifier: cloudPnIdentifier }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          accounts?: Array<{ provider: string; accountId: string; displayName?: string; isSocialCloud?: boolean }>;
        };
        const portable = (data.accounts ?? []).filter((a) => a.provider !== 'google_drive');
        const nextKey = JSON.stringify(
          portable.map((a) => [a.provider, a.accountId, a.displayName ?? '', a.isSocialCloud ? 1 : 0])
        );
        if (nextKey !== lastPortableAccountsKeyRef.current) {
          lastPortableAccountsKeyRef.current = nextKey;
          setPortableCloudAccounts(portable);
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
      // Coalesce burst READY events (migrate + ensureCloudSession + reconnect).
      if (debounceTimer != null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
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

  const totalFiles = files.length;
  const hasConnectedBackends =
    driveAccounts.length > 0 || portableCloudAccounts.length > 0;
  const connectedStorageCount = driveAccounts.length + portableCloudAccounts.length;

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
        <div className="bg-neutral-900/40 border border-neutral-700/60 border-dashed rounded-xl p-6 text-center">
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
