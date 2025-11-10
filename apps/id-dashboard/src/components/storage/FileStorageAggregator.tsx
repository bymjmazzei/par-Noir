/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState, useEffect, useRef } from 'react';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, Info, X, Edit, Eye, Grid, List, Plus, Cloud, MoreVertical, Share2 } from 'lucide-react';
import { DesktopSecureFolderPanel } from './DesktopSecureFolderPanel';
import { getFileAggregatorService } from '../../services/aggregator/FileAggregatorService';
import { getEncryptionService } from '../../services/aggregator/EncryptionService';
import { getMetadataIndexService } from '../../services/metadata/MetadataIndexService';
import { GoogleDriveBackend } from '../../services/storage/GoogleDriveBackend';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken, EncryptedFilePackage } from '../../types/aggregator';
import type { CompanionMetadata } from '../../services/storage/GoogleDriveMetadataService';
import { AuthSession as CryptoAuthSession } from '../../types/crypto';
import GoogleDriveIconUrl from '../../assets/icons/google-drive-logo.png?url';
import type { ThirdPartyIndexer, IndexingPermissions } from '../../types/indexers';

const GOOGLE_DRIVE_ICON_URL = GoogleDriveIconUrl;
const DRIVE_ACCOUNTS_STORAGE_KEY = 'pn_google_drive_accounts';
const METADATA_SYNC_MIN_INTERVAL_MS = 90_000;
const INDEXER_CACHE_TTL_MS = 5 * 60 * 1000;

const isDesktopShell = typeof window !== 'undefined' && Boolean(window.parNoirDesktop);

type DesktopUnlockPayload = {
  pnName: string;
  publicKey: string;
  passcode: string;
};

function normalizeVisibility(value: any): 'public' | 'private' | 'friends' {
  if (value === 'public') {
    return 'public';
  }
  if (value === 'friends') {
    return 'friends';
  }
  return 'private';
}

interface DriveAccountState {
  backendId: string;
  keyPrefix: string;
  email: string | null;
}

type StoredDriveCredential = {
  backendId: string;
  keyPrefix: string;
  accessToken: string;
  refreshToken?: string | null;
  email?: string | null;
  connectedAt?: string;
  updatedAt?: string;
};

