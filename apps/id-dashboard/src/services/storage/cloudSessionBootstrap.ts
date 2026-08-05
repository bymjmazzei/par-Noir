/**
 * Unlock-time cloud session bootstrap: warm sealed Drive secrets, ensure layout,
 * register backends on the shared FileAggregatorService, prefetch owner-index.
 * Storage tab consumes this; it must not be the place capability is created.
 */

import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { loadLocalCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../../config/api';
import { getFileAggregatorService } from '../aggregator/FileAggregatorService';
import { GoogleDriveBackend } from './GoogleDriveBackend';
import { ownerGet } from '../ownerApiService';
import { resolveLocalGoogleAccessTokenAsync } from '../deviceApiService';
import { requireOwnerApiToken } from '../ownerApiToken';

export type CloudSessionStatus = 'idle' | 'loading' | 'ready' | 'needs_reconnect' | 'error';

export interface CloudSessionBootstrapResult {
  status: CloudSessionStatus;
  error?: string;
}

const readyPnIds = new Set<string>();
const inFlight = new Map<string, Promise<CloudSessionBootstrapResult>>();
let lastStatus: CloudSessionStatus = 'idle';
let lastError: string | undefined;

type AccountsCacheEntry = {
  accounts: Array<{ provider: string; accountId: string; [k: string]: unknown }>;
  socialCloudProvider: string | null;
};

const accountsCache = new Map<string, AccountsCacheEntry>();

export function getStorageAccountsCache(pnIdentifier: string | null | undefined): AccountsCacheEntry | null {
  if (!pnIdentifier) return null;
  return accountsCache.get(pnIdentifier) ?? null;
}

function setStorageAccountsCache(pnIdentifier: string, entry: AccountsCacheEntry): void {
  accountsCache.set(pnIdentifier, entry);
}

export function isCloudSessionReady(pnIdentifier: string | null | undefined): boolean {
  if (!pnIdentifier) return false;
  return readyPnIds.has(pnIdentifier);
}

export function getCloudSessionStatus(): { status: CloudSessionStatus; error?: string } {
  return { status: lastStatus, error: lastError };
}

function dispatchReady(): void {
  try {
    window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
  } catch {
    /* non-DOM */
  }
}

function accountToken(acct: {
  accessToken?: string;
  access_token?: string;
}): string | null {
  const t = acct.accessToken || acct.access_token;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

async function registerBackendsFromEnvelope(
  pnIdentifier: string,
  envelope: StorageCredentialsEnvelope,
  apiToken: string,
  sessionId: string
): Promise<void> {
  const aggregator = getFileAggregatorService();
  await aggregator.ensureInitialized();

  const accounts = envelope.googleDriveAccounts ?? [];
  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i]!;
    const token = accountToken(acct);
    if (!token) continue;
    const backendId =
      (typeof acct.backendId === 'string' && acct.backendId) ||
      `google-drive-${acct.accountId || acct.email || i}`;
    const keyPrefix =
      (typeof acct.keyPrefix === 'string' && acct.keyPrefix) || `gd_${backendId}`;

    let backend = aggregator.getBackend(backendId) as GoogleDriveBackend | null;
    if (!backend) {
      backend = new GoogleDriveBackend({
        id: backendId,
        name: acct.email || 'Google Drive',
        storageKeyPrefix: keyPrefix,
        apiEndpoint: API_ENDPOINT,
        getOwnerApiToken: () => {
          try {
            return requireOwnerApiToken(pnIdentifier);
          } catch {
            return apiToken;
          }
        }
      });
      aggregator.registerBackend(backendId, backend);
    }
    await backend.connect({
      token,
      refreshToken: acct.refreshToken || acct.refresh_token || undefined,
      email: acct.email || undefined,
      sessionId,
      expiresAt: typeof acct.expires_at === 'number' ? acct.expires_at : undefined
    });
    try {
      await backend.ensureAccessToken?.();
    } catch {
      /* refresh best-effort */
    }
  }

  // Portable non-Google accounts from layout API
  try {
    const res = await ownerGet(
      apiToken,
      `/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`,
      { pnIdentifier }
    );
    if (res.ok) {
      const data = (await res.json()) as {
        accounts?: Array<{ provider: string; accountId: string }>;
        socialCloudProvider?: string;
        primaryProvider?: string;
      };
      const accounts = data.accounts ?? [];
      setStorageAccountsCache(pnIdentifier, {
        accounts,
        socialCloudProvider: data.socialCloudProvider ?? data.primaryProvider ?? null
      });
      const portable = accounts.filter((a) => a.provider !== 'google_drive');
      const { PortableBlobBackend } = await import('./PortableBlobBackend');
      for (const acct of portable) {
        const backendId = `${acct.provider}::${acct.accountId}`;
        if (!aggregator.getBackend(backendId)) {
          aggregator.registerBackend(
            backendId,
            new PortableBlobBackend(pnIdentifier, apiToken, acct.provider, acct.accountId)
          );
        }
      }
    }
  } catch {
    /* non-fatal */
  }
}

