/**
 * File Storage Aggregator Component
 * Dashboard aggregator that collects files from all connected storage backends
 */
import React, { useState, useEffect, useRef } from 'react';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, Info, X, Edit, Eye, Grid, List, Plus, Cloud, MoreVertical, Share2, Trash2, UserCircle } from 'lucide-react';
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
import { SecureCredentialManager } from '../../utils/secureCredentialManager';
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';

const GOOGLE_DRIVE_ICON_URL = GoogleDriveIconUrl;
const DRIVE_ACCOUNTS_STORAGE_KEY = 'pn_google_drive_accounts';
const METADATA_SYNC_MIN_INTERVAL_MS = 90_000;
const INDEXER_CACHE_TTL_MS = 5 * 60 * 1000;

const isDesktopShell = typeof window !== 'undefined' && Boolean(window.parNoirDesktop);

type DesktopUnlockPayload = {
  pnName: string;
  publicKey: string;
  authToken: string;
  pnIdentifier?: string;
};

type DesktopLockPayload = {
  pnName?: string;
  publicKey?: string;
  pnIdentifier?: string;
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
  // SECURITY: email removed - sensitive data should not be stored in localStorage
  // email: string | null; // REMOVED - use encrypted storage instead
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [connectedBackends, setConnectedBackends] = useState<Set<string>>(new Set());
  const [userEmails, setUserEmails] = useState<Map<string, string>>(new Map());
  const userEmailsRef = React.useRef(userEmails);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccountState[]>([]);
  const [activeBackendId, setActiveBackendId] = useState<string | null>(null);
  const [storageQuotas, setStorageQuotas] = useState<Map<string, any>>(new Map());
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, PublicMetadata>>(new Map());
  const [resolvedAuth, setResolvedAuth] = useState<{ pnName: string; publicKey: string; passcode?: string; authToken?: string } | null>(null);
  const lastDesktopPayloadRef = React.useRef<DesktopUnlockPayload | null>(null);
  const lastDesktopAuthStateRef = React.useRef<'locked' | 'unlocked'>('locked');
  
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
  
  React.useEffect(() => {
    const derivePnIdentifier = async () => {
      const currentResolvedAuth = resolvedAuthRef.current;
      const currentAuthenticatedUser = authenticatedUserRef.current;
      
      // STANDARDIZED: Use VolumeIdGenerator - the ONLY method for pN identifier generation
      try {
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        const sessionId = currentAuthenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        const pnName = currentResolvedAuth?.pnName || currentAuthenticatedUser?.pnName || (currentAuthenticatedUser as any)?.username;
      const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
      
        if (pnName && credentials?.passcode && publicKey) {
          // STANDARDIZED FORMULA: pnName:passcode:publicKey → SHA256 → pn-{12-char-hex}
          const identifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode: credentials.passcode,
            publicKey
          });
          // CRITICAL: Store WITH 'pn-' prefix - this is the standardized format
          // API expects pn-{hash} format, not just {hash}
          pnIdentifierRef.current = identifier; // Keep full format: pn-{12-char-hex}
          console.log('[StorageCredentials] Derived pN identifier (standardized):', identifier);
        } else {
        pnIdentifierRef.current = null;
          console.warn('[StorageCredentials] Cannot derive pN identifier - missing credentials');
        }
      } catch (error) {
        console.error('[StorageCredentials] Error deriving pN identifier:', error);
        pnIdentifierRef.current = null;
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
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    const pnName = currentResolvedAuth?.pnName || currentAuthenticatedUser?.pnName || (currentAuthenticatedUser as any)?.username;
    const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
    
    if (pnName && credentials?.passcode && publicKey) {
      try {
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        const identifier = await VolumeIdGenerator.generateVolumeId({
          pnName,
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

  // These useEffects are moved below persistStorageCredentialsToAPI declaration to avoid initialization order issues

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
      // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      passcode = getPasscodeFromSecureStorage(sessionId);
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
      // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const storedPasscode = getPasscodeFromSecureStorage(sessionId);
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

  function persistDriveAccounts(accounts: DriveAccountState[]) {
    try {
      // SECURITY: Do not store email in accounts array - it's sensitive data
      // Only store backendId and keyPrefix (non-sensitive identifiers)
      const sanitizedAccounts = accounts.map(account => ({
        backendId: account.backendId,
        keyPrefix: account.keyPrefix,
        // email removed - security risk
      }));
      localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(sanitizedAccounts));
    } catch (storageError) {
      console.warn('⚠️ [DriveAccounts] Unable to persist drive accounts', storageError);
    }
  }

  const unregisterBackend = React.useCallback(
    (backendId: string) => {
      if (!backendId) {
        return;
      }

      driveCredentialCacheRef.current.delete(backendId);

    setConnectedBackends((prev) => {
      if (!prev.has(backendId)) {
        return prev;
      }
        const next = new Set(prev);
      next.delete(backendId);
      return next;
    });

      if (aggregatorService && typeof aggregatorService.removeBackend === 'function') {
        aggregatorService.removeBackend(backendId);
      }
    },
    [aggregatorService]
  );

  // CRITICAL: Clean up duplicate cache entries by email
  function cleanupDuplicateCacheEntries() {
    const cache = driveCredentialCacheRef.current;
    const emailsSeen = new Map<string, string>(); // email -> backendId
    const toDelete: string[] = [];
    
    for (const [backendId, credential] of cache.entries()) {
      if (credential.email) {
        const normalizedEmail = credential.email.toLowerCase();
        const existingBackendId = emailsSeen.get(normalizedEmail);
        if (existingBackendId) {
          // Keep the one with the most recent updatedAt
          const existing = cache.get(existingBackendId);
          if (existing && credential.updatedAt && existing.updatedAt) {
            if (credential.updatedAt > existing.updatedAt) {
              // Current entry is newer, delete the old one
              toDelete.push(existingBackendId);
              emailsSeen.set(normalizedEmail, backendId);
            } else {
              // Existing entry is newer, delete current one
              toDelete.push(backendId);
            }
          } else {
            // No updatedAt info, keep first one found
            toDelete.push(backendId);
          }
        } else {
          emailsSeen.set(normalizedEmail, backendId);
        }
      }
    }
    
    if (toDelete.length > 0) {
      console.log(`🧹 [cleanupDuplicateCacheEntries] Removing ${toDelete.length} duplicate cache entries`);
      toDelete.forEach(backendId => cache.delete(backendId));
    }
  }

  function purgeDuplicateBackendsForEmail(preferredBackendId: string, email: string | null | undefined) {
    if (!email) {
        return;
      }

    const normalized = email.toLowerCase();
    const staleBackendIds: string[] = [];

    for (const [cachedBackendId, credential] of Array.from(driveCredentialCacheRef.current.entries())) {
      if (cachedBackendId === preferredBackendId) {
        continue;
      }
      const cachedEmail = credential.email?.toLowerCase() || null;
      if (cachedEmail && cachedEmail === normalized) {
        staleBackendIds.push(cachedBackendId);
      }
    }

    if (staleBackendIds.length === 0) {
        return;
      }

    staleBackendIds.forEach((backendId) => {
      unregisterBackend(backendId);
    });

    setDriveAccounts((prev) => {
      const filtered = prev.filter((account) => !staleBackendIds.includes(account.backendId));
      if (filtered.length === prev.length) {
        return prev;
              }
      persistDriveAccounts(filtered);
      return filtered;
    });
      }
  
  function resolveIdentifiersForEmail(email?: string | null) {
    const normalizedEmail = email?.toLowerCase() || null;
    if (normalizedEmail) {
      // CRITICAL: Check cache FIRST - it's the most up-to-date source
      for (const [backendId, credential] of driveCredentialCacheRef.current.entries()) {
        const cachedEmail = credential.email?.toLowerCase();
        if (cachedEmail === normalizedEmail) {
          console.log(`✅ [resolveIdentifiersForEmail] Found existing account in cache for ${normalizedEmail}: ${backendId}`);
          // Check if this backendId is already in driveAccounts
          const accountInState = driveAccounts.find(acc => acc.backendId === backendId);
          if (accountInState) {
            return { backendId, keyPrefix: accountInState.keyPrefix, isNew: false };
          }
          // If not in state but in cache, use the cached keyPrefix
          return { backendId, keyPrefix: credential.keyPrefix, isNew: false };
        }
      }
      
      // Also check driveAccounts state and userEmails map
      const existing = driveAccounts.find((account) => {
        const accountEmail = userEmails.get(account.backendId);
        return accountEmail?.toLowerCase() === normalizedEmail;
      });
      if (existing) {
        console.log(`✅ [resolveIdentifiersForEmail] Found existing account in state for ${normalizedEmail}: ${existing.backendId}`);
        return { backendId: existing.backendId, keyPrefix: existing.keyPrefix, isNew: false };
      }
      
      // CRITICAL: Also check aggregatorService for registered backends
      if (aggregatorService) {
        try {
          const allBackends = aggregatorService.getAllBackends();
          for (const [registeredBackendId, backend] of allBackends.entries()) {
            if (registeredBackendId.startsWith('google_drive::')) {
              const backendEmail = (backend as any).getEmail?.()?.toLowerCase();
              if (backendEmail === normalizedEmail) {
                console.log(`✅ [resolveIdentifiersForEmail] Found existing backend in aggregatorService for ${normalizedEmail}: ${registeredBackendId}`);
                // Find keyPrefix from cache or state
                const cachedCredential = driveCredentialCacheRef.current.get(registeredBackendId);
                const stateAccount = driveAccounts.find(acc => acc.backendId === registeredBackendId);
                const keyPrefix = stateAccount?.keyPrefix || cachedCredential?.keyPrefix || `google_drive_${registeredBackendId.replace('google_drive::', '')}`;
                return { backendId: registeredBackendId, keyPrefix, isNew: false };
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ [resolveIdentifiersForEmail] Error checking aggregatorService:', error);
        }
      }
    }

    // SECURITY: Do NOT use email in backendId - use random identifier instead
    // This prevents email from being exposed in localStorage keys
    // Only create new identifier if NO existing account found ANYWHERE
    console.log(`🆕 [resolveIdentifiersForEmail] No existing account found for ${normalizedEmail || 'no email'}, creating new identifier`);
    const uniqueSuffix =
      typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now().toString(36);
    const slug = `account-${timestamp}-${uniqueSuffix}`;
    return {
      backendId: `google_drive::${slug}`,
      keyPrefix: `google_drive_${slug}`,
      isNew: true,
    };
  }

  function getDriveAccountByBackendId(backendId: string | null | undefined) {
      if (!backendId) {
        return null;
      }
      return driveAccounts.find((account) => account.backendId === backendId) || null;
  }
  
  const buildStorageCredentialPayload = React.useCallback(() => {
    // CRITICAL: Clean up duplicates BEFORE building payload
    cleanupDuplicateCacheEntries();
    
    const entries = Array.from(driveCredentialCacheRef.current.values());
    if (entries.length === 0) {
      return null;
    }
    
    // CRITICAL: Safety check - if cache has more than 10 entries, something is very wrong
    if (entries.length > 10) {
      console.error(`🚨 [buildStorageCredentialPayload] CRITICAL: Cache has ${entries.length} entries (expected max 10). Clearing duplicates aggressively.`);
      // Keep only the most recent entry per email
      const accountsByEmail = new Map<string, typeof entries[0]>();
      for (const entry of entries) {
        if (entry.email) {
          const normalizedEmail = entry.email.toLowerCase();
          const existing = accountsByEmail.get(normalizedEmail);
          if (!existing || 
              (entry.updatedAt && existing.updatedAt && entry.updatedAt > existing.updatedAt) ||
              (entry.connectedAt && existing.connectedAt && entry.connectedAt > existing.connectedAt)) {
            accountsByEmail.set(normalizedEmail, entry);
          }
        }
      }
      // Clear cache and repopulate with only unique accounts
      driveCredentialCacheRef.current.clear();
      for (const entry of accountsByEmail.values()) {
        driveCredentialCacheRef.current.set(entry.backendId, entry);
      }
      // Re-fetch entries after cleanup
      const cleanedEntries = Array.from(driveCredentialCacheRef.current.values());
      if (cleanedEntries.length === 0) {
        return null;
      }
      entries.length = 0;
      entries.push(...cleanedEntries);
    }
    
    // CRITICAL: Deduplicate by email - only keep the most recent account per email
    const accountsByEmail = new Map<string, typeof entries[0]>();
    const accountsWithoutEmail: typeof entries = [];
    
    for (const entry of entries) {
      if (entry.email) {
        const normalizedEmail = entry.email.toLowerCase();
        const existing = accountsByEmail.get(normalizedEmail);
        // Keep the most recent one (by updatedAt or connectedAt)
        if (!existing || 
            (entry.updatedAt && existing.updatedAt && entry.updatedAt > existing.updatedAt) ||
            (entry.connectedAt && existing.connectedAt && entry.connectedAt > existing.connectedAt)) {
          accountsByEmail.set(normalizedEmail, entry);
        }
      } else {
        // Accounts without email - keep by backendId (should be unique)
        accountsWithoutEmail.push(entry);
      }
    }
    
    // Combine deduplicated accounts
    const uniqueAccounts = Array.from(accountsByEmail.values()).concat(accountsWithoutEmail);
    
    // CRITICAL: Also deduplicate by backendId as a safety measure
    const finalAccounts = new Map<string, typeof entries[0]>();
    for (const account of uniqueAccounts) {
      if (!finalAccounts.has(account.backendId)) {
        finalAccounts.set(account.backendId, account);
      }
    }
    
    const finalAccountsArray = Array.from(finalAccounts.values());
    
    // CRITICAL: HARD LIMIT - Only ONE account should exist per pN
    // If we have more than 1, something is very wrong - keep only the most recent one
    if (finalAccountsArray.length > 1) {
      console.error(`🚨 [buildStorageCredentialPayload] CRITICAL: Cache has ${finalAccountsArray.length} accounts (expected max 1). Keeping only the most recent one.`);
      // Sort by updatedAt or connectedAt, keep only the most recent
      finalAccountsArray.sort((a, b) => {
        const aTime = a.updatedAt || a.connectedAt || '';
        const bTime = b.updatedAt || b.connectedAt || '';
        return bTime.localeCompare(aTime); // Most recent first
      });
      finalAccountsArray.length = 1; // Keep only first (most recent)
      
      // Clear cache and repopulate with only the one account
      driveCredentialCacheRef.current.clear();
      const accountToKeep = finalAccountsArray[0];
      driveCredentialCacheRef.current.set(accountToKeep.backendId, accountToKeep);
    }
    
    const now = new Date().toISOString();
    return {
      googleDriveAccounts: finalAccountsArray.map((entry) => ({
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
        // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        metadataPasscode = getPasscodeFromSecureStorage(sessionId);
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

  // Guard to prevent multiple simultaneous persistence calls
  const persistenceInProgressRef = React.useRef(false);
  const lastPersistenceTimeRef = React.useRef<number>(0);
  const PERSISTENCE_DEBOUNCE_MS = 5000; // Don't persist more than once every 5 seconds
  // CRITICAL: Global lock to prevent multiple persistence calls
  const globalPersistenceLockRef = React.useRef(false);

  const persistStorageCredentialsToAPI = React.useCallback(async (credentialsPayload?: any, cid?: string | null) => {
    // CRITICAL: Global lock to prevent multiple simultaneous persistence calls
    if (globalPersistenceLockRef.current) {
      console.warn('🚫 [StorageCredentials] BLOCKED: Global persistence lock active, skipping...');
      return;
    }
    
    // Prevent multiple simultaneous calls
    if (persistenceInProgressRef.current) {
      console.warn('🚫 [StorageCredentials] BLOCKED: Persistence already in progress, skipping...');
      return;
    }

    // Debounce rapid calls
    const now = Date.now();
    const timeSinceLastCall = now - lastPersistenceTimeRef.current;
    if (timeSinceLastCall < PERSISTENCE_DEBOUNCE_MS) {
      console.warn(`🚫 [StorageCredentials] BLOCKED: Persistence debounced (${timeSinceLastCall}ms < ${PERSISTENCE_DEBOUNCE_MS}ms since last call)`);
      return;
    }

    console.log(`🔒 [StorageCredentials] ACQUIRING lock - setting globalPersistenceLockRef and persistenceInProgressRef to true`);
    globalPersistenceLockRef.current = true;
    persistenceInProgressRef.current = true;
    lastPersistenceTimeRef.current = now;

    try {
      console.log('[StorageCredentials] persistStorageCredentialsToAPI called', {
        hasPayload: !!credentialsPayload,
        driveAccountsLength: driveAccounts.length,
        cacheSize: driveCredentialCacheRef.current.size
      });
      
      let payload = credentialsPayload;
      if (!payload) {
        const cacheSizeBeforeDedup = driveCredentialCacheRef.current.size;
        payload = buildStorageCredentialPayload();
        console.log('[StorageCredentials] Built payload from cache', {
          hasPayload: !!payload,
          accountsCount: payload?.googleDriveAccounts?.length || 0,
          cacheSizeBeforeDedup: cacheSizeBeforeDedup
        });
      }

      if (
        !payload ||
        !Array.isArray(payload.googleDriveAccounts) ||
        payload.googleDriveAccounts.length === 0
      ) {
        console.warn('⚠️ [StorageCredentials] No Google Drive accounts available; skipping API persistence', {
          payloadExists: !!payload,
          isArray: Array.isArray(payload?.googleDriveAccounts),
          accountsLength: payload?.googleDriveAccounts?.length || 0
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      await persistCredentialsToSecureMetadata(payload);

      // CRITICAL: Use STANDARDIZED pn identifier for all API calls
      // This ensures consistency - same credentials always produce same identifier
      // Generate pn identifier from pnName:passcode:publicKey
      const currentUser = authenticatedUserRef.current;
      if (!currentUser?.publicKey) {
        console.warn('⚠️ [StorageCredentials] No publicKey available for pn identifier generation', {
          authenticatedUserRefExists: !!currentUser,
          hasPublicKey: !!currentUser?.publicKey
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      // Get credentials from SecureCredentialManager to generate pn identifier
      const sessionId = currentUser.id || currentUser.publicKey;
      const credentials = SecureCredentialManager.getCredentials(sessionId);
      if (!credentials) {
        console.warn('⚠️ [StorageCredentials] No credentials available for pn identifier generation', {
          sessionId: sessionId?.substring(0, 20) + '...',
          hasCredentials: false
        });
        globalPersistenceLockRef.current = false;
        persistenceInProgressRef.current = false;
        return;
      }

      // Generate standardized pn identifier
      const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
      const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
        pnName: credentials.pnName,
        passcode: credentials.passcode,
        publicKey: currentUser.publicKey
      });

      console.log('📤 [StorageCredentials] Using STANDARDIZED pn identifier for API persistence', {
        pnIdentifier: pnIdentifier,
        publicKeyLength: currentUser.publicKey?.length
      });

      try {
        console.log('📤 [StorageCredentials] Persisting credentials to API...', {
          pnIdentifier: pnIdentifier,
          hasCid: !!cid,
          accountsCount: payload.googleDriveAccounts.length
        });

        const response = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pnIdentifier)}`, {
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
            status: response.status,
            error: errorText,
          });
        } else {
          console.log('✅ [StorageCredentials] Credentials persisted to API', {
            accountsCount: payload.googleDriveAccounts.length
          });
        }
      } catch (error) {
        console.warn('⚠️ [StorageCredentials] API persistence failed (non-blocking):', {
          error: error?.message || error,
        });
      }
    } finally {
      console.log(`🔓 [StorageCredentials] RELEASING lock - setting globalPersistenceLockRef and persistenceInProgressRef to false`);
      globalPersistenceLockRef.current = false;
      persistenceInProgressRef.current = false;
    }
  }, [buildStorageCredentialPayload, persistCredentialsToSecureMetadata, apiEndpoint, driveAccounts.length]);

  // Token refresh handler - moved here after persistStorageCredentialsToAPI is declared
  // CRITICAL: Use refs for driveAccounts and userEmails to avoid re-registering event listener
  const driveAccountsRef = React.useRef(driveAccounts);
  const userEmailsRefForTokenRefresh = React.useRef(userEmails);
  
  React.useEffect(() => {
    driveAccountsRef.current = driveAccounts;
  }, [driveAccounts]);
  
  React.useEffect(() => {
    userEmailsRefForTokenRefresh.current = userEmails;
  }, [userEmails]);

  React.useEffect(() => {
    const handleTokenRefreshed = async (event: Event) => {
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

      // CRITICAL: Block token refresh for disconnected accounts
      if (disconnectedBackendIdsRef.current.has(backendId)) {
        const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
        if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
          console.log(`🚫 [handleTokenRefreshed] BLOCKED: Token refresh for disconnected backendId ${backendId} (${timeSinceDisconnect}ms ago)`);
          return;
        } else {
          // Remove from block list after block duration expires
          disconnectedBackendIdsRef.current.delete(backendId);
        }
      }

      const existingCredential = driveCredentialCacheRef.current.get(backendId);
      const currentDriveAccounts = driveAccountsRef.current; // Use ref instead of state
      const account =
        currentDriveAccounts.find((entry) => entry.backendId === backendId) || null;
      const keyPrefix =
        account?.keyPrefix ||
        existingCredential?.keyPrefix ||
        `google_drive_${backendId.replace(/[^a-z0-9]+/gi, '-')}`;
      const currentUserEmails = userEmailsRefForTokenRefresh.current; // Use ref instead of state
      const resolvedEmail =
        detail?.email ??
        existingCredential?.email ??
        currentUserEmails.get(backendId) ??
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

        // SECURITY: Store credentials in encrypted storage (if session available)
        if (authenticatedUser?.id) {
          try {
            await IntegrationCredentialManager.storeCredentials(
              backendId,
              {
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken || undefined,
                email: resolvedEmail || undefined,
                expiresAt: Date.now() + (3600 * 1000) // 1 hour default
              },
              authenticatedUser.id
            );
          } catch (error) {
            console.warn('[FileStorageAggregator] Failed to store encrypted credentials:', error);
          }
        }

        purgeDuplicateBackendsForEmail(backendId, resolvedEmail ?? existingCredential?.email ?? null);
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
          const filtered = prev.filter((entry) => {
            if (entry.backendId === backendId) {
              return false;
            }
            const entryEmail = userEmailsRefForTokenRefresh.current.get(entry.backendId);
            if (entryEmail && entryEmail.toLowerCase() === normalized) {
              return false;
            }
            return true;
          });

          const next = [...filtered, { backendId, keyPrefix }];
          persistDriveAccounts(next);
          return next;
        });

        setUserEmails((prev) => {
          const next = new Map(prev);
          next.set(backendId, resolvedEmail);
          return next;
        });
      }

      // CRITICAL: Persist on token refresh - auto-persist is disabled
      // Only persist if not already persisted recently (debounce)
      const timeSinceLastPersistence = Date.now() - lastPersistenceTimeRef.current;
      if (timeSinceLastPersistence > PERSISTENCE_DEBOUNCE_MS) {
        try {
          const payload = buildStorageCredentialPayload();
          if (payload && payload.googleDriveAccounts && payload.googleDriveAccounts.length > 0) {
            await persistStorageCredentialsToAPI(payload);
            console.log('✅ [handleTokenRefreshed] Credentials persisted to API after token refresh');
          }
        } catch (persistError) {
          console.warn('⚠️ [handleTokenRefreshed] Failed to persist credentials to API (non-critical):', persistError);
        }
      } else {
        console.log(`⏭️ [handleTokenRefreshed] Skipping persistence (debounced, ${timeSinceLastPersistence}ms < ${PERSISTENCE_DEBOUNCE_MS}ms)`);
      }

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
  }, [aggregatorService, persistStorageCredentialsToAPI, authenticatedUser?.id]); // Removed driveAccounts and userEmails from dependencies

  // CRITICAL: DISABLED auto-persist effect - only persist on explicit user actions
  // The auto-persist was causing 8+ PUT requests because authenticatedUser.id was changing
  // Now we only persist when:
  // 1. User connects a Google Drive account (handleConnectGoogleDrive)
  // 2. User disconnects a Google Drive account (handleDisconnect)
  // 3. Token is refreshed (handleTokenRefreshed) - but only if not already persisted recently
  // This prevents the 8+ duplicate persistence calls

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
    [apiEndpoint, applyIndexersState, resolvedAuth?.publicKey, resolvedAuth?.pnName, authenticatedUser?.id, authenticatedUser?.pnName, authenticatedUser?.publicKey]
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

  // CRITICAL: Lock to prevent multiple simultaneous upserts for the same email
  const upsertLocksRef = React.useRef<Map<string, Promise<GoogleDriveBackend | null>>>(new Map());

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

    // CRITICAL: Block re-adding accounts that were just disconnected
    if (disconnectedBackendIdsRef.current.has(params.backendId)) {
      const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
      if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
        console.log(`🚫 [upsertDriveAccount] BLOCKED: Attempted to re-add disconnected backendId ${params.backendId} (${timeSinceDisconnect}ms ago)`);
        return null;
      } else {
        // Remove from block list after block duration expires
        disconnectedBackendIdsRef.current.delete(params.backendId);
      }
    }

    // CRITICAL: Check for existing account with same email BEFORE creating new backend
    const normalizedEmail = params.email?.toLowerCase() || null;
    if (normalizedEmail) {
      // Check if we already have an account with this email
      for (const [existingBackendId, credential] of driveCredentialCacheRef.current.entries()) {
        const existingEmail = credential.email?.toLowerCase();
        if (existingEmail === normalizedEmail && existingBackendId !== params.backendId) {
          console.log(`🔄 [upsertDriveAccount] Found existing account for email ${normalizedEmail}, using existing backendId: ${existingBackendId} instead of ${params.backendId}`);
          // Use the existing backendId instead of creating a new one
          params.backendId = existingBackendId;
          params.keyPrefix = credential.keyPrefix;
          break;
        }
      }
      
      // Also check driveAccounts state
      for (const account of driveAccounts) {
        const accountEmail = userEmails.get(account.backendId);
        if (accountEmail?.toLowerCase() === normalizedEmail && account.backendId !== params.backendId) {
          console.log(`🔄 [upsertDriveAccount] Found existing account in state for email ${normalizedEmail}, using existing backendId: ${account.backendId} instead of ${params.backendId}`);
          params.backendId = account.backendId;
          params.keyPrefix = account.keyPrefix;
          break;
        }
      }

      // CRITICAL: Lock to prevent multiple simultaneous upserts for the same email
      const lockKey = normalizedEmail;
      const existingLock = upsertLocksRef.current.get(lockKey);
      if (existingLock) {
        console.log(`⏳ [upsertDriveAccount] Waiting for existing upsert to complete for email: ${normalizedEmail}`);
        return existingLock;
      }
    }

    await aggregatorService.ensureInitialized();

    // Create a promise for this upsert operation (with lock management)
    const lockKey = normalizedEmail || params.backendId;
    const upsertPromise = (async (): Promise<GoogleDriveBackend | null> => {
      try {
        // CRITICAL: Double-check for existing account before creating new backend
        // This prevents race conditions where multiple calls happen simultaneously
        if (normalizedEmail) {
          for (const [existingBackendId, credential] of driveCredentialCacheRef.current.entries()) {
            const existingEmail = credential.email?.toLowerCase();
            if (existingEmail === normalizedEmail && existingBackendId !== params.backendId) {
              console.log(`🔄 [upsertDriveAccount] Found existing account during backend creation, switching to: ${existingBackendId}`);
              params.backendId = existingBackendId;
              params.keyPrefix = credential.keyPrefix;
              break;
            }
          }
        }

        let backend = aggregatorService.getBackend(params.backendId) as GoogleDriveBackend | null;
        if (!backend) {
          // CRITICAL: Final check - don't create if another backend with same email exists
          if (normalizedEmail) {
            for (const [registeredBackendId, registeredBackend] of Array.from(aggregatorService.getAllBackends().entries())) {
              if (registeredBackendId !== params.backendId) {
                const registeredEmail = (registeredBackend as any).getEmail?.()?.toLowerCase();
                if (registeredEmail === normalizedEmail) {
                  console.log(`🔄 [upsertDriveAccount] Found registered backend with same email, using: ${registeredBackendId}`);
                  backend = registeredBackend as GoogleDriveBackend;
                  params.backendId = registeredBackendId;
                  break;
                }
              }
            }
          }

          if (!backend) {
            backend = new GoogleDriveBackend({
              id: params.backendId,
              name: params.email || 'Google Drive',
              storageKeyPrefix: params.keyPrefix,
              apiEndpoint
            });
            aggregatorService.registerBackend(params.backendId, backend);
          }
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

    // CRITICAL: Clean up duplicate cache entries immediately
    cleanupDuplicateCacheEntries();

    purgeDuplicateBackendsForEmail(params.backendId, resolvedEmail ?? existingCredential?.email ?? null);

    const normalizedEmailForCleanup = resolvedEmail?.toLowerCase() ?? existingCredential?.email?.toLowerCase() ?? null;
    const staleBackends: string[] = [];

    if (normalizedEmailForCleanup) {
      for (const account of driveAccounts) {
        // SECURITY: email removed from DriveAccountState - use userEmails map instead
        const accountEmail = userEmails.get(account.backendId);
        if (
          account.backendId !== params.backendId &&
          accountEmail &&
          accountEmail.toLowerCase() === normalizedEmailForCleanup
        ) {
          staleBackends.push(account.backendId);
        }
      }
    }

    staleBackends.forEach((backendId) => unregisterBackend(backendId));

    setUserEmails((prev) => {
      if (!resolvedEmail) {
        return prev;
      }
                    const next = new Map(prev);
      next.set(params.backendId, resolvedEmail);
                    return next;
                  });

    setDriveAccounts((prev) => {
      const filtered = prev.filter(
        (account) =>
          account.backendId !== params.backendId && !staleBackends.includes(account.backendId)
      );

      // SECURITY: Do NOT store email in DriveAccountState - it's sensitive data
      // Email is stored in userEmails Map and encrypted storage only
      const next: DriveAccountState[] = [
        ...filtered,
        {
          backendId: params.backendId,
          keyPrefix: params.keyPrefix,
          // email removed - use userEmails Map or encrypted storage instead
      }
      ];
        persistDriveAccounts(next);
        return next;
      });

      setActiveBackendId(params.backendId);

      return backend;
      } catch (error) {
        console.error('❌ [upsertDriveAccount] Error during upsert:', error);
        throw error;
      } finally {
        // Clear the lock when done
        if (normalizedEmail) {
          upsertLocksRef.current.delete(lockKey);
        }
      }
    })();

    // Store the promise in the lock map
    if (normalizedEmail) {
      upsertLocksRef.current.set(lockKey, upsertPromise);
    }

    return upsertPromise;
  }, [aggregatorService, activeBackendId, apiEndpoint, driveAccounts, userEmails]);

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

  React.useEffect(() => {
    return () => {
      if (hydrationRetryTimeoutRef.current !== null) {
        window.clearTimeout(hydrationRetryTimeoutRef.current);
        hydrationRetryTimeoutRef.current = null;
      }
    };
  }, []);

  // CRITICAL: Track when disconnect happens to prevent immediate re-hydration and re-connection
  const disconnectTimestampRef = React.useRef<number>(0);
  const disconnectedBackendIdsRef = React.useRef<Set<string>>(new Set());
  const DISCONNECT_BLOCK_DURATION_MS = 10000; // Block re-adding disconnected accounts for 10 seconds (reduced from 30s to not block unlock)

  const hydrateStorageCredentialsFromAPI = React.useCallback(async () => {
    if (hydrationInProgressRef.current) {
      return;
    }
    
    // CRITICAL: Don't hydrate for 30 seconds after disconnect
    const timeSinceDisconnect = Date.now() - disconnectTimestampRef.current;
    if (timeSinceDisconnect < DISCONNECT_BLOCK_DURATION_MS) {
      console.log(`⏭️ [StorageCredentials] Hydration BLOCKED - ${timeSinceDisconnect}ms since last disconnect (waiting ${DISCONNECT_BLOCK_DURATION_MS}ms)`);
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

    // CRITICAL: Generate pn identifier if not already available
    // This ensures we always use the standardized identifier
    let pnId = pnIdentifierRef.current;
    if (!pnId || !pnId.startsWith('pn-')) {
      pnId = await getPnIdentifier();
      if (!pnId) {
        console.warn('⚠️ [StorageCredentials] Cannot generate pn identifier for hydration - missing credentials');
        return;
      }
    }
    
    // Use only the pn identifier - no other candidates
    const identityCandidates = [pnId];

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
        // candidateId (identityId) is secret - not logged
        console.debug('📥 [StorageCredentials] Fetching credentials from API...', {
          endpoint: apiEndpoint,
        });

        // CRITICAL: Use ONLY pn identifier - candidateId should already be pn identifier from getStorageIdentityCandidates
        // But double-check it's actually a pn identifier format
        const pnId = candidateId.startsWith('pn-') ? candidateId : null;
        if (!pnId) {
          console.warn(`⚠️ [StorageCredentials] Skipping non-pn identifier candidate: ${candidateId.substring(0, 20)}...`);
          hydrationMissingCandidatesRef.current.add(candidateId);
          continue;
        }
        const response = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pnId)}`);
        if (response.status === 404) {
          hydrationMissingCandidatesRef.current.add(candidateId);
          // candidateId (identityId) is secret - not logged
          // 404 is expected if credentials haven't been stored yet (e.g., user connected before persistence was implemented)
          // User will need to reconnect to store credentials properly
          console.debug('ℹ️ [StorageCredentials] No stored credentials found for identity (404) - user may need to reconnect');
          continue;
        }

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : 30000;
          hydrationRateLimitUntilRef.current = Date.now() + retryAfterMs;
          hydrationRateLimitLoggedRef.current = false;
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] API rate limited hydration; backing off', {
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
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] Failed to fetch credentials from API:', {
            status: response.status,
            error: errorText,
          });
          continue;
        }

        const result = await response.json();
        const payload = result?.credentials;
        if (!payload) {
          // candidateId (identityId) is secret - not logged
          console.warn('⚠️ [StorageCredentials] API returned no credentials payload', {
            endpoint: `${apiEndpoint}/api/storage/credentials/[REDACTED]`,
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

        console.log(`🔍 [StorageCredentials] API returned ${accountsArray.length} account(s) in response`);

        if (accountsArray.length === 0) {
          // candidateId (identityId) is secret - not logged
          console.warn('ℹ️ [StorageCredentials] Credentials payload contained no Google Drive accounts');
          continue;
        }

        // CRITICAL: HARD LIMIT - If API has more than 2 accounts, something is VERY wrong
        // Clear everything and start fresh with only ONE account
        if (accountsArray.length > 2) {
          console.error(`🚨 [StorageCredentials] CRITICAL: API returned ${accountsArray.length} accounts (expected max 2). This is a severe bug. Clearing ALL accounts and starting fresh.`);
          
          // Clear cache completely
          driveCredentialCacheRef.current.clear();
          
          // Clear driveAccounts state
          setDriveAccounts([]);
          persistDriveAccounts([]);
          
          // Clear API storage - send empty array to API
          try {
            // CRITICAL: Use ONLY pn identifier - getStorageIdentityCandidates now returns only pn identifier
            const identityCandidates = getStorageIdentityCandidates();
            const pnId = identityCandidates.length > 0 && identityCandidates[0]?.startsWith('pn-') ? identityCandidates[0] : null;
            if (pnId) {
              await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pnId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  credentials: { googleDriveAccounts: [] },
                  cid: null,
                }),
              }).catch(() => {});
            } else {
              console.warn('⚠️ [StorageCredentials] No pn identifier available for clearing API storage');
            }
            console.log(`✅ [StorageCredentials] Cleared ${accountsArray.length} accounts from API storage`);
          } catch (clearError) {
            console.error('❌ [StorageCredentials] Failed to clear API storage:', clearError);
          }
          
          // Don't hydrate anything - user needs to reconnect manually
          hydrationInProgressRef.current = false;
          return;
        }

        // CRITICAL: Deduplicate accounts BEFORE hydrating - only ONE account per email maximum
        const uniqueAccountsByEmail = new Map<string, typeof accountsArray[0]>();
        const accountsWithoutEmail: typeof accountsArray = [];
        
        for (const account of accountsArray) {
          if (account?.email) {
            const normalizedEmail = account.email.toLowerCase();
            // Only keep ONE account per email - the most recent one
            if (!uniqueAccountsByEmail.has(normalizedEmail)) {
              uniqueAccountsByEmail.set(normalizedEmail, account);
            } else {
              const existing = uniqueAccountsByEmail.get(normalizedEmail)!;
              // Keep the most recent one (by updatedAt or connectedAt)
              if ((account.updatedAt && existing.updatedAt && account.updatedAt > existing.updatedAt) ||
                  (account.connectedAt && existing.connectedAt && account.connectedAt > existing.connectedAt)) {
                uniqueAccountsByEmail.set(normalizedEmail, account);
              }
            }
          } else {
            // Only keep ONE account without email
            if (accountsWithoutEmail.length === 0) {
              accountsWithoutEmail.push(account);
            }
          }
        }
        
        const deduplicatedAccounts = Array.from(uniqueAccountsByEmail.values()).concat(accountsWithoutEmail);
        
        // CRITICAL: Final safety check - if we still have more than 1 account, something is wrong
        if (deduplicatedAccounts.length > 1) {
          console.error(`🚨 [StorageCredentials] After deduplication, still have ${deduplicatedAccounts.length} accounts (expected max 1). Keeping only the first one.`);
          deduplicatedAccounts.length = 1;
        }
        
        console.log(`🔄 [StorageCredentials] Hydrating ${deduplicatedAccounts.length} unique account(s) from ${accountsArray.length} total in API response`);

        // CRITICAL: Only hydrate accounts that aren't already in the cache
        // This prevents re-adding disconnected accounts
        const accountsToHydrate: typeof deduplicatedAccounts = [];
        const currentCacheEmails = new Set<string>();
        
        // Build set of emails already in cache
        for (const [cachedBackendId, cachedCredential] of driveCredentialCacheRef.current.entries()) {
          if (cachedCredential.email) {
            currentCacheEmails.add(cachedCredential.email.toLowerCase());
          }
        }
        
        // Only hydrate accounts that aren't already in cache
        for (const account of deduplicatedAccounts) {
          const email = account?.email || null;
          if (email && currentCacheEmails.has(email.toLowerCase())) {
            console.log(`⏭️ [StorageCredentials] Skipping hydration for ${email} - already in cache`);
            continue;
          }
          accountsToHydrate.push(account);
        }
        
        console.log(`🔄 [StorageCredentials] Actually hydrating ${accountsToHydrate.length} new account(s) (${deduplicatedAccounts.length - accountsToHydrate.length} skipped - already in cache)`);

        // CRITICAL: Before hydrating, check if ANY account with this email already exists in aggregatorService
        // If it does, SKIP hydration entirely - don't create duplicate backends
        const accountsToActuallyHydrate: typeof accountsToHydrate = [];
        const registeredBackends = aggregatorService?.getAllBackends() || new Map();
        
        for (const account of accountsToHydrate) {
          const accountEmail = account?.email?.toLowerCase();
          if (accountEmail) {
            // Check if aggregatorService already has a backend with this email
            let accountExists = false;
            for (const [backendId, backend] of registeredBackends.entries()) {
              if (backend instanceof GoogleDriveBackend) {
                const backendEmail = backend.getEmail()?.toLowerCase();
                if (backendEmail === accountEmail) {
                  console.log(`⏭️ [StorageCredentials] SKIPPING hydration: Account with email ${accountEmail} already exists in aggregatorService (backendId: ${backendId})`);
                  accountExists = true;
                  break;
                }
              }
            }
            if (!accountExists) {
              accountsToActuallyHydrate.push(account);
            }
          } else {
            // Account without email - only hydrate if we have no accounts at all
            if (accountsToActuallyHydrate.length === 0 && registeredBackends.size === 0) {
              accountsToActuallyHydrate.push(account);
            } else {
              console.log(`⏭️ [StorageCredentials] SKIPPING hydration: Account without email (only hydrate if no accounts exist)`);
            }
          }
        }

        console.log(`🔄 [StorageCredentials] After aggregatorService check: Actually hydrating ${accountsToActuallyHydrate.length} account(s) (${accountsToHydrate.length - accountsToActuallyHydrate.length} skipped - already in aggregatorService)`);

        // CRITICAL: Only hydrate ONE account maximum - if API has 500 accounts, we only want ONE
        if (accountsToActuallyHydrate.length > 1) {
          console.error(`🚨 [StorageCredentials] CRITICAL: After all checks, still have ${accountsToActuallyHydrate.length} accounts to hydrate. Keeping only the first one.`);
          accountsToActuallyHydrate.length = 1;
        }

        for (const account of accountsToActuallyHydrate) {
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
        
        // CRITICAL: Don't persist after hydration - auto-persist is disabled
        // Hydration just loads accounts from API, no need to persist back
        
        break;
      } catch (error) {
        lastError = error;
        // candidateId (identityId) is secret - not logged
        console.warn('⚠️ [StorageCredentials] Candidate fetch failed (non-blocking):', {
          error: error?.message || error,
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
    } else {
      // If hydration didn't find accounts in API, check if we have local accounts to persist
      console.log('[StorageCredentials] Hydration complete but no accounts found in API, checking local cache...');
      const cacheEntries = Array.from(driveCredentialCacheRef.current.values());
      if (cacheEntries.length > 0) {
        console.log(`[StorageCredentials] Found ${cacheEntries.length} account(s) in local cache - auto-persist effect will sync to API`);
        // CRITICAL: Don't persist - auto-persist is disabled
        // Accounts are loaded from cache, no need to persist
      }
    }
  }, [apiEndpoint, resolvedAuth?.publicKey, resolvedAuth?.pnName, authenticatedUser?.id, authenticatedUser?.pnName, authenticatedUser?.publicKey, upsertDriveAccount, persistStorageCredentialsToAPI]);

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
    if (!authenticatedUser?.id) {
      return;
    }
    
    // Wait for getStorageIdentityCandidates to be ready (it depends on pnIdentifier)
    // Don't call it during useEffect initialization - call it inside the async function
    const loadTokenFromMetadata = async () => {
      // Wait for pn identifier to be ready (with retry mechanism)
      let retries = 0;
      const maxRetries = 10;
      while (!pnIdentifierRef.current && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }
      
      // Call getStorageIdentityCandidates here, not during useEffect initialization
      // This ensures pnIdentifier is ready when accessed
      const candidates = getStorageIdentityCandidates();
      const identityId = candidates.length > 0 ? candidates[0] : null;
      if (!authenticatedUser?.id || !identityId) {
        // Only log warning if we've waited and still don't have it
        if (retries >= maxRetries) {
          console.warn('⚠️ [loadTokenFromMetadata] Missing authenticated identity details after waiting', {
          hasAuthenticatedUser: !!authenticatedUser,
          hasId: !!authenticatedUser?.id,
          identityId,
            pnIdentifierReady: pnIdentifierRef.current !== null,
        });
        }
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
        // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const passcode = getPasscodeFromSecureStorage(sessionId);

        // CRITICAL: Ensure pn identifier is generated BEFORE hydration
        // This prevents hydration from using public key/DID/pn name
        if (!pnIdentifierRef.current || !pnIdentifierRef.current.startsWith('pn-')) {
          const pnId = await getPnIdentifier();
          if (!pnId) {
            console.warn('⚠️ [handleConnectGoogleDrive] Cannot generate pn identifier - skipping hydration');
          } else {
            pnIdentifierRef.current = pnId;
          }
        }

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

        // CRITICAL: Don't persist during load - auto-persist is disabled
        // Loading just restores accounts from metadata, no need to persist back

        // CRITICAL: Deduplicate accounts BEFORE loading to prevent duplicates
        const uniqueCredsByEmail = new Map<string, typeof credsArray[0]>();
        const credsWithoutEmail: typeof credsArray = [];
        
        for (const creds of credsArray) {
          if (creds?.email) {
            const normalizedEmail = creds.email.toLowerCase();
            const existing = uniqueCredsByEmail.get(normalizedEmail);
            if (!existing) {
              uniqueCredsByEmail.set(normalizedEmail, creds);
            }
          } else {
            credsWithoutEmail.push(creds);
          }
        }
        
        const deduplicatedCreds = Array.from(uniqueCredsByEmail.values()).concat(credsWithoutEmail);
        
        if (deduplicatedCreds.length !== credsArray.length) {
          console.log(`🔄 [loadTokenFromMetadata] Deduplicated ${credsArray.length} accounts to ${deduplicatedCreds.length} unique accounts`);
        }

        for (const creds of deduplicatedCreds) {
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
      // pnName is secret - not logged
      console.log('🔍 [FileStorageAggregator] authenticatedUser prop received');
      
      // Try prop first
      if (authenticatedUser) {
        // Safely get keys without breaking if object has getters
        try {
          // pnName is secret - not logged
          console.log('🔍 [FileStorageAggregator] authenticatedUser keys:', Object.keys(authenticatedUser).filter(k => k !== 'pnName' && k !== 'passcode'));
          // pnName and passcode are secrets - not logged
          const sanitizedUser = { ...authenticatedUser };
          delete (sanitizedUser as any).pnName;
          delete (sanitizedUser as any).passcode;
          console.log('🔍 [FileStorageAggregator] authenticatedUser structure:', {
            id: authenticatedUser.id,
            hasPnName: !!authenticatedUser.pnName,
            publicKey: authenticatedUser.publicKey,
            nickname: authenticatedUser.nickname,
            username: (authenticatedUser as any).username,
            name: (authenticatedUser as any).name,
            sanitizedObject: JSON.stringify(sanitizedUser, null, 2)
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
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          passcode = getPasscodeFromSecureStorage(sessionId);
          console.log('🔍 [FileStorageAggregator] Passcode from SecureCredentialManager:', passcode ? 'found' : 'not found');
        } catch (e) {
          console.warn('🔍 [FileStorageAggregator] SecureCredentialManager not available');
        }
        
        const authToken = authenticatedUser?.authToken;
        
        if (pnName && publicKey) {
          console.log('✅ [FileStorageAggregator] Auth resolved from prop:', { hasPnName: !!pnName, publicKey: publicKey.substring(0, 20) + '...' });
          setResolvedAuth((prev) => ({
            pnName,
            publicKey,
            passcode: passcode || prev?.passcode,
            authToken: authToken || prev?.authToken,
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
          const sessionAuthToken = (session as any).authToken;
          
          console.log('🔍 [FileStorageAggregator] Extracted from storage:', { hasPnName: !!pnName, publicKey: publicKey.substring(0, 20) + '...', sessionKeys: Object.keys(session) });
          
          let passcode: string | null = null;
          try {
            // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
            passcode = getPasscodeFromSecureStorage(sessionId);
          } catch (e) {
            // SecureCredentialManager might not be available
          }
          
          if (pnName && publicKey) {
            console.log('✅ [FileStorageAggregator] Auth resolved from storage');
            setResolvedAuth((prev) => ({
              pnName,
              publicKey,
              passcode: passcode || prev?.passcode,
              authToken: sessionAuthToken || prev?.authToken,
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
    // No-op: legacy effect retained for backward compatibility
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
            let pnIdentifier: string | undefined;
            
            // Use VolumeIdGenerator for consistent pnIdentifier generation (same as desktop app)
            try {
              const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              if (resolvedAuth?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: resolvedAuth.pnName,
                  passcode: credentials.passcode,
                  publicKey: resolvedAuth.publicKey
                });
                console.log(`✅ [Metadata] Generated pN identifier (VolumeIdGenerator): ${pnIdentifier}`);
                console.log(`📁 [Metadata] Expected folder: "par Noir - ${pnIdentifier}"`);
                
                // Also log fallback for comparison
                if (pnIdentifierRef.current) {
                  // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
                  const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
                  if (fallbackId !== pnIdentifier) {
                    console.warn(`⚠️ [Metadata] Identifier mismatch! Correct: ${pnIdentifier}, Fallback: ${fallbackId}`);
                    console.warn(`⚠️ [Metadata] Using CORRECT identifier: ${pnIdentifier}`);
                  }
                }
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
            
            // AUTOMATIC CLEANUP: Verify files exist in Google Drive and remove orphaned entries
            // Google Drive is the source of truth - if file doesn't exist there, remove from all indexes
            try {
              const cleanupResult = await GoogleDriveMetadataService.cleanupOrphanedIndexEntries(token, pnIdentifier);
              if (cleanupResult.ownerIndexRemoved > 0 || cleanupResult.publicIndexRemoved > 0) {
                console.log(`✅ [Metadata] Cleaned up indexes: removed ${cleanupResult.ownerIndexRemoved} from owner index, ${cleanupResult.publicIndexRemoved} from public index`);
              }
            } catch (cleanupError) {
              console.warn('⚠️ [Metadata] Failed to cleanup orphaned index entries (non-critical):', cleanupError);
            }
            
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
            // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
            passcode = getPasscodeFromSecureStorage(sessionId);
          } catch (e) {
            // Ignore SecureCredentialManager errors
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
                  // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
                  const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
                  passcode = getPasscodeFromSecureStorage(sessionId);
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
          console.log(`✅ [loadFiles] Generated pN identifier (VolumeIdGenerator): ${currentPnIdentifier}`);
          console.log(`📁 [loadFiles] Expected folder name: "par Noir - ${currentPnIdentifier}"`);
          
          // Also log the fallback identifier for comparison
          if (pnIdentifierRef.current) {
            // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
            const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
            console.log(`ℹ️ [loadFiles] Fallback identifier (did:publicKey): ${fallbackId}`);
            if (fallbackId !== currentPnIdentifier) {
              console.warn(`⚠️ [loadFiles] Identifier mismatch! VolumeIdGenerator: ${currentPnIdentifier}, Fallback: ${fallbackId}`);
              console.warn(`⚠️ [loadFiles] Using VolumeIdGenerator identifier (${currentPnIdentifier}) - this is the correct one`);
            }
          }
        } else {
          console.log(`⚠️ [loadFiles] Cannot generate pN identifier (missing: ${!pnName ? 'pnName ' : ''}${!publicKey ? 'publicKey ' : ''}${!passcode ? 'passcode' : ''}) - backend will search for folders directly`);
        }
      } catch (err) {
        console.warn('⚠️ [loadFiles] Failed to generate pN identifier:', err);
      }
      
      // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
      // If we don't have credentials, we cannot generate the identifier
      // This ensures consistency - same credentials always produce same identifier
      if (!currentPnIdentifier) {
        console.warn('⚠️ [loadFiles] Cannot generate standardized pN identifier - credentials required');
        console.warn('⚠️ [loadFiles] Files may not be found until credentials are available');
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
        const accountForBackend =
          driveAccounts.find((account) => account.backendId === backendId) || null;
        const keyPrefix =
          accountForBackend?.keyPrefix ||
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
          
          // IMPORTANT: Always scan Google Drive to verify files exist before using owner index entries
          // This prevents showing orphaned files that were deleted from Drive but remain in the index
          let scannedFiles: any[] = [];
          try {
            scannedFiles = await backend.listFiles(undefined, currentPnIdentifier);
            console.debug('✅ [loadFiles] Scanned Google Drive to verify file existence', {
              backendId,
              scannedCount: scannedFiles.length,
              ownerIndexCount: ownerIndex.files.length
            });
          } catch (scanError) {
            console.warn('⚠️ [loadFiles] Failed to scan Drive for orphaned file cleanup (non-blocking)', {
              backendId,
              error: scanError,
            });
            // Continue with owner index entries if scan fails (better than showing nothing)
          }

          // Create a set of file IDs that actually exist in Google Drive
          const existingFileIds = new Set(scannedFiles.map((f: any) => f.id));
          
          filesForBackend = ownerIndex.files
            .filter((entry: any) => {
              // Filter out orphaned entries that don't exist in Google Drive
              const googleDriveFileId = entry.googleDriveFileId;
              if (googleDriveFileId && !existingFileIds.has(googleDriveFileId)) {
                console.debug('🗑️ [loadFiles] Filtering out orphaned file from files list', {
                  backendId,
                  fileId: googleDriveFileId,
                  fileName: entry.fileName || entry.originalName
                });
                return false;
              }
              return true;
            })
            .map((entry: any) => {
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

          // Process metadata from owner index, filtering out orphaned entries
          // Reuse existingFileIds from above
          const orphanedEntries: any[] = [];

          ownerIndex.files.forEach((entry: any) => {
            const googleDriveFileId = entry.googleDriveFileId;
            
            // Skip entries that don't exist in Google Drive (orphaned)
            if (googleDriveFileId && !existingFileIds.has(googleDriveFileId)) {
              orphanedEntries.push(entry);
              console.debug('🗑️ [loadFiles] Filtering out orphaned file from owner index', {
                backendId,
                fileId: googleDriveFileId,
                fileName: entry.fileName || entry.originalName
              });
              return; // Skip this entry
            }

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

          // Log orphaned entries found and clean them up
          if (orphanedEntries.length > 0) {
            console.warn(`⚠️ [loadFiles] Found ${orphanedEntries.length} orphaned file(s) in owner index for ${backendId}`, {
              orphanedFiles: orphanedEntries.map(e => ({
                fileId: e.googleDriveFileId,
                fileName: e.fileName || e.originalName
              }))
            });
            
            // Automatically clean up orphaned entries from indexes
            // Google Drive is the source of truth - if file doesn't exist there, remove from all indexes
            try {
              if (accessToken && currentPnIdentifier) {
                const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
                const cleanupResult = await GoogleDriveMetadataService.cleanupOrphanedIndexEntries(
                  accessToken,
                  currentPnIdentifier
                );
                if (cleanupResult.ownerIndexRemoved > 0 || cleanupResult.publicIndexRemoved > 0) {
                  console.log(`✅ [loadFiles] Cleaned up indexes: removed ${cleanupResult.ownerIndexRemoved} from owner index, ${cleanupResult.publicIndexRemoved} from public index`);
                  // Reload files after cleanup to show updated list
                  if (loadFilesRef.current) {
                    setTimeout(() => loadFilesRef.current!(), 1000);
                  }
                }
              }
            } catch (cleanupError) {
              console.warn('⚠️ [loadFiles] Failed to cleanup orphaned index entries:', cleanupError);
            }
          }
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
  }, [aggregatorService, authenticatedUser, resolvedAuth, driveAccounts, loadFileMetadata, scheduleTokenRetry]);

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
        // Get pN identifier for metadata folder location (use VolumeIdGenerator for consistency)
        let metadataPnIdentifier: string | undefined = undefined;
        try {
          const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
          const sessionId = authenticatedUser?.id;
          const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          
          if (resolvedAuth?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
            // Use VolumeIdGenerator for consistent identifier (same as folder naming)
            metadataPnIdentifier = await VolumeIdGenerator.generateVolumeId({
              pnName: resolvedAuth.pnName,
              passcode: credentials.passcode,
              publicKey: resolvedAuth.publicKey
            });
            console.log('📁 [Phase 3] Generated pN identifier (standardized):', metadataPnIdentifier);
          } else {
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            console.warn('⚠️ [Phase 3] Cannot generate standardized pN identifier - credentials required');
            console.warn('⚠️ [Phase 3] Metadata indexing skipped - credentials must be available');
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

        // CRITICAL: Also call PUT endpoint to explicitly update isPublic in database
        // This ensures the database is updated even if POST didn't properly update existing entry
        try {
          const targetFileId = publicMetadata.fileId || file.backendFileId || file.id;
          console.log('🔄 [Phase 3] Updating isPublic via PUT endpoint...', { targetFileId, isPublic: publicMetadata.isPublic });
          
          const { retry: retryHelper } = await import('../../utils/helpers');
          const putResponse = await retryHelper(
            async () => {
              const res = await fetch(
                `${apiEndpoint}/api/aggregator/metadata-index/${encodeURIComponent(targetFileId)}${authenticatedUser?.accessToken ? `?accountId=${encodeURIComponent(file.backend || '')}` : ''}`,
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

              if (!res.ok) {
                const errorText = await res.text().catch(() => res.statusText);
                throw new Error(`PUT failed: ${res.status} - ${errorText}`);
              }

              return res;
            },
            3, // maxAttempts
            2000 // baseDelay (2 seconds)
          );
          
          const putResult = await putResponse.json();
          console.log('✅ [Phase 3] PUT endpoint updated isPublic successfully', putResult);
        } catch (putError) {
          console.error('❌ [Phase 3] Failed to update isPublic via PUT endpoint (non-critical):', putError);
          // Non-critical - POST should have handled it, but log for debugging
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
              const accessToken = typeof backend.getAccessToken === 'function' 
                ? backend.getAccessToken() 
                : (backend as any).token;
              
              console.log('🔍 [Phase 3] Access token check:', {
                hasAccessToken: !!accessToken,
                tokenLength: accessToken ? accessToken.length : 0
              });
              
              if (accessToken) {
                const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
                
                // Get or create companion metadata file to ensure it exists
                const companionMetadata: CompanionMetadata = {
                  fileId: file.id,
                  googleDriveFileId: file.backendFileId || file.id,
                  fileName: file.name,
                  originalName: file.originalName || file.name.replace('.encrypted', ''),
                  mimeType: file.mimeType || 'application/octet-stream',
                  size: parseInt(file.size || '0', 10),
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
                
                console.log('📝 [Phase 3] Creating/updating companion metadata file...', {
                  fileId: companionMetadata.fileId,
                  googleDriveFileId: companionMetadata.googleDriveFileId,
                  fileName: companionMetadata.fileName,
                  visibility: companionMetadata.visibility
                });
                
                // Ensure companion metadata file exists
                await GoogleDriveMetadataService.createCompanionMetadataFile(
                  accessToken,
                  metadataPnIdentifier,
                  companionMetadata
                );
                
                console.log('✅ [Phase 3] Companion metadata file created/updated successfully');
                
                // Also update owner index to ensure file is tracked
                try {
                  await GoogleDriveMetadataService.updateOwnerFileIndex(
                    accessToken,
                    metadataPnIdentifier,
                    companionMetadata
                  );
                  console.log('✅ [Phase 3] Owner index updated successfully');
                } catch (ownerIndexError) {
                  console.warn('⚠️ [Phase 3] Failed to update owner index (non-critical):', ownerIndexError);
                }
                
                // Update public index file - this adds the file to public-file-index.json
                console.log('📝 [Phase 3] Updating public index file...');
                await GoogleDriveMetadataService.updatePublicFileIndex(
                  accessToken,
                  metadataPnIdentifier,
                  companionMetadata
                );
                
                console.log('✅ [Phase 3] Google Drive public index file updated successfully');
                setSuccessMessage('File made public and added to public index!');
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
          // Retry on 429 (rate limit) errors with exponential backoff
          const { retry: retryHelper } = await import('../../utils/helpers');
          
          const response = await retryHelper(
            async () => {
              const res = await fetch(
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
                console.log(`[Security] Removed localStorage key containing email: ${key}`);
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
            if (credentials && credentials.email) {
              const identifiers = resolveIdentifiersForEmail(credentials.email);
          await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
                token: credentials.accessToken,
                refreshToken: credentials.refreshToken,
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
                token = credentials.accessToken;
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

      // SECURITY: Do not store refresh token in plaintext localStorage
      // Token is stored in encrypted storage via IntegrationCredentialManager above

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
      
      // Find the account to get its email for metadata removal
      const accountToRemove = driveAccounts.find(acc => acc.backendId === backendId);
      const accountEmail = accountToRemove?.email || userEmails.get(backendId) || null;
      
      const backend = aggregatorService.getBackend(backendId);
      if (backend) {
        // Disconnect the backend (clears tokens, etc.)
        await backend.disconnect();
        console.log(`✅ [handleDisconnect] Backend ${backendId} disconnected`);
      }
      
      // CRITICAL: Mark disconnect timestamp and backendId to prevent immediate re-connection
      disconnectTimestampRef.current = Date.now();
      disconnectedBackendIdsRef.current.add(backendId);
      
      // Remove account from state FIRST (before updating API/metadata)
      // This ensures buildStorageCredentialPayload() excludes the removed account
      removeDriveAccount(backendId);
      console.log(`✅ [handleDisconnect] Account ${backendId} removed from dashboard state and blocked for ${DISCONNECT_BLOCK_DURATION_MS}ms`);
      
      // Remove account from encrypted metadata storage
      // This prevents it from being restored after lock/unlock
      if (authenticatedUser?.id && accountEmail) {
        try {
          const { SecureMetadataStorage } = await import('../../utils/secureMetadataStorage');
          const { SecureMetadataCrypto } = await import('../../utils/secureMetadata');
          
          const effectivePnName =
            authenticatedUser?.pnName ||
            resolvedAuth?.pnName ||
            (authenticatedUser as any)?.username ||
            (authenticatedUser as any)?.name ||
            null;
          
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
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
                
                console.log(`✅ [handleDisconnect] Removed account ${accountEmail} from encrypted metadata`);
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
          try {
            // Send current payload (may be empty if all accounts disconnected)
            // CRITICAL: Always send the deduplicated payload, even if it's empty
            const response = await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pnId)}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  credentials: payload || { googleDriveAccounts: [] },
                  cid: null,
                }),
              });
              
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
          await fetch(`${apiEndpoint}/api/storage/credentials/${encodeURIComponent(pnId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              credentials: payload || { googleDriveAccounts: [] },
              cid: null,
            }),
          });
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
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          sessionPasscode = getPasscodeFromSecureStorage(sessionId);
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
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          sessionPasscode = getPasscodeFromSecureStorage(sessionId);
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
      // Use VolumeIdGenerator for consistency across all implementations (desktop, web, etc.)
      // Format: pn-{12-char-hex-hash} from pnName:passcode:publicKey
      let pnIdentifier: string;
      try {
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // Get pnName from resolvedAuth or authenticatedUser
        const pnName = resolvedAuth?.pnName || authenticatedUser?.pnName || (authenticatedUser as any)?.username;
        
        if (pnName && credentials?.passcode && publicKey) {
          // Use VolumeIdGenerator for consistent identifier (same as desktop app)
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode: credentials.passcode,
            publicKey
          });
          console.log(`✅ [Upload] Generated pN identifier (VolumeIdGenerator): ${pnIdentifier}`);
          console.log(`📁 [Upload] Will use folder: "par Noir - ${pnIdentifier}"`);
          
          // Also log the fallback identifier for comparison
          if (pnIdentifierRef.current) {
            // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
            const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
            console.log(`ℹ️ [Upload] Fallback identifier (did:publicKey): ${fallbackId}`);
            if (fallbackId !== pnIdentifier) {
              console.warn(`⚠️ [Upload] Identifier mismatch! VolumeIdGenerator: ${pnIdentifier}, Fallback: ${fallbackId}`);
              console.warn(`⚠️ [Upload] Using VolumeIdGenerator identifier (${pnIdentifier}) - this is the CORRECT one`);
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
          ...(authenticatedUser?.accessToken && {
            'Authorization': `Bearer ${authenticatedUser.accessToken}`
          })
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
            // Generate stable pN identifier using VolumeIdGenerator for consistency
            let pnIdentifier: string | undefined;
            try {
              const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
              
              if (resolvedAuth?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: resolvedAuth.pnName,
                  passcode: credentials.passcode,
                  publicKey: resolvedAuth.publicKey
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

  const handleSetProfileImage = async (file: AggregatedFile) => {
    if (!authenticatedUser?.id) {
      setError('Please unlock your pN first');
      return;
    }

    // Check if file is an image
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
    
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

      const accessToken = authenticatedUser?.accessToken;
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const response = await fetch(`${apiEndpoint}/api/profile/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userDid: authenticatedUser.id,
          fileId: fileId
        })
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

  const handleDelete = async (file: AggregatedFile) => {
    if (!file.backendFileId) {
      setError('Cannot delete file: missing file ID');
      return;
    }

    // Confirm deletion
    const confirmed = window.confirm(`Are you sure you want to delete "${file.originalName || file.name}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
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

      console.log('🗑️ [Delete] Deleting file from backend...', {
        fileId: file.backendFileId,
        fileName: file.name,
        backend: file.backend
      });

      // Delete file from Google Drive using backend
      await backend.deleteFile(file.backendFileId);

      console.log('✅ [Delete] File deleted from Google Drive successfully');

      // Try to update indexes via API (non-critical, handles errors gracefully)
      const accessToken = authenticatedUser?.accessToken;
      if (accessToken) {
        const account = driveAccounts.find(acc => acc.backendId === file.backend);
        const accountId = account?.accountId || account?.backendId;
        const accountIdParam = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';

        try {
          // Call API to update owner/public indexes
          // This may fail with 401 if token is invalid, but that's okay - file is already deleted
          const response = await fetch(`${apiEndpoint}/api/drive/files/${file.backendFileId}${accountIdParam}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const result = await response.json().catch(() => ({}));
            console.log('✅ [Delete] Indexes updated successfully', result);
          } else if (response.status === 401) {
            // Token expired - but API should still remove from database
            // Try to parse response to see if database removal succeeded
            try {
              const result = await response.json().catch(() => ({}));
              if (result.removedFromDatabase) {
                console.log('✅ [Delete] File removed from database (token expired but cleanup succeeded)');
              } else {
                console.warn('⚠️ [Delete] Token expired - attempting direct database removal...');
                // Fallback: Try to remove from database directly via metadata-index endpoint
                try {
                  const dbResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${file.backendFileId}`, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': `Bearer ${accessToken}` // Still try with expired token
                    }
                  });
                  if (dbResponse.ok) {
                    console.log('✅ [Delete] File removed from database via fallback endpoint');
                  }
                } catch (fallbackError) {
                  console.warn('⚠️ [Delete] Fallback database removal also failed:', fallbackError);
                }
              }
            } catch (parseError) {
              console.warn('⚠️ [Delete] Could not parse response (token expired) - file deleted but database may need manual cleanup');
            }
          } else {
            const errorText = await response.text().catch(() => 'Unknown error');
            console.warn('⚠️ [Delete] Index cleanup failed (non-critical):', errorText);
          }
        } catch (indexError) {
          console.warn('⚠️ [Delete] Index cleanup failed (non-critical):', indexError);
          // File is already deleted, so this is not a critical error
        }
      } else {
        console.warn('⚠️ [Delete] No access token available - file deleted but indexes may need manual cleanup');
      }

      // AUTOMATIC CLEANUP: Clean up indexes after deletion
      // Google Drive is the source of truth - file is deleted, remove from all indexes
      // NOTE: This cleanup is non-critical - database is already cleaned up by API
      // Only run if we have a valid token (skip if expired to avoid errors)
      try {
        if (accessToken) {
          // Check if token is likely expired by trying a simple Google Drive API call first
          // This prevents unnecessary cleanup attempts with expired tokens
          let tokenValid = false;
          try {
            const testResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            tokenValid = testResponse.ok;
          } catch {
            tokenValid = false;
          }
          
          if (!tokenValid) {
            console.log('ℹ️ [Delete] Token expired - skipping Google Drive index cleanup (database already cleaned)');
            return; // Skip cleanup if token is invalid
          }
          
          // Generate pN identifier for cleanup
          let pnIdentifierForCleanup: string | undefined = undefined;
          try {
            const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
            const sessionId = authenticatedUser?.id;
            const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
            
            if (resolvedAuth?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
              pnIdentifierForCleanup = await VolumeIdGenerator.generateVolumeId({
                pnName: resolvedAuth.pnName,
                passcode: credentials.passcode,
                publicKey: resolvedAuth.publicKey
              });
            }
          } catch (idError) {
            console.warn('⚠️ [Delete] Failed to generate pN identifier for cleanup:', idError);
          }
          
          if (pnIdentifierForCleanup) {
            const { GoogleDriveMetadataService } = await import('../../services/storage/GoogleDriveMetadataService');
            const cleanupResult = await GoogleDriveMetadataService.cleanupOrphanedIndexEntries(
              accessToken,
              pnIdentifierForCleanup
            );
            if (cleanupResult.ownerIndexRemoved > 0 || cleanupResult.publicIndexRemoved > 0) {
              console.log(`✅ [Delete] Cleaned up indexes: removed ${cleanupResult.ownerIndexRemoved} from owner index, ${cleanupResult.publicIndexRemoved} from public index`);
            }
          } else {
            console.warn('⚠️ [Delete] Cannot generate pN identifier for cleanup - skipping index cleanup');
          }
        }
      } catch (cleanupError) {
        // Cleanup is non-critical - database is already cleaned, Google Drive indexes are secondary
        console.log('ℹ️ [Delete] Index cleanup skipped (non-critical):', cleanupError instanceof Error ? cleanupError.message : cleanupError);
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
      lastDesktopAuthStateRef.current = 'locked';
      lastDesktopPayloadRef.current = null;
      return;
    }

    const hasAuth = Boolean(resolvedAuth?.pnName && resolvedAuth?.publicKey && resolvedAuth?.authToken);

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
        const { VolumeIdGenerator } = await import('../../utils/crypto/volumeIdGenerator');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        if (resolvedAuth?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName: resolvedAuth.pnName,
            passcode: credentials.passcode,
            publicKey: resolvedAuth.publicKey
          });
          console.log('[DesktopUnlock] Generated pN identifier (standardized):', pnIdentifier);
        } else {
          console.warn('[DesktopUnlock] Cannot generate standardized pN identifier - credentials required');
        }
      } catch (err) {
        console.error('[DesktopUnlock] Failed to generate standardized pN identifier:', err);
      }

      if (disposed) {
        return;
      }

      const payload: DesktopUnlockPayload = {
        pnName: resolvedAuth.pnName,
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

        <button
          onClick={async () => {
            try {
              // Fetch latest release from GitHub API
              const response = await fetch('https://api.github.com/repos/bymjmazzei/par-Noir/releases/latest');
              if (!response.ok) {
                throw new Error('Failed to fetch release info');
              }
              
              const release = await response.json();
              const assets = release.assets || [];
              
              // Detect platform
              const platform = navigator.platform.toLowerCase();
              let downloadUrl: string | null = null;
              
              // Find appropriate asset based on platform
              if (platform.includes('mac') || platform.includes('darwin')) {
                // macOS - look for DMG file
                const dmgAsset = assets.find((asset: any) => 
                  asset.name.includes('.dmg') && !asset.name.includes('blockmap')
                );
                downloadUrl = dmgAsset?.browser_download_url || null;
              } else if (platform.includes('win')) {
                // Windows - look for exe file
                const exeAsset = assets.find((asset: any) => 
                  asset.name.includes('.exe') || asset.name.includes('win')
                );
                downloadUrl = exeAsset?.browser_download_url || null;
              } else {
                // Linux - look for AppImage or tar.gz
                const linuxAsset = assets.find((asset: any) => 
                  asset.name.includes('.AppImage') || 
                  asset.name.includes('.tar.gz') || 
                  asset.name.includes('linux')
                );
                downloadUrl = linuxAsset?.browser_download_url || null;
              }
              
              if (downloadUrl) {
                // Create a temporary anchor element to trigger download
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = downloadUrl.split('/').pop() || 'par-Noir-Desktop';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              } else {
                // No matching asset found, open releases page
                window.open(release.html_url, '_blank');
              }
            } catch (error) {
              console.error('Failed to download desktop app:', error);
              // Fallback to GitHub releases page
              window.open('https://github.com/bymjmazzei/par-Noir/releases/latest', '_blank');
            }
          }}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors ml-4"
        >
          <Download className="h-4 w-4" />
          <span>Download Desktop App</span>
        </button>
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
            // SECURITY: email removed from DriveAccountState - use userEmails map instead
            const email = userEmails.get(backendId) || `Drive ${index + 1}`;
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
                                    {/* Set as Profile Image - only for image files */}
                                    {(() => {
                                      const mimeType = file.mimeType || '';
                                      const fileName = file.originalName || file.name || '';
                                      const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
                                      return isImage ? (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuFor(null);
                                            actionMenuRef.current = null;
                                            handleSetProfileImage(file);
                                          }}
                                          className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                          disabled={isLoading}
                                        >
                                          <UserCircle className="h-4 w-4" />
                                          <span>Set as Profile Image</span>
                                        </button>
                                      ) : null;
                                    })()}
                                    <div className="border-t border-neutral-700 my-1"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenMenuFor(null);
                                        actionMenuRef.current = null;
                                        handleDelete(file);
                                      }}
                                      className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                                      disabled={isLoading}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>Delete</span>
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
                                  {/* Set as Profile Image - only for image files */}
                                  {(() => {
                                    const mimeType = file.mimeType || '';
                                    const fileName = file.originalName || file.name || '';
                                    const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
                                    return isImage ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenMenuFor(null);
                                          actionMenuRef.current = null;
                                          handleSetProfileImage(file);
                                        }}
                                        className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
                                        disabled={isLoading}
                                      >
                                        <UserCircle className="h-4 w-4" />
                                        <span>Set as Profile Image</span>
                                      </button>
                                    ) : null;
                                  })()}
                                  <div className="border-t border-neutral-700 my-1"></div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuFor(null);
                                      actionMenuRef.current = null;
                                      handleDelete(file);
                                    }}
                                    className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                                    disabled={isLoading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span>Delete</span>
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
                  {sharingFile.encrypted ? sharingFile.originalName : sharingFile.name}
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
                        onClick={() => setShareVisibility(option)}
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