interface FileStorageAggregatorProps {
  authenticatedUser?: AuthSession | CryptoAuthSession | any | null;
  hideSecureFolderSection?: boolean;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ authenticatedUser, hideSecureFolderSection = false }) => {
  // Cache for share tokens (fileId -> shareToken) - generated during upload for quick access
  const shareTokenCache = React.useRef<Map<string, ShareToken>>(new Map());
  const previewRetryCounts = React.useRef<Map<string, number>>(new Map());
  const fileInputRefs = React.useRef<Map<string, HTMLInputElement | null>>(new Map());
  const driveCredentialCacheRef = React.useRef<Map<string, StoredDriveCredential>>(new Map());
  const hasRestoredFromMetadataRef = React.useRef<string | null>(null);
  const hasInitializedLegacyRef = React.useRef<boolean>(false);
  const loadFilesRef = React.useRef<(() => Promise<void>) | null>(null);
  const loadStorageQuotaRef = React.useRef<(() => Promise<void>) | null>(null);
  const makeShareTokenCacheKey = React.useCallback((backendId: string, backendFileId: string) => `${backendId}|${backendFileId}`, []);
  const apiEndpoint = React.useMemo(() => import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com', []);

  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<AggregatedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const userEmailsRef = React.useRef(userEmails);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccountState[]>([]);
  const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, PublicMetadata>>(new Map());
  const [resolvedAuth, setResolvedAuth] = useState<{ pnName: string; publicKey: string; passcode?: string } | null>(null);
  
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
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const actionMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [sharingFile, setSharingFile] = useState<AggregatedFile | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'private'>('private');
  const [isSavingShare, setIsSavingShare] = useState(false);
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
  const [filePreviewUrls, setFilePreviewUrls] = useState<Map<string, string>>(new Map()); // fileId -> decrypted blob URL
  const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());
  const isLoadingFilesRef = React.useRef(false);
  const lastIdentityLogRef = React.useRef<string | null>(null);
  const missingIdentityLogRef = React.useRef(false);
  const missingPnNameLogRef = React.useRef(false);
  const missingPasscodeLogRef = React.useRef(false);
  const hydrationAttemptedRef = React.useRef<Set<string>>(new Set());
  const hydrationMissingCandidatesRef = React.useRef<Set<string>>(new Set());
  const hydrationSuccessRef = React.useRef<string | null>(null);
  const hydrationRateLimitUntilRef = React.useRef<number | null>(null);
  const hydrationRateLimitLoggedRef = React.useRef(false);
  const hydrationRetryTimeoutRef = React.useRef<number | null>(null);
  const hydrationInProgressRef = React.useRef(false);
  const ownerIndexWarningLoggedRef = React.useRef<Set<string>>(new Set());
  const ownerIndexRetryCountsRef = React.useRef<Map<string, number>>(new Map());
  const rateLimitedBackendsRef = React.useRef<Set<string>>(new Set());
  const pendingRetryTimeoutRef = React.useRef<number | null>(null);

  const getStorageIdentityCandidates = React.useCallback(() => {
    const candidates: string[] = [];
    if (resolvedAuth?.publicKey) {
      candidates.push(resolvedAuth.publicKey);
    }
    if (typeof authenticatedUser?.publicKey === 'string') {
      candidates.push(authenticatedUser.publicKey);
    }
    if (typeof authenticatedUser?.id === 'string') {
      candidates.push(authenticatedUser.id);
    }
    if (typeof resolvedAuth?.pnName === 'string') {
      candidates.push(resolvedAuth.pnName);
    }
    if (typeof authenticatedUser?.pnName === 'string') {
      candidates.push(authenticatedUser.pnName);
    }
    if (typeof (authenticatedUser as any)?.username === 'string') {
      candidates.push((authenticatedUser as any).username);
    }
    return Array.from(new Set(candidates.filter((value) => value && value.trim().length > 0)));
  }, [authenticatedUser?.id, authenticatedUser?.pnName, authenticatedUser?.publicKey, resolvedAuth?.pnName, resolvedAuth?.publicKey]);

  const deriveIdentityKey = React.useCallback(() => {
    const candidates = getStorageIdentityCandidates();
    const identityKey = candidates.length > 0 ? candidates[0] : null;
    if (identityKey) {
      if (lastIdentityLogRef.current !== identityKey) {
        lastIdentityLogRef.current = identityKey;
        missingIdentityLogRef.current = false;
        console.debug('🆔 [StorageCredentials] Identity resolved', {
          candidates,
          chosen: identityKey,
        });
      }
      return identityKey;
    }
    if (!missingIdentityLogRef.current) {
      missingIdentityLogRef.current = true;
      console.warn('⚠️ [StorageCredentials] Unable to derive identity key', {
        hasAuthenticatedUserId: !!authenticatedUser?.id,
        hasAuthenticatedUserPublicKey: !!authenticatedUser?.publicKey,
        hasResolvedAuth: !!resolvedAuth,
        candidates,
      });
    }
    return null;
  }, [authenticatedUser?.id, authenticatedUser?.publicKey, getStorageIdentityCandidates, resolvedAuth]);

  // Initialize services - useMemo to avoid re-initializing on every render
  const aggregatorService = React.useMemo(() => {
    try {
      return getFileAggregatorService();
    } catch (e) {
      console.error('Failed to initialize aggregator service:', e);
      return null;
    }
  }, []);
  
  const getDriveAccountByBackendId = React.useCallback(
    (backendId: string | null | undefined) => {
      if (!backendId) {
        return null;
      }
      return driveAccounts.find((account) => account.backendId === backendId) || null;
    },
    [driveAccounts]
  );

  const scheduleTokenRetry = React.useCallback((backendIds: string[], options?: { delayMs?: number; resetAttempts?: boolean }) => {
    if (!backendIds.length) {
      return;
    }

    // Increment retry counts and determine delay (exponential backoff)
    const attempts: number[] = [];
    backendIds.forEach((backendId) => {
      if (options?.resetAttempts) {
        ownerIndexRetryCountsRef.current.set(backendId, 0);
      }
      const nextCount = (ownerIndexRetryCountsRef.current.get(backendId) || 0) + 1;
      ownerIndexRetryCountsRef.current.set(backendId, nextCount);
      attempts.push(nextCount);
    });

    const maxAttempts = Math.max(...attempts);
    const delay = options?.delayMs ?? Math.min(15000, 2000 * maxAttempts);

    if (maxAttempts >= 4 && !options?.delayMs) {
      console.warn('⚠️ [loadFiles] Giving up on owner index auto-refresh after repeated failures', {
        backendIds,
        attempts: attempts.reduce((acc, attempt, index) => {
          acc[backendIds[index]] = attempt;
          return acc;
        }, {} as Record<string, number>),
      });
      setError('Google Drive session expired. Please reconnect from the storage tab.');
      return;
    }

    if (pendingRetryTimeoutRef.current) {
      window.clearTimeout(pendingRetryTimeoutRef.current);
    }

    console.debug('⏳ [loadFiles] Scheduling token retry', {
      backendIds,
      attempts: attempts.reduce((acc, attempt, index) => {
        acc[backendIds[index]] = attempt;
        return acc;
      }, {} as Record<string, number>),
      delay,
    });

    pendingRetryTimeoutRef.current = window.setTimeout(() => {
      pendingRetryTimeoutRef.current = null;
      if (loadFilesRef.current) {
        loadFilesRef.current();
      }
    }, delay);
  }, []);

  React.useEffect(() => {
    const handleTokenRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ backendId?: string; accessToken?: string; refreshToken?: string | null; email?: string | null }>).detail;
      const backendId = detail?.backendId;

      if (!backendId) {
        ownerIndexRetryCountsRef.current.clear();
        rateLimitedBackendsRef.current.clear();
        if (loadFilesRef.current) {
          loadFilesRef.current();
        }
        return;
      }

      const existingCredential = driveCredentialCacheRef.current.get(backendId);
      const account = getDriveAccountByBackendId(backendId);
      const keyPrefix =
        account?.keyPrefix ||
        existingCredential?.keyPrefix ||
        `google_drive_${backendId.replace(/[^a-z0-9]+/gi, '-')}`;
      const resolvedEmail =
        detail?.email ??
        existingCredential?.email ??
        account?.email ??
        userEmailsRef.current.get(backendId) ??
        null;
      const connectedAt = existingCredential?.connectedAt || new Date().toISOString();
      const nowIso = new Date().toISOString();
      const nextAccessToken = detail?.accessToken ?? existingCredential?.accessToken ?? null;
      const nextRefreshToken = detail?.refreshToken ?? existingCredential?.refreshToken ?? null;

      if (nextAccessToken) {
        driveCredentialCacheRef.current.set(backendId, {
          backendId,
          keyPrefix,
          accessToken: nextAccessToken,
          refreshToken: nextRefreshToken,
          email: resolvedEmail,
          connectedAt,
          updatedAt: nowIso,
        });
      }

      const backendInstance =
        aggregatorService && typeof aggregatorService.getBackend === 'function'
          ? (aggregatorService.getBackend(backendId) as GoogleDriveBackend | null)
          : null;
      if (backendInstance && nextAccessToken) {
        void backendInstance
          .connect({
            token: nextAccessToken,
            refreshToken: nextRefreshToken ?? undefined,
            email: resolvedEmail ?? undefined,
          })
          .catch((connectError) => {
            console.warn('⚠️ [StorageCredentials] Failed to apply refreshed token to backend', connectError);
          });
      }

      if (resolvedEmail && nextAccessToken) {
        setDriveAccounts((prev) => {
          const normalized = resolvedEmail.toLowerCase();
          const emailIndex = prev.findIndex(
            (entry) => entry.email && entry.email.toLowerCase() === normalized
          );
          const backendIndex = prev.findIndex((entry) => entry.backendId === backendId);

          const next = [...prev];
          if (backendIndex >= 0) {
            next[backendIndex] = {
              ...next[backendIndex],
              email: resolvedEmail,
              keyPrefix,
            };
          } else if (emailIndex >= 0) {
            next[emailIndex] = {
              backendId,
              keyPrefix,
              email: resolvedEmail,
            };
          } else {
            next.push({ backendId, keyPrefix, email: resolvedEmail });
          }

          persistDriveAccounts(next);
          return next;
        });

        setUserEmails((prev) => {
          const next = new Map(prev);
          next.set(backendId, resolvedEmail);
          return next;
        });
      }

      persistStorageCredentialsToAPI(undefined).catch((persistError) => {
        console.warn('⚠️ [StorageCredentials] Failed to persist refreshed token snapshot:', persistError);
      });

      ownerIndexRetryCountsRef.current.delete(backendId);
      ownerIndexWarningLoggedRef.current.delete(backendId);
      rateLimitedBackendsRef.current.delete(backendId);

      if (loadFilesRef.current) {
        loadFilesRef.current();
      }
    };

    window.addEventListener('google-drive-token-refreshed', handleTokenRefreshed as EventListener);
    return () => {
      window.removeEventListener('google-drive-token-refreshed', handleTokenRefreshed as EventListener);
    };
  }, [aggregatorService, getDriveAccountByBackendId, persistDriveAccounts, persistStorageCredentialsToAPI]);

  React.useEffect(() => {
    return () => {
      ownerIndexWarningLoggedRef.current.clear();
      ownerIndexRetryCountsRef.current.clear();
      rateLimitedBackendsRef.current.clear();
      if (pendingRetryTimeoutRef.current) {
        window.clearTimeout(pendingRetryTimeoutRef.current);
        pendingRetryTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    const handleRateLimited = (event: Event) => {
      const detail = (event as CustomEvent<{ backendId?: string; retryAfterMs?: number }>).detail;
      const backendId = detail?.backendId;
      const retryAfterMs = detail?.retryAfterMs ?? 60000;

      if (backendId) {
        rateLimitedBackendsRef.current.add(backendId);
        scheduleTokenRetry([backendId], { delayMs: retryAfterMs, resetAttempts: true });
      } else if (rateLimitedBackendsRef.current.size > 0) {
        scheduleTokenRetry(Array.from(rateLimitedBackendsRef.current), { delayMs: retryAfterMs, resetAttempts: true });
      }

      setError('Google Drive rate limited requests. Retrying shortly...');
    };

    window.addEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    return () => {
      window.removeEventListener('google-drive-refresh-rate-limited', handleRateLimited as EventListener);
    };
  }, [scheduleTokenRetry]);
  
  const getResolvedAuthCredentials = React.useCallback(() => {
    let pnName =
      resolvedAuth?.pnName ||
      authenticatedUser?.pnName ||
      (authenticatedUser as any)?.username ||
      (authenticatedUser as any)?.name ||
      null;

    let publicKey =
      resolvedAuth?.publicKey ||
      authenticatedUser?.publicKey ||
      (typeof authenticatedUser?.id === 'string' ? authenticatedUser.id : null) ||
      null;

    if (!pnName && authenticatedUser?.id && typeof authenticatedUser.id === 'string') {
      const idParts = authenticatedUser.id.split('-');
      if (idParts.length > 0 && idParts[0] !== 'did:key') {
        pnName = idParts[0];
      }
    }

    let passcode = resolvedAuth?.passcode || null;
    if (!passcode) {
      try {
        passcode = sessionStorage.getItem('pn_session_passcode');
      } catch (e) {
        passcode = null;
      }
    }

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
    if (!resolvedAuth || resolvedAuth.passcode) {
      return;
    }
    try {
      const storedPasscode = sessionStorage.getItem('pn_session_passcode');
      if (storedPasscode) {
        setResolvedAuth((prev) => (prev ? { ...prev, passcode: storedPasscode } : prev));
      }
    } catch (e) {
      console.warn('⚠️ [FileStorageAggregator] Unable to hydrate passcode from session storage:', e);
    }
  }, [resolvedAuth]);
  
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
  
  const resolveIdentifiersForEmail = React.useCallback((email?: string | null) => {
    const normalizedEmail = email?.toLowerCase() || null;
    if (normalizedEmail) {
      const existing = driveAccounts.find((account) => account.email?.toLowerCase() === normalizedEmail);
      if (existing) {
        return { backendId: existing.backendId, keyPrefix: existing.keyPrefix, isNew: false };
      }
    }

    const safeBase = (normalizedEmail || `account-${Date.now().toString(36)}`).replace(/[^a-z0-9]+/g, '-');
    const uniqueSuffix = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10);
    const slug = `${safeBase}-${uniqueSuffix}`;
    return {
      backendId: `google_drive::${slug}`,
      keyPrefix: `google_drive_${slug}`,
      isNew: true
    };
  }, [driveAccounts]);

  const persistDriveAccounts = React.useCallback((accounts: DriveAccountState[]) => {
    try {
      localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch (storageError) {
      console.warn('⚠️ [DriveAccounts] Unable to persist drive accounts', storageError);
    }
  }, []);

  const buildStorageCredentialPayload = React.useCallback(() => {
    const entries = Array.from(driveCredentialCacheRef.current.values());
    if (entries.length === 0) {
      return null;
    }
    const now = new Date().toISOString();
    return {
      googleDriveAccounts: entries.map((entry) => ({
        backendId: entry.backendId,
        keyPrefix: entry.keyPrefix,
        accessToken: entry.accessToken,
        refreshToken: entry.refreshToken ?? null,
        email: entry.email ?? null,
        connectedAt: entry.connectedAt ?? now,
        updatedAt: now
      }))
    };
  }, []);

  const persistCredentialsToSecureMetadata = React.useCallback(
    async (payload: any) => {
      if (
        !payload ||
        !Array.isArray(payload.googleDriveAccounts) ||
        payload.googleDriveAccounts.length === 0 ||
        !authenticatedUser?.id
      ) {
        return;
      }

      const resolved = getResolvedAuthCredentials();
      let metadataPnName =
        resolved?.pnName ||
        authenticatedUser?.pnName ||
        (authenticatedUser as any)?.username ||
        (authenticatedUser as any)?.name ||
        null;

      let metadataPasscode = resolved?.passcode || null;
      if (!metadataPasscode) {
        try {
          metadataPasscode = sessionStorage.getItem('pn_session_passcode');
        } catch {
          metadataPasscode = null;
        }
      }

      if (!metadataPnName || !metadataPasscode) {
        return;
      }

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
            console.warn('⚠️ [StorageCredentials] Failed to decrypt secure metadata during refresh:', decryptError);
          }
        }

        const updatedCredentials = {
          ...baseCredentials,
          googleDriveAccounts: payload.googleDriveAccounts
        };

        await SecureMetadataStorage.updateMetadataField(
          authenticatedUser.id,
          metadataPnName,
          metadataPasscode,
          'storageCredentials',
          updatedCredentials
        );
      } catch (error) {
        console.warn('⚠️ [StorageCredentials] Unable to update secure metadata during refresh:', error);
      }
    },
    [authenticatedUser?.id, authenticatedUser?.pnName, getResolvedAuthCredentials]
  );

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
      const account = getDriveAccountByBackendId(backendId);
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
  }, [aggregatorService, activeBackendId, driveAccounts, getDriveAccountByBackendId]);

  const loadThirdPartyIndexers = React.useCallback(
    async (metadata?: PublicMetadata | null, options?: { force?: boolean }) => {
      const identity = deriveIdentityKey();
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
        const endpoint = new URL(`${apiEndpoint}/api/third-party/indexers`);
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
    [apiEndpoint, applyIndexersState, deriveIdentityKey]
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

            await metadataIndexService.syncFromCentralAggregator({
              authorDid: preferredDid,
              force: options?.forceSync,
            });
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

  const persistStorageCredentialsToAPI = React.useCallback(
    async (credentialsPayload?: any, cid?: string | null) => {
      let payload = credentialsPayload;
      if (!payload) {
        payload = buildStorageCredentialPayload();
      }

      if (
        !payload ||
        !Array.isArray(payload.googleDriveAccounts) ||
        payload.googleDriveAccounts.length === 0
      ) {
        console.warn('⚠️ [StorageCredentials] No Google Drive accounts available; skipping API persistence');
        return;
      }

      await persistCredentialsToSecureMetadata(payload);

      const identityCandidates = getStorageIdentityCandidates();

      if (identityCandidates.length === 0) {
        console.warn('⚠️ [StorageCredentials] No identity candidates available for persistence');
        return;
      }

      const seen = new Set<string>();
      for (const identityId of identityCandidates) {
        if (!identityId || seen.has(identityId)) {
          continue;
        }
        seen.add(identityId);

        try {
          console.warn('📤 [StorageCredentials] Persisting credentials to API...', {
            identityId,
            hasCid: !!cid,
          });

          const response = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(identityId)}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              credentials: payload,
              cid: cid ?? null,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn('⚠️ [StorageCredentials] Failed to persist credentials to API:', {
              identityId,
              status: response.status,
              error: errorText,
            });
          } else {
            console.warn('✅ [StorageCredentials] Credentials persisted to API', {
              identityId,
            });
          }
        } catch (error) {
          console.warn('⚠️ [StorageCredentials] API persistence failed (non-blocking):', {
            identityId,
            error,
          });
        }
      }
    },
    [apiEndpoint, buildStorageCredentialPayload, getStorageIdentityCandidates, persistCredentialsToSecureMetadata]
  );

  const upsertDriveAccount = React.useCallback(async (
    params: {
      backendId: string;
      keyPrefix: string;
      token: string;
      refreshToken?: string | null;
      email?: string | null;
      connectedAt?: string;
      updatedAt?: string;
    }
  ): Promise<GoogleDriveBackend | null> => {
        if (!aggregatorService) {
      console.warn('⚠️ [DriveAccounts] Aggregator service not ready');
      return null;
    }

    await aggregatorService.ensureInitialized();

    let backend = aggregatorService.getBackend(params.backendId) as GoogleDriveBackend | null;
    if (!backend) {
      backend = new GoogleDriveBackend({
        id: params.backendId,
        name: params.email || 'Google Drive',
        storageKeyPrefix: params.keyPrefix,
        apiEndpoint
      });
      aggregatorService.registerBackend(params.backendId, backend);
    }

    await backend.connect({
      token: params.token,
      refreshToken: params.refreshToken || undefined,
      email: params.email || undefined
    });

    const resolvedEmail = params.email || backend.getEmail() || null;

    setConnectedBackends((prev) => {
      const next = new Set(prev);
      next.add(params.backendId);
      return next;
    });

    const existingCredential = driveCredentialCacheRef.current.get(params.backendId);
    const nowIso = new Date().toISOString();

    driveCredentialCacheRef.current.set(params.backendId, {
      backendId: params.backendId,
      keyPrefix: params.keyPrefix,
      accessToken: params.token,
      refreshToken: params.refreshToken ?? existingCredential?.refreshToken ?? null,
      email: resolvedEmail ?? existingCredential?.email ?? null,
      connectedAt: params.connectedAt || existingCredential?.connectedAt || nowIso,
      updatedAt: params.updatedAt || nowIso
    });

    setUserEmails((prev) => {
      if (!resolvedEmail) {
        return prev;
      }
                    const next = new Map(prev);
      next.set(params.backendId, resolvedEmail);
                    return next;
                  });

    setDriveAccounts((prev) => {
      const existingIndex = prev.findIndex((account) => account.backendId === params.backendId);
      const updated: DriveAccountState[] = existingIndex >= 0 ? [...prev] : [...prev, { backendId: params.backendId, keyPrefix: params.keyPrefix, email: resolvedEmail }];
      if (existingIndex >= 0) {
        updated[existingIndex] = {
          backendId: params.backendId,
          keyPrefix: params.keyPrefix,
          email: resolvedEmail
        };
      }
      persistDriveAccounts(updated);
      return updated;
    });

    setActiveBackendId(params.backendId);

    return backend;
  }, [aggregatorService, activeBackendId, persistDriveAccounts, apiEndpoint]);

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
  }, [activeBackendId, persistDriveAccounts]);

  React.useEffect(() => {
    return () => {
      if (hydrationRetryTimeoutRef.current !== null) {
        window.clearTimeout(hydrationRetryTimeoutRef.current);
        hydrationRetryTimeoutRef.current = null;
      }
    };
  }, []);

  const hydrateStorageCredentialsFromAPI = React.useCallback(async () => {
    if (hydrationInProgressRef.current) {
      return;
    }
    hydrationInProgressRef.current = true;

    if (hydrationSuccessRef.current) {
      hydrationInProgressRef.current = false;
      return;
    }

    const now = Date.now();
    if (
      hydrationRateLimitUntilRef.current &&
      now < hydrationRateLimitUntilRef.current
    ) {
      if (!hydrationRateLimitLoggedRef.current) {
        hydrationRateLimitLoggedRef.current = true;
        console.debug('ℹ️ [StorageCredentials] Hydration paused due to recent rate limit', {
          nextAttemptInMs: hydrationRateLimitUntilRef.current - now,
        });
      }
      hydrationInProgressRef.current = false;
      return;
    }
    hydrationRateLimitLoggedRef.current = false;

    const identityCandidates = getStorageIdentityCandidates();

    if (identityCandidates.length === 0) {
      console.warn('⚠️ [StorageCredentials] No identity candidates available for hydration');
      return;
    }

    let hydrated = false;
    let lastError: unknown = null;

    for (const candidateId of identityCandidates) {
      if (hydrationSuccessRef.current) {
        break;
      }

      if (hydrationMissingCandidatesRef.current.has(candidateId)) {
        continue;
      }

      const hasAttempted = hydrationAttemptedRef.current.has(candidateId);
      hydrationAttemptedRef.current.add(candidateId);

      if (hasAttempted && !hydrationMissingCandidatesRef.current.has(candidateId)) {
        continue;
      }

      try {
        console.debug('📥 [StorageCredentials] Fetching credentials from API...', {
          candidateId,
          endpoint: apiEndpoint,
        });

        const response = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(candidateId)}`);
        if (response.status === 404) {
          hydrationMissingCandidatesRef.current.add(candidateId);
          console.debug('ℹ️ [StorageCredentials] No stored credentials found for identity (404)', {
            candidateId,
          });
          continue;
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 30000;
          hydrationRateLimitUntilRef.current = Date.now() + retryAfterMs;
          hydrationRateLimitLoggedRef.current = false;
          console.warn('⚠️ [StorageCredentials] API rate limited hydration; backing off', {
            candidateId,
            retryAfterMs,
          });
          if (hydrationRetryTimeoutRef.current !== null) {
            window.clearTimeout(hydrationRetryTimeoutRef.current);
          }
          hydrationRetryTimeoutRef.current = window.setTimeout(() => {
            hydrationRateLimitUntilRef.current = null;
            hydrationRateLimitLoggedRef.current = false;
            hydrationRetryTimeoutRef.current = null;
            hydrateStorageCredentialsFromAPI();
          }, retryAfterMs + 200);
          break;
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.warn('⚠️ [StorageCredentials] Failed to fetch credentials from API:', {
            candidateId,
            status: response.status,
            error: errorText,
          });
          continue;
        }

        const result = await response.json();
        const payload = result?.credentials;
        if (!payload) {
          console.warn('⚠️ [StorageCredentials] API returned no credentials payload', {
            candidateId,
            endpoint: `${apiEndpoint}/api/storage/credentials/${candidateId}`,
          });
          continue;
        }

        const storedAccounts =
          payload.googleDriveAccounts ||
          payload.googleDrive ||
          [];
        const accountsArray = Array.isArray(storedAccounts)
          ? storedAccounts
          : storedAccounts
            ? [storedAccounts]
            : [];

        if (accountsArray.length === 0) {
          console.warn('ℹ️ [StorageCredentials] Credentials payload contained no Google Drive accounts', {
            candidateId,
          });
          continue;
        }

        for (const account of accountsArray) {
          const token = account?.accessToken;
          if (!token) {
            continue;
          }
          const email = account?.email || null;
          const refreshToken = account?.refreshToken || null;
          const storedBackendId = typeof account?.backendId === 'string' ? account.backendId : null;
          const storedKeyPrefix = typeof account?.keyPrefix === 'string' ? account.keyPrefix : null;
          const identifiers = storedBackendId && storedKeyPrefix
            ? { backendId: storedBackendId, keyPrefix: storedKeyPrefix, isNew: false }
            : resolveIdentifiersForEmail(email);

          try {
            await upsertDriveAccount({
              backendId: identifiers.backendId,
              keyPrefix: identifiers.keyPrefix,
              token,
              refreshToken,
              email,
              connectedAt: account?.connectedAt,
              updatedAt: account?.updatedAt
            });
          } catch (upsertError) {
            console.warn('⚠️ [StorageCredentials] Failed to reconnect Google Drive account from API payload', {
              email,
              upsertError,
            });
          }
        }

        hydrated = true;
        hydrationSuccessRef.current = candidateId;
        hydrationMissingCandidatesRef.current.delete(candidateId);
        hydrationRateLimitUntilRef.current = null;
        hydrationRateLimitLoggedRef.current = false;
        if (hydrationRetryTimeoutRef.current !== null) {
          window.clearTimeout(hydrationRetryTimeoutRef.current);
          hydrationRetryTimeoutRef.current = null;
        }
        break;
      } catch (error) {
        lastError = error;
        console.warn('⚠️ [StorageCredentials] Candidate fetch failed (non-blocking):', {
          candidateId,
          error,
        });
      }
    }

    if (!hydrated && identityCandidates.length > 0 && lastError) {
      console.warn('⚠️ [StorageCredentials] No stored credentials available yet', {
        identityCandidates,
        lastError,
      });
    }

    hydrationInProgressRef.current = false;

    if (hydrated) {
      const loadFilesFn = loadFilesRef.current;
      if (loadFilesFn) {
        try {
          await loadFilesFn();
        } catch (loadErr) {
          console.warn('⚠️ [StorageCredentials] Failed to load files after hydration', loadErr);
        }
      }

      const loadStorageQuotaFn = loadStorageQuotaRef.current;
      if (loadStorageQuotaFn) {
        try {
          await loadStorageQuotaFn();
        } catch (quotaErr) {
          console.warn('⚠️ [StorageCredentials] Failed to load storage quota after hydration', quotaErr);
        }
      }
    }
  }, [apiEndpoint, getStorageIdentityCandidates, resolveIdentifiersForEmail, upsertDriveAccount]);

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

  // Load Google Drive token from encrypted metadata when user unlocks
  useEffect(() => {
    const loadTokenFromMetadata = async () => {
      const identityId = deriveIdentityKey();
      if (!authenticatedUser?.id || !identityId) {
        console.warn('⚠️ [loadTokenFromMetadata] Missing authenticated identity details', {
          hasAuthenticatedUser: !!authenticatedUser,
          hasId: !!authenticatedUser?.id,
          identityId,
        });
        return;
      }

      const effectivePnName =
        authenticatedUser?.pnName ||
        resolvedAuth?.pnName ||
        (authenticatedUser as any)?.username ||
        (authenticatedUser as any)?.name ||
        null;

      if (!effectivePnName) {
        if (!missingPnNameLogRef.current) {
          missingPnNameLogRef.current = true;
          console.debug('ℹ️ [loadTokenFromMetadata] No pnName available yet – deferring restore');
        }
        return;
      }
      missingPnNameLogRef.current = false;

      if (!aggregatorService) {
        return;
      }

      if (hasRestoredFromMetadataRef.current === authenticatedUser.id) {
        return;
      }

      try {
        const passcode = sessionStorage.getItem('pn_session_passcode');

        await hydrateStorageCredentialsFromAPI();

        const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
        const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');

        try {
          await SecureMetadataStorage.syncMetadataFromCloud(authenticatedUser.id);
        } catch (cloudSyncError) {
          console.warn('⚠️ [loadTokenFromMetadata] Unable to sync metadata from cloud (non-blocking):', cloudSyncError);
        }

        let metadata = await SecureMetadataStorage.getMetadata(authenticatedUser.id);

        if (!metadata) {
          try {
            metadata = await SecureMetadataStorage.getMetadataFromCloud(authenticatedUser.id);
          } catch (fallbackError) {
            console.warn('⚠️ [loadTokenFromMetadata] Fallback cloud fetch failed (non-blocking):', fallbackError);
          }
        }

        if (!metadata) {
          return;
        }

        if (!passcode) {
          if (!missingPasscodeLogRef.current) {
            missingPasscodeLogRef.current = true;
            console.debug('ℹ️ [loadTokenFromMetadata] Passcode not available yet – stored encrypted metadata for later');
          }
          return;
        }
        missingPasscodeLogRef.current = false;

        const decrypted = await SecureMetadataCrypto.decryptMetadata(metadata, effectivePnName, passcode);

        const storedCreds = decrypted.storageCredentials?.googleDriveAccounts || decrypted.storageCredentials?.googleDrive;
        const credsArray = Array.isArray(storedCreds) ? storedCreds : storedCreds ? [storedCreds] : [];

        if (decrypted.storageCredentials) {
          persistStorageCredentialsToAPI(decrypted.storageCredentials).catch((error) => {
            console.warn('⚠️ [StorageCredentials] Failed to persist during load (non-blocking):', error);
          });
        }

        for (const creds of credsArray) {
          const token = creds?.accessToken;
          if (!token) {
            continue;
          }

          const email = creds.email || null;
          const refreshToken = creds.refreshToken || null;
          const identifiers = resolveIdentifiersForEmail(email);

          const backend = await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
            token,
            refreshToken,
            email
          });

          if (backend) {
            try {
              await loadFiles();
            } catch (loadErr) {
              console.warn('⚠️ [loadTokenFromMetadata] Failed to load files for restored account', loadErr);
            }
          }
        }

        if (credsArray.length > 0) {
          await loadStorageQuota();
        }

        hasRestoredFromMetadataRef.current = authenticatedUser.id;
      } catch (error) {
        console.debug('Could not load token from metadata:', error);
        hasRestoredFromMetadataRef.current = null;
      }
    };

    loadTokenFromMetadata();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authenticatedUser?.id,
    authenticatedUser?.pnName,
    aggregatorService,
    hydrateStorageCredentialsFromAPI,
    persistStorageCredentialsToAPI,
    resolvedAuth?.publicKey,
    resolvedAuth?.pnName,
    resolvedAuth?.passcode,
  ]);

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
          setResolvedAuth((prev) => ({
            pnName,
            publicKey,
            passcode: passcode || prev?.passcode,
          }));
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
            setResolvedAuth((prev) => ({
              pnName,
              publicKey,
              passcode: passcode || prev?.passcode,
            }));
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

  React.useEffect(() => {
    if (resolvedAuth?.pnName && resolvedAuth.publicKey && resolvedAuth.passcode) {
      const payload = {
        pnName: resolvedAuth.pnName,
        publicKey: resolvedAuth.publicKey,
        passcode: resolvedAuth.passcode,
      };

      window.dispatchEvent(new CustomEvent('pn-auth-session', { detail: payload }));
    }
  }, [resolvedAuth]);

  const loadFileMetadata = React.useCallback(async (filesToLoad: AggregatedFile[]) => {
    try {
      console.log('📋 [Metadata] Loading file metadata...', { fileCount: filesToLoad.length });
      const { backend, backendId, keyPrefix } = resolveActiveBackendEntry();
      if (backend && backend.isConnected() && resolvedAuth?.pnName) {
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

            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(token, pnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(token, pnFolderId);
            const ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndex(token, metadataFolderId, pnIdentifier);

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

        await metadataIndexService.syncFromCentralAggregator({
          authorDid: preferredDid,
        });
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

  const loadFiles = React.useCallback(async () => {
    if (isLoadingFilesRef.current) {
      console.log('⏳ [loadFiles] Load already in progress, skipping');
      return;
    }
    isLoadingFilesRef.current = true;
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

      const backendEntries = typeof aggregatorService.listBackendEntries === 'function'
        ? aggregatorService.listBackendEntries()
        : [];
      const connectedEntries = backendEntries.filter(({ backend }) => backend.isConnected());

      if (connectedEntries.length === 0) {
        console.log('ℹ️ [loadFiles] No connected storage backends yet; skipping owner index load until connection completes', {
          backendEntries: backendEntries.map(({ id }) => id),
          connectedBackends: connectedEntries.map(({ id }) => id),
        });
        setFiles([]);
        setIsLoading(false);
        return;
      }

      if (!activeBackendId) {
        setActiveBackendId((prev) => prev || connectedEntries[0]?.id || null);
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

      const aggregatedAllFiles: AggregatedFile[] = [];
      const aggregatedMetadataMap = new Map<string, PublicMetadata>();
      const filesNeedingMetadata: AggregatedFile[] = [];
      const retryBackends = new Set<string>();

      for (const entry of connectedEntries) {
        const backendId = entry.id;
        const backend = entry.backend as GoogleDriveBackend;
        const keyPrefix =
          getDriveAccountByBackendId(backendId)?.keyPrefix ||
          (typeof backend.getStorageKeyPrefix === 'function' ? backend.getStorageKeyPrefix() : null);

        if (rateLimitedBackendsRef.current.has(backendId)) {
          console.debug('⏳ [loadFiles] Skipping backend during refresh cooldown', { backendId });
          continue;
        }

        if (!backend?.isConnected()) {
          console.debug('ℹ️ [loadFiles] Backend not connected yet; skipping for now', {
            backendId,
            keyPrefix,
          });
          continue;
        }

        let ensuredAccessToken: string | null = null;
        if (typeof (backend as any).ensureAccessToken === 'function') {
          try {
            ensuredAccessToken = await (backend as any).ensureAccessToken();
          } catch (ensureError) {
            console.warn('⚠️ [loadFiles] ensureAccessToken failed (non-blocking):', {
              backendId,
              error: ensureError,
            });
          }
        }

        const localTokenKey = keyPrefix
          ? `${keyPrefix}_token`
          : backendId
            ? `${backendId}_token`
            : 'google_drive_token';

        const accessToken =
          ensuredAccessToken ||
          (typeof backend.getAccessToken === 'function' ? backend.getAccessToken() : undefined) ||
          (backend as any).token ||
          (localTokenKey ? localStorage.getItem(localTokenKey) : null);
        if (!accessToken) {
          retryBackends.add(backendId);
          console.debug('⏳ [loadFiles] Waiting for refreshed token', { backendId });
        }
        let ownerIndex: any = null;

        if (accessToken && currentPnIdentifier) {
          try {
            const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
            const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(accessToken, currentPnIdentifier);
            const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(accessToken, pnFolderId);
            ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndex(accessToken, metadataFolderId, currentPnIdentifier);
            console.debug('📋 [loadFiles] Owner index response', {
              backendId,
              hasIndex: !!ownerIndex,
              fileCount: ownerIndex?.files?.length || 0,
            });
          } catch (ownerIndexError) {
            const errorMessage =
              ownerIndexError instanceof Error ? ownerIndexError.message : String(ownerIndexError);
            const isAuthRelated =
              typeof errorMessage === 'string' &&
              (errorMessage.includes('Failed to search for pN folder') ||
               errorMessage.includes('Failed to search for metadata folder') ||
               errorMessage.includes('Google Drive authentication expired') ||
               errorMessage.includes('token refresh is temporarily rate limited'));

            if (isAuthRelated) {
              retryBackends.add(backendId);
              rateLimitedBackendsRef.current.add(backendId);
              console.debug('⏳ [loadFiles] Owner index request will retry after token refresh', {
                backendId,
                error: errorMessage,
              });
              continue;
            } else if (!ownerIndexWarningLoggedRef.current.has(backendId)) {
            console.warn('⚠️ [loadFiles] Failed to read owner index (non-blocking):', {
              backendId,
              error: ownerIndexError,
            });
              ownerIndexWarningLoggedRef.current.add(backendId);
            } else {
              console.debug('ℹ️ [loadFiles] Owner index still unavailable', {
                backendId,
                error: errorMessage,
              });
            }
          }
        }

        let filesForBackend: AggregatedFile[] = [];

        if (ownerIndex?.files?.length) {
          ownerIndexRetryCountsRef.current.delete(backendId);
          filesForBackend = ownerIndex.files.map((entry: any) => {
            const derivedMime =
              entry.mimeType ||
              (entry.fileName?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);

            const normalizedName = entry.fileName || entry.originalName || 'Untitled';
            const parsedSize = typeof entry.size === 'number' ? entry.size : Number(entry.size || 0);
            const fileId = entry.fileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;

            return {
              id: fileId,
              backend: backendId,
              backendFileId: entry.googleDriveFileId,
              name: normalizedName,
              originalName: entry.originalName || normalizedName,
              mimeType: derivedMime,
              size: Number.isFinite(parsedSize) ? parsedSize.toString() : '0',
              encrypted: true,
              visibility: normalizeVisibility(entry.visibility),
              aggregatedAt: entry.uploadedAt || new Date().toISOString(),
            };
          });

          ownerIndex.files.forEach((entry: any) => {
            const fileId = entry.fileId || entry.googleDriveFileId || `${backendId}:${entry.fileName}`;
            const name = entry.originalName || entry.fileName || 'Untitled';
            const mime =
              entry.mimeType ||
              (name?.toLowerCase().endsWith('.encrypted') ? 'application/octet-stream' : undefined);
            const schemaType =
              mime?.startsWith('image/')
                ? 'ImageObject'
                : mime?.startsWith('video/')
                ? 'VideoObject'
                : mime?.startsWith('audio/')
                ? 'AudioObject'
                : 'CreativeWork';
            const isPublic = entry.visibility === 'public';
            const publicToken =
              typeof entry.publicToken === 'string'
                ? entry.publicToken
                : entry.publicToken
                ? JSON.stringify(entry.publicToken)
                : undefined;

            const metadata: PublicMetadata = {
              fileId,
              backend: backendId,
              backendFileId: entry.googleDriveFileId,
              name,
              description: entry.description || '',
              keywords: entry.tags || [],
              uploadDate: entry.uploadedAt,
              fileType: schemaType === 'ImageObject' ? 'image' : schemaType === 'VideoObject' ? 'video' : schemaType === 'AudioObject' ? 'audio' : 'document',
              isPublic,
              creator: entry.owner?.did
                ? {
                    "@type": "Person",
                    "@id": entry.owner.did,
                    identifier: {
                      "@type": "PropertyValue",
                      name: 'DID',
                      value: entry.owner.did,
                    },
                  }
                : undefined,
              thumbnail: entry.thumbnail,
              publicToken,
              engagement: entry.engagement,
              inReplyTo: entry.inReplyTo,
              repostOf: entry.repostOf,
              isPartOf: entry.isPartOf,
              "@context": ["https://schema.org/", "https://parnoir.com/ns/v1#"],
              "@type": schemaType,
              "@id": `https://parnoir.com/resource/${fileId}`,
            };
            aggregatedMetadataMap.set(fileId, metadata);
            if (metadata.backendFileId && metadata.backendFileId !== fileId) {
              aggregatedMetadataMap.set(metadata.backendFileId, metadata);
            }

            if (entry.publicToken) {
              try {
                const shareToken = typeof entry.publicToken === 'string'
                  ? JSON.parse(entry.publicToken)
                  : entry.publicToken;
                const cacheKey = makeShareTokenCacheKey(backendId, entry.googleDriveFileId);
                shareTokenCache.current.set(cacheKey, shareToken);
                console.debug('💾 [loadFiles] Cached share token from owner index', { backendId, fileId });
              } catch (tokenError) {
                console.warn('⚠️ [loadFiles] Failed to cache owner index share token', {
                  backendId,
                  fileId,
                  error: tokenError,
                });
              }
            }
          });
        } else {
          console.debug('ℹ️ [loadFiles] Owner index empty; scanning Drive contents', { backendId });
          try {
            const scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
            filesForBackend = scannedFiles.map((file: any) => ({
              ...file,
              backend: backendId,
              backendFileId: file.id,
            }));
            filesNeedingMetadata.push(...filesForBackend);

            if (ownerIndex?.files?.length) {
              filesForBackend.forEach((file) => {
                const indexEntry = ownerIndex.files.find((entry: any) => entry.googleDriveFileId === file.backendFileId);
                if (indexEntry?.publicToken) {
                  try {
                    const shareToken = typeof indexEntry.publicToken === 'string'
                      ? JSON.parse(indexEntry.publicToken)
                      : indexEntry.publicToken;
                    const cacheKey = makeShareTokenCacheKey(backendId, file.backendFileId);
                    shareTokenCache.current.set(cacheKey, shareToken);
                  } catch (tokenError) {
                    console.warn('⚠️ [loadFiles] Unable to parse share token for scanned file', {
                      backendId,
                      fileId: file.id,
                      error: tokenError,
                    });
                  }
                }
              });
            }
          } catch (scanError) {
            const scanMessage =
              scanError instanceof Error ? scanError.message : String(scanError);
            const scanCode = (scanError as any)?.code;

            if (
              scanCode === 'GOOGLE_DRIVE_REFRESH_COOLDOWN' ||
              scanMessage.includes('token refresh is temporarily rate limited') ||
              scanMessage.includes('Google Drive authentication expired')
            ) {
              retryBackends.add(backendId);
              rateLimitedBackendsRef.current.add(backendId);
            }

            console.warn('⚠️ [loadFiles] Drive scan failed (non-blocking)', {
              backendId,
              error: scanError,
            });
            continue;
          }
        }

        if (filesForBackend.length === 0) {
          console.debug('ℹ️ [loadFiles] No files discovered for backend', { backendId });
          continue;
        }

        aggregatedAllFiles.push(...filesForBackend);
      }

      setFiles(aggregatedAllFiles);
      const normalizedMetadataMap = new Map<string, PublicMetadata>();
      aggregatedMetadataMap.forEach((metadata, key) => {
        normalizedMetadataMap.set(key, metadata);
        if (metadata.backendFileId && metadata.backendFileId !== key) {
          normalizedMetadataMap.set(metadata.backendFileId, metadata);
        }
        if (metadata.fileId && metadata.fileId !== key) {
          normalizedMetadataMap.set(metadata.fileId, metadata);
        }
      });
      setFileMetadataMap(normalizedMetadataMap);

      const filesWithoutMetadata = filesNeedingMetadata.filter((file) => {
        if (aggregatedMetadataMap.has(file.id)) {
          return false;
        }
        if (file.backendFileId && aggregatedMetadataMap.has(file.backendFileId)) {
          return false;
        }
        return true;
      });
      if (filesWithoutMetadata.length > 0) {
        loadFileMetadata(filesWithoutMetadata).catch((err) => {
          console.warn('⚠️ Failed to load file metadata (non-blocking):', err);
        });
      }
      if (retryBackends.size > 0) {
        console.debug('⏳ [loadFiles] Scheduling retry after token refresh', {
          retryBackends: Array.from(retryBackends),
        });
        scheduleTokenRetry(Array.from(retryBackends));
      }
    } catch (err) {
      // Don't set error or break unlock - just log it
      console.warn('⚠️ [loadFiles] Error (non-blocking, unlock can proceed):', err);
      setFiles([]); // Show empty list
    } finally {
      setIsLoading(false);
      isLoadingFilesRef.current = false;
    }
  }, [aggregatorService, authenticatedUser, resolvedAuth, loadFileMetadata, getDriveAccountByBackendId, scheduleTokenRetry]);

  const handleTogglePublic = async (file: AggregatedFile) => {
    try {
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
      console.error('Failed to toggle public status:', err);
      setError(errorMessage);
    }
  };

  const handleSaveShareSettings = React.useCallback(async () => {
    if (!sharingFile) {
      return;
    }

    try {
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

      if (makePublic && nextPermissions) {
        try {
          const response = await fetch(
            `${apiEndpoint}/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
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

          if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(errorText || `Failed to update index visibility (${response.status})`);
          }
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
    fileMetadataMap,
    indexerToggles,
    thirdPartyIndexers,
    indexingPermissionsState,
    handleTogglePublic,
    loadFileMetadata,
    apiEndpoint,
    closeShareSettings,
    refreshMetadataInBackground
  ]);

  const loadStorageQuota = React.useCallback(async () => {
    if (!aggregatorService) {
      return;
    }

    if (isLoadingFilesRef.current) {
      // If files are currently loading, defer quota load to avoid extra pressure
      return;
    }
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
  }, [aggregatorService]);

  React.useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);

  React.useEffect(() => {
    loadStorageQuotaRef.current = loadStorageQuota;
  }, [loadStorageQuota]);

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

      let storedAccounts: DriveAccountState[] = [];
      try {
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            storedAccounts = parsed.filter((entry) => entry && entry.backendId && entry.keyPrefix);
          }
        }
      } catch (parseError) {
        console.warn('⚠️ [init] Failed to parse stored drive accounts', parseError);
      }

      if (storedAccounts.length === 0) {
        const legacyToken = localStorage.getItem('google_drive_token');
        if (legacyToken) {
          const legacyEmail = localStorage.getItem('google_drive_email');
          const legacyRefresh = localStorage.getItem('google_drive_refresh_token');
          const identifiers = resolveIdentifiersForEmail(legacyEmail);
          await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
            token: legacyToken,
            refreshToken: legacyRefresh,
            email: legacyEmail
          });
        }
      } else {
        for (const account of storedAccounts) {
          const token = localStorage.getItem(`${account.keyPrefix}_token`);
          const refresh = localStorage.getItem(`${account.keyPrefix}_refresh_token`);

          if (!token) {
            continue;
          }

          await upsertDriveAccount({
            backendId: account.backendId,
            keyPrefix: account.keyPrefix,
            token,
            refreshToken: refresh,
            email: account.email
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
      let metadataPnName =
        resolvedCredentials?.pnName ||
        authenticatedUser?.pnName ||
        (authenticatedUser as any)?.username ||
        (authenticatedUser as any)?.name ||
        null;
      let metadataPasscode = resolvedCredentials?.passcode || null;
      if (!metadataPasscode) {
        try {
          metadataPasscode = sessionStorage.getItem('pn_session_passcode');
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

    await persistStorageCredentialsToAPI(payloadForPersistence || undefined);

      // Persist refresh token for local fallback using scoped key prefix
      if (tokenData.refreshToken) {
        try {
          localStorage.setItem(`${identifiers.keyPrefix}_refresh_token`, tokenData.refreshToken);
        } catch (storageError) {
          console.warn('⚠️ [handleConnectGoogleDrive] Unable to persist refresh token locally:', storageError);
        }
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
      if (!aggregatorService) {
        console.warn('⚠️ [handleDisconnect] Aggregator service unavailable');
        return;
      }
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

    const targetBackendIdAttr = event.target.dataset.backendId;
    const overrideBackendId = targetBackendIdAttr && typeof targetBackendIdAttr === 'string' ? targetBackendIdAttr : null;

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
      let sessionPasscode: string | null = passcodeToUse;
      if (!sessionPasscode) {
        try {
          sessionPasscode = sessionStorage.getItem('pn_session_passcode');
        } catch (e) {
          sessionPasscode = null;
        }
      }
      setResolvedAuth((prev) => ({
        pnName: pnName!,
        publicKey: publicKey!,
        passcode: sessionPasscode || prev?.passcode,
      }));
    } else if (!resolvedAuth.passcode) {
      // Ensure we hydrate passcode if it was missing
      let sessionPasscode: string | null = passcodeToUse;
      if (!sessionPasscode) {
        try {
          sessionPasscode = sessionStorage.getItem('pn_session_passcode');
        } catch (e) {
          sessionPasscode = null;
        }
      }
      if (sessionPasscode) {
        setResolvedAuth((prev) =>
          prev
            ? {
                ...prev,
                passcode: sessionPasscode || prev.passcode,
              }
            : prev
        );
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

      const targetBackendId = overrideBackendId || activeBackendId || driveAccounts[0]?.backendId;
      if (!targetBackendId) {
        throw new Error('No Google Drive account connected');
      }

      const backend = aggregatorService.getBackend(targetBackendId);
      if (!backend || !backend.isConnected()) {
        throw new Error(`${targetBackendId} is not connected`);
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
              indexingPermissions: currentMetadata.indexingPermissions,
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
  const hasConnectedBackends = driveAccounts.length > 0;

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
      return;
    }

    if (resolvedAuth?.pnName && resolvedAuth.publicKey && resolvedAuth.passcode) {
      const payload: DesktopUnlockPayload = {
        pnName: resolvedAuth.pnName,
        publicKey: resolvedAuth.publicKey,
        passcode: resolvedAuth.passcode,
      };

      window.dispatchEvent(new CustomEvent<DesktopUnlockPayload>('pn-auth-session', { detail: payload }));
    }
  }, [isDesktopShell, resolvedAuth]);

  return (
    <div className="space-y-6">
      {/* Secure Folder / Desktop App Section */}
      {!hideSecureFolderSection && (
        isDesktopShell ? (
          <DesktopSecureFolderPanel />
        ) : (
          <>
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
            </div>

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
          </>
        )
      )}

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
        <div className="space-y-6">
          {driveAccounts.map((account, index) => {
            const backendId = account.backendId;
            const email = account.email || userEmails.get(backendId) || `Drive ${index + 1}`;
            const accountFiles = filesByBackend.get(backendId) || [];
            const quota = storageQuotas.get(backendId);
            const percentUsed = quota && quota.totalBytes
              ? Math.min(100, Math.round((quota.usedBytes / quota.totalBytes) * 100))
              : null;

            return (
              <div key={backendId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <img src={GOOGLE_DRIVE_ICON_URL} alt="Google Drive" className="h-5 w-5" />
                    <span className="text-white font-semibold truncate max-w-xs">
                      {email}
                    </span>
                    {connectedBackends.has(backendId) && (
                      <button
                        onClick={() => handleDisconnect(backendId)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setActiveBackendId(backendId);
                        loadFiles();
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                      title="Refresh Files"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <input
                      type="file"
                      data-backend-id={backendId}
                      className="hidden"
                      disabled={isLoading}
                      onChange={handleUpload}
                      ref={(el) => {
                        if (el) {
                          fileInputRefs.current.set(backendId, el);
                        } else {
                          fileInputRefs.current.delete(backendId);
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        setActiveBackendId(backendId);
                        const input = fileInputRefs.current.get(backendId);
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

                {quota && (
                  <div className="flex items-center justify-between text-xs text-text-secondary bg-neutral-800/60 rounded-lg px-3 py-2 mb-4">
                    <span>Used {(quota.usedBytes / (1024 * 1024)).toFixed(1)} MB of {(quota.totalBytes / (1024 * 1024)).toFixed(1)} MB</span>
                    <span>{percentUsed ?? 0}% full</span>
                  </div>
                )}

                {isLoading && files.length === 0 ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 text-text-secondary animate-spin mx-auto mb-4" />
                    <p className="text-text-secondary">Loading files...</p>
                  </div>
                ) : accountFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                    <p className="text-text-secondary">No files found for this account</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {accountFiles.map((file) => {
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

                          <div className="p-3">
                            <p className="text-white text-xs truncate mb-1" title={file.encrypted ? file.originalName : file.name}>
                              {file.encrypted ? file.originalName : file.name}
                            </p>
                            <p className="text-text-secondary text-xs">
                              {(parseInt(file.size?.toString() || '0') / 1024).toFixed(1)} KB
                            </p>

                            <div className="flex items-center justify-end mt-2 pt-2 border-t border-neutral-700">
                              <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                    setOpenMenuFor((prev) =>
                                      prev === file.backendFileId ? null : file.backendFileId
                                    );
                                  }}
                                  className="p-1.5 text-text-secondary hover:text-text-primary transition-colors rounded"
                                  title="File actions"
                                  disabled={isLoading}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                                {openMenuFor === file.backendFileId && (
                                  <div
                                    ref={(node) => {
                                      if (node) {
                                        actionMenuRef.current = node;
                                      }
                                    }}
                                    className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-30 py-1"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuFor(null);
                                        actionMenuRef.current = null;
                                  handleEditMetadata(file);
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
                                        actionMenuRef.current = null;
                                        handleDownload(file);
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
                                      }}
                                      className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                      disabled={isLoading}
                                      hidden
                                    >
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                        setOpenMenuFor(null);
                                        actionMenuRef.current = null;
                                        openShareSettings(file);
                                }}
                                      className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                disabled={isLoading}
                              >
                                      <Share2 className="h-4 w-4" />
                                      <span>Share settings</span>
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
                            ) : isImage || isVideo ? (
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
                                  <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                                )}
                              </div>
                              <p className="text-text-secondary text-xs">
                                {file.backend} • {(parseInt(file.size?.toString() || '0') / 1024).toFixed(2)} KB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end space-x-2">
                            <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                  setOpenMenuFor((prev) =>
                                    prev === file.backendFileId ? null : file.backendFileId
                                  );
                              }}
                              className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 bg-neutral-700/50 hover:bg-neutral-700 text-text-secondary hover:text-text-primary"
                                title="File actions"
                                disabled={isLoading}
                            >
                                <MoreVertical className="h-4 w-4" />
                            </button>
                              {openMenuFor === file.backendFileId && (
                                <div
                                  ref={(node) => {
                                    if (node) {
                                      actionMenuRef.current = node;
                                    }
                                  }}
                                  className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-30 py-1"
                                >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                      handleEditMetadata(file);
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
                                      actionMenuRef.current = null;
                                handleDownload(file);
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
                                      actionMenuRef.current = null;
                                      openShareSettings(file);
                                    }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                    disabled={isLoading}
                                  >
                                    <Share2 className="h-4 w-4" />
                                    <span>Share settings</span>
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