async function ensureDriveLayout(pnIdentifier: string, apiToken: string): Promise<boolean> {
  const cloudTok = await resolveLocalGoogleAccessTokenAsync(pnIdentifier);
  if (!cloudTok) return false;

  const initRes = await fetch(
    `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/initialize/${encodeURIComponent(pnIdentifier)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'X-PN-Cloud-Access-Token': cloudTok,
        'Content-Type': 'application/json'
      },
      body: '{}'
    }
  );
  // 200 or already-initialized success; do not probe owner-index here (avoids red 409 in console).
  return initRes.ok;
}

async function prefetchOwnerIndex(pnIdentifier: string, apiToken: string): Promise<void> {
  try {
    const { isOwnerIndexUnavailable, markOwnerIndexUnavailable, clearOwnerIndexUnavailable } =
      await import('./ownerIndexAvailability');
    if (isOwnerIndexUnavailable(pnIdentifier)) return;

    const res = await ownerGet(
      apiToken,
      `/api/storage/owner-index/${encodeURIComponent(pnIdentifier)}`,
      { pnIdentifier }
    );
    if (res.ok) {
      clearOwnerIndexUnavailable(pnIdentifier);
      return;
    }
    if (res.status === 403 || res.status === 409) {
      markOwnerIndexUnavailable(pnIdentifier);
      // Layout ensure once without a second owner-index GET.
      await ensureDriveLayout(pnIdentifier, apiToken);
    }
  } catch {
    /* best-effort warm */
  }
}

/**
 * Idempotent unlock-time bootstrap. Single-flight per pnIdentifier.
 */
export async function bootstrapCloudSession(opts: {
  apiToken: string;
  pnIdentifier: string;
  sessionId: string;
}): Promise<CloudSessionBootstrapResult> {
  const { apiToken, pnIdentifier, sessionId } = opts;
  if (!apiToken || !pnIdentifier || !sessionId) {
    lastStatus = 'error';
    lastError = 'Missing apiToken, pnIdentifier, or sessionId';
    return { status: 'error', error: lastError };
  }

  if (readyPnIds.has(pnIdentifier)) {
    lastStatus = 'ready';
    lastError = undefined;
    return { status: 'ready' };
  }

  const existing = inFlight.get(pnIdentifier);
  if (existing) return existing;

  const run = (async (): Promise<CloudSessionBootstrapResult> => {
    lastStatus = 'loading';
    lastError = undefined;
    try {
      const creds = SecureCredentialManager.getCredentials(sessionId);
      if (!creds?.pnName || !creds?.passcode) {
        lastStatus = 'needs_reconnect';
        lastError = 'Session credentials missing';
        return { status: 'needs_reconnect', error: lastError };
      }

      const envelope = await loadLocalCloudCredentials({
        identityId: pnIdentifier,
        session: {
          sessionId,
          pnName: creds.pnName,
          passcode: creds.passcode
        }
      });

      const tok = await resolveLocalGoogleAccessTokenAsync(pnIdentifier);
      if (!tok && !(envelope?.googleDriveAccounts?.some((a) => accountToken(a)))) {
        lastStatus = 'needs_reconnect';
        lastError = 'No local Google Drive secrets for this device';
        return { status: 'needs_reconnect', error: lastError };
      }

      if (envelope) {
        await registerBackendsFromEnvelope(pnIdentifier, envelope, apiToken, sessionId);
      } else if (!getStorageAccountsCache(pnIdentifier)) {
        // Still warm accounts cache for reconnect gate (no second GET after bootstrap).
        try {
          const res = await ownerGet(
            apiToken,
            `/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`,
            { pnIdentifier }
          );
          if (res.ok) {
            const data = (await res.json()) as {
              accounts?: Array<{ provider: string; accountId: string }>;
              socialCloudProvider?: string;
              primaryProvider?: string;
            };
            setStorageAccountsCache(pnIdentifier, {
              accounts: data.accounts ?? [],
              socialCloudProvider: data.socialCloudProvider ?? data.primaryProvider ?? null
            });
          }
        } catch {
          /* non-fatal */
        }
      }

      const layoutOk = await ensureDriveLayout(pnIdentifier, apiToken);
      if (!layoutOk && !tok) {
        lastStatus = 'needs_reconnect';
        lastError = 'Drive layout incomplete';
        return { status: 'needs_reconnect', error: lastError };
      }

      await prefetchOwnerIndex(pnIdentifier, apiToken);

      readyPnIds.add(pnIdentifier);
      lastStatus = 'ready';
      lastError = undefined;
      dispatchReady();
      return { status: 'ready' };
    } catch (e) {
      lastStatus = 'error';
      lastError = e instanceof Error ? e.message : 'Cloud session bootstrap failed';
      return { status: 'error', error: lastError };
    } finally {
      inFlight.delete(pnIdentifier);
    }
  })();

  inFlight.set(pnIdentifier, run);
  return run;
}

/** Clear ready flag on lock. */
export function clearCloudSessionBootstrap(pnIdentifier?: string): void {
  if (pnIdentifier) {
    readyPnIds.delete(pnIdentifier);
    inFlight.delete(pnIdentifier);
    accountsCache.delete(pnIdentifier);
  } else {
    readyPnIds.clear();
    inFlight.clear();
    accountsCache.clear();
  }
  lastStatus = 'idle';
  lastError = undefined;
}

export async function ensureCloudSession(opts: {
  apiToken: string | null | undefined;
  pnIdentifier: string | null | undefined;
  sessionId: string | null | undefined;
}): Promise<CloudSessionBootstrapResult> {
  if (!opts.apiToken || !opts.pnIdentifier || !opts.sessionId) {
    return { status: 'needs_reconnect', error: 'Not unlocked' };
  }
  if (readyPnIds.has(opts.pnIdentifier)) {
    return { status: 'ready' };
  }
  return bootstrapCloudSession({
    apiToken: opts.apiToken,
    pnIdentifier: opts.pnIdentifier,
    sessionId: opts.sessionId
  });
}
