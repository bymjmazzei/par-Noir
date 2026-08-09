import { API_ENDPOINT } from '../config/api';
import {
  generateDeviceKeypair,
  type DevicePolicy,
  type DeviceType,
} from '@par-noir/device-auth';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { sealDevicePrivateDisplay } from '@par-noir/device-client';
import { clientPlatformHeaderValue } from '@par-noir/device-client';
import {
  getSessionCloudCredentials,
  setSessionCloudCredentials,
  freshAccessTokenFromEnvelope,
  isAccessTokenFresh,
  resolveFreshDriveToken,
} from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { deviceProofHeaders } from './deviceProofContext';
import {
  loadDeviceRegistration,
  persistNewKeypair,
  type StoredDeviceRegistration,
} from './deviceKeyStorage';
import { buildLocalDeviceProofHeaders as buildProofHeaders } from '@par-noir/device-client';

export interface DeviceRegistrySummary {
  devices: Array<{
    deviceId: string;
    label: string;
    deviceType: string;
    keyType: string;
    status: string;
    isPrimary: boolean;
    createdAt: string;
    lastSeenAt: string;
    privateDisplay?: string;
  }>;
  policy: Pick<DevicePolicy, 'unkeyedAllows' | 'firstDeviceKeyedAt'>;
  hasKeyedDevices: boolean;
}

const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';

/**
 * Provably fresh Google token from an envelope, or null.
 *
 * Freshness and refresh both live in @par-noir/device-cloud-credentials. This
 * file used to carry its own copy of the rules, which disagreed with the browser's
 * and let each side reach different conclusions about the same token.
 */
function googleTokenFromEnvelope(env: StorageCredentialsEnvelope | null | undefined): string | null {
  return freshAccessTokenFromEnvelope(env);
}

/**
 * Best-effort warm session memory so owner API calls see the live Google token.
 *
 * Both spellings of the token are written. Readers check `access_token` first,
 * so updating only `accessToken` would leave the stale snake_case value winning
 * and quietly undo the refresh.
 */
function warmSessionGoogleToken(
  pnIdentifier: string,
  accessToken: string,
  extras?: { refreshToken?: string | null; expiresAt?: number | null }
): void {
  try {
    const existing = getSessionCloudCredentials(pnIdentifier);
    const accounts = [...(existing?.googleDriveAccounts ?? [])];
    const prev = (accounts[0] as Record<string, unknown> | undefined) ?? {};
    const nextAcct: Record<string, unknown> = {
      ...prev,
      accountId: prev.accountId || 'session',
      accessToken,
      access_token: accessToken,
    };
    if (extras?.refreshToken) {
      nextAcct.refreshToken = extras.refreshToken;
      nextAcct.refresh_token = extras.refreshToken;
    }
    if (typeof extras?.expiresAt === 'number' && Number.isFinite(extras.expiresAt)) {
      nextAcct.expires_at = extras.expiresAt;
      // A relative lifetime alongside an absolute one invites a reader to
      // recompute the deadline from "now" and revive a dead token.
      delete nextAcct.expires_in;
      delete nextAcct.expiresIn;
      delete nextAcct.expiresAt;
    }
    if (accounts.length === 0) {
      accounts.push(nextAcct as (typeof accounts)[0]);
    } else {
      accounts[0] = nextAcct as (typeof accounts)[0];
    }
    const next: StorageCredentialsEnvelope = {
      ...(existing ?? { socialCloudProvider: 'google_drive' }),
      socialCloudProvider: existing?.socialCloudProvider ?? 'google_drive',
      googleDriveAccounts: accounts,
    };
    setSessionCloudCredentials(pnIdentifier, next);
  } catch {
    /* ignore */
  }
}


/** Prefer connected GoogleDriveBackend (refreshes near expiry). */
async function tokenFromConnectedBackends(
  pnIdentifier: string
): Promise<string | null> {
  try {
    const { getFileAggregatorService } = await import('./aggregator/FileAggregatorService');
    const entries = getFileAggregatorService().listBackendEntries();
    for (const { backend } of entries) {
      const drive = backend as {
        ensureAccessToken?: () => Promise<string | null>;
        getAccessToken?: () => string | null;
        isConnected?: () => boolean;
        tokenExpiresAt?: number | null;
        getRefreshToken?: () => string | null;
      };
      if (drive.isConnected && !drive.isConnected()) continue;
      let tok: string | null = null;
      if (typeof drive.ensureAccessToken === 'function') {
        tok = await drive.ensureAccessToken();
      } else if (typeof drive.getAccessToken === 'function') {
        tok = drive.getAccessToken();
      }
      if (!tok?.trim()) continue;

      const trimmed = tok.trim();
      const expiresAt = typeof drive.tokenExpiresAt === 'number' ? drive.tokenExpiresAt : null;

      // A backend is only a token *source*; freshness is still decided by the one
      // resolver. Without this a backend that cannot vouch for its token would
      // reintroduce the stale-token path through the side door.
      if (!isAccessTokenFresh({ access_token: trimmed, expires_at: expiresAt ?? undefined })) {
        continue;
      }

      warmSessionGoogleToken(pnIdentifier, trimmed, {
        expiresAt,
        refreshToken: typeof drive.getRefreshToken === 'function' ? drive.getRefreshToken() : null,
      });
      return trimmed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function loadSealedCloudEnvelope(
  pnIdentifier: string
): Promise<StorageCredentialsEnvelope | null> {
  try {
    const userStr =
      typeof localStorage !== 'undefined' ? localStorage.getItem('authenticated_user') : null;
    const user = userStr ? (JSON.parse(userStr) as { id?: string; publicKey?: string }) : null;
    const sessionId = user?.id || user?.publicKey || null;
    if (!sessionId) return null;
    const creds = SecureCredentialManager.getCredentials(sessionId);
    if (!creds?.pnName || !creds?.passcode) return null;
    const { loadLocalCloudCredentials } = await import('@par-noir/device-cloud-credentials');
    return await loadLocalCloudCredentials({
      identityId: pnIdentifier,
      session: {
        sessionId,
        pnName: creds.pnName,
        passcode: creds.passcode,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a usable Google access token from an envelope, refreshing when needed.
 *
 * Returns null rather than a token that cannot be proven live. There is
 * deliberately no "return the stale one as a last resort" branch: that is what
 * sent dead tokens to Google and turned recoverable 401s into 500s.
 */
async function resolveUsableTokenFromEnvelope(
  pnIdentifier: string,
  env: StorageCredentialsEnvelope | null | undefined
): Promise<string | null> {
  let ownerToken: string | null = null;
  try {
    const { requireOwnerApiToken } = await import('./ownerApiToken');
    ownerToken = requireOwnerApiToken(pnIdentifier);
  } catch {
    ownerToken = null;
  }

  const resolved = await resolveFreshDriveToken({
    envelope: env,
    authToken: ownerToken,
    apiEndpoint: API_ENDPOINT,
    path: 'dashboard',
  });
  if (!resolved.token) return null;

  warmSessionGoogleToken(pnIdentifier, resolved.token, {
    expiresAt: resolved.expiresAt ?? null,
  });
  return resolved.token;
}

/**
 * Live Google access token for owner API Drive calls under device custody.
 * Prefers Storage backend ensureAccessToken (refreshes), then session/sealed with
 * refresh when expires_at is near/past — never return a known-stale session token.
 */
export async function resolveLocalGoogleAccessTokenAsync(
  pnIdentifier: string
): Promise<string | null> {
  try {
    const { awaitMigrateFlushForIdentity } = await import('./deviceCloudCredentials');
    await awaitMigrateFlushForIdentity(pnIdentifier);
  } catch {
    /* best-effort */
  }

  const fromBackend = await tokenFromConnectedBackends(pnIdentifier);
  if (fromBackend) return fromBackend;

  try {
    const fromSession = await resolveUsableTokenFromEnvelope(
      pnIdentifier,
      getSessionCloudCredentials(pnIdentifier)
    );
    if (fromSession) return fromSession;
  } catch {
    /* fall through */
  }

  const sealed = await loadSealedCloudEnvelope(pnIdentifier);
  return resolveUsableTokenFromEnvelope(pnIdentifier, sealed);
}

/**
 * Wait until a live Google token is in the shared cloud session (or timeout).
 * Used by owner UI that must not race the JWT-only unlock path.
 */
export async function waitForLocalGoogleAccessToken(
  pnIdentifier: string,
  maxMs = 15000
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const tok = await resolveLocalGoogleAccessTokenAsync(pnIdentifier);
    if (tok) return tok;
    await new Promise((r) => setTimeout(r, 200));
  }
  return resolveLocalGoogleAccessTokenAsync(pnIdentifier);
}

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

function platformHeaders(): Record<string, string> {
  return { 'X-PN-Client-Platform': clientPlatformHeaderValue() };
}

async function cloudTokenHeadersAsync(pnIdentifier: string): Promise<Record<string, string>> {
  const tok = await resolveLocalGoogleAccessTokenAsync(pnIdentifier);
  return tok ? { [PN_CLOUD_ACCESS_TOKEN_HEADER]: tok } : {};
}

async function apiFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown,
  pnIdentifierForCloudToken?: string
): Promise<Response> {
  const proof = await deviceProofHeaders(method, path, body);
  const cloud = pnIdentifierForCloudToken
    ? await cloudTokenHeadersAsync(pnIdentifierForCloudToken)
    : {};
  return fetch(`${API_ENDPOINT}${path}`, {
    method,
    headers: authHeaders(authToken, { ...proof, ...cloud }),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

function resolveSessionSecrets(sessionId: string): { pnName: string; passcode: string } {
  const creds = SecureCredentialManager.getCredentials(sessionId);
  if (!creds?.pnName || !creds?.passcode) {
    throw new Error('Unlock required to seal device display fields');
  }
  return { pnName: creds.pnName, passcode: creds.passcode };
}

async function buildPrivateDisplayBlob(params: {
  sessionId: string;
  label: string;
  deviceType: DeviceType | string;
  lastSeenAt?: string;
}): Promise<string> {
  const { pnName, passcode } = resolveSessionSecrets(params.sessionId);
  const deviceType = (params.deviceType || 'other') as DeviceType;
  return sealDevicePrivateDisplay(
    {
      label: params.label || 'Device',
      deviceType:
        deviceType === 'mobile' ||
        deviceType === 'desktop' ||
        deviceType === 'tablet' ||
        deviceType === 'other'
          ? deviceType
          : 'other',
      lastSeenAt: params.lastSeenAt || new Date().toISOString(),
    },
    pnName,
    passcode
  );
}

export async function fetchDeviceRegistry(
  userPnIdentifier: string,
  authToken: string
): Promise<DeviceRegistrySummary | null> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/registry`;
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchDevicePolicy(
  userPnIdentifier: string,
  authToken: string
): Promise<DevicePolicy | null> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/policy`;
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.policy ?? null;
}

export async function updateDevicePolicy(
  userPnIdentifier: string,
  authToken: string,
  unkeyedAllows: string[]
): Promise<DevicePolicy> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/policy`;
  const body = { unkeyedAllows };
  const res = await apiFetch(authToken, 'PATCH', path, body, userPnIdentifier);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to update device policy');
  }
  const data = await res.json();
  return data.policy;
}

export async function createPairingNonce(
  userPnIdentifier: string,
  authToken: string
): Promise<{ pairingNonce: string; expiresAt: string }> {
  const path = '/api/devices/pairing/nonce';
  const res = await apiFetch(authToken, 'POST', path, { userPnIdentifier }, userPnIdentifier);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create pairing nonce');
  }
  return res.json();
}

/** Coarse browser class only — never include pn name, email, or other PII. */
export function coarseDeviceHint(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'mobile-browser';
  if (/Macintosh|Windows|Linux|CrOS/i.test(ua)) return 'desktop-browser';
  return 'browser';
}

/** Opaque local id for dedupe; not derived from identity secrets. */
export function coarseDeviceFingerprint(): string {
  if (typeof localStorage === 'undefined') return 'default';
  const key = 'pn_unkeyed_unlock_fp';
  try {
    let fp = localStorage.getItem(key);
    if (!fp) {
      fp = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      localStorage.setItem(key, fp);
    }
    return fp;
  } catch {
    return 'default';
  }
}

export async function postUnkeyedUnlockAlert(
  userPnIdentifier: string,
  authToken: string,
  opts?: { deviceHint?: string; fingerprint?: string }
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const path = '/api/devices/unkeyed-unlock-alert';
  const body = {
    userPnIdentifier,
    deviceHint: opts?.deviceHint || coarseDeviceHint(),
    fingerprint: opts?.fingerprint || coarseDeviceFingerprint(),
  };
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to post unlock alert');
  }
  return res.json();
}

export async function registerDeviceOnServer(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  devicePublicKey: string;
  privateDisplay: string;
  pairingNonce?: string;
  isPrimary?: boolean;
}): Promise<{ success: boolean; deviceId: string; firstDevice: boolean }> {
  const path = '/api/devices/register';
  const body = {
    userPnIdentifier: params.userPnIdentifier,
    deviceId: params.deviceId,
    devicePublicKey: params.devicePublicKey,
    privateDisplay: params.privateDisplay,
    pairingNonce: params.pairingNonce,
    isPrimary: params.isPrimary,
  };
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(params.authToken, {
      ...(await cloudTokenHeadersAsync(params.userPnIdentifier)),
      ...platformHeaders(),
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string; error?: string }).error_description ||
        (err as { error?: string }).error ||
        'Failed to register device'
    );
  }
  return res.json();
}

export async function resetDeviceRegistryDev(
  userPnIdentifier: string,
  authToken: string
): Promise<{ success: boolean; revoked: number }> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/registry/reset`;
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(authToken, await cloudTokenHeadersAsync(userPnIdentifier)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string; error?: string }).error_description ||
        (err as { error?: string }).error ||
        'Failed to reset device registry'
    );
  }
  return res.json();
}

export async function initiateDeviceRegistryResetRequest(params: {
  userPnIdentifier: string;
  authToken: string;
  publicKey: string;
  threshold?: number;
}): Promise<{ requestId: string }> {
  const requestId = `device-reset-${Date.now()}`;
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests`, {
    method: 'POST',
    headers: authHeaders(params.authToken, await cloudTokenHeadersAsync(params.userPnIdentifier)),
    body: JSON.stringify({
      userPnIdentifier: params.userPnIdentifier,
      requestId,
      publicKey: params.publicKey,
      threshold: params.threshold ?? 2,
      claimantName: 'device-registry-reset',
      requestType: 'device_registry_reset',
      status: 'pending',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to start device registry reset');
  }
  return { requestId };
}

export async function finalizeDeviceRegistryReset(
  userPnIdentifier: string,
  authToken: string,
  requestId: string
): Promise<{ success: boolean; revoked: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/devices/registry/reset/finalize`, {
    method: 'POST',
    headers: authHeaders(authToken, await cloudTokenHeadersAsync(userPnIdentifier)),
    body: JSON.stringify({ userPnIdentifier, requestId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string; error?: string }).error_description ||
        (err as { error?: string }).error ||
        'Failed to finalize device registry reset'
    );
  }
  return res.json();
}

export async function revokeDeviceOnServer(
  userPnIdentifier: string,
  authToken: string,
  deviceId: string
): Promise<void> {
  const path = `/api/devices/${encodeURIComponent(deviceId)}/revoke`;
  const res = await apiFetch(authToken, 'POST', path, { userPnIdentifier }, userPnIdentifier);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to revoke device');
  }
}

export async function sendDeviceHeartbeat(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  sessionId: string;
  label?: string;
  deviceType?: string;
}): Promise<void> {
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: params.label || 'Device',
    deviceType: params.deviceType || 'other',
    lastSeenAt: new Date().toISOString(),
  });
  const path = `/api/devices/${encodeURIComponent(params.deviceId)}/heartbeat`;
  const res = await apiFetch(
    params.authToken,
    'POST',
    path,
    {
      userPnIdentifier: params.userPnIdentifier,
      privateDisplay,
    },
    params.userPnIdentifier
  );
  if (!res.ok) return;
}

export async function bootstrapThisDevice(params: {
  userPnIdentifier: string;
  authToken: string;
  sessionId: string;
  label?: string;
  deviceType?: StoredDeviceRegistration['deviceType'];
}): Promise<StoredDeviceRegistration> {
  const keypair = await generateDeviceKeypair();
  const reg = await persistNewKeypair({
    pnIdentifier: params.userPnIdentifier,
    deviceId: keypair.deviceId,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    label: params.label,
    deviceType: params.deviceType,
  });
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: reg.label,
    deviceType: reg.deviceType,
  });
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    privateDisplay,
    isPrimary: true,
  });
  return reg;
}

export async function completePairingFromNonce(params: {
  userPnIdentifier: string;
  authToken: string;
  sessionId: string;
  pairingNonce: string;
  label?: string;
}): Promise<StoredDeviceRegistration> {
  const keypair = await generateDeviceKeypair();
  const reg = await persistNewKeypair({
    pnIdentifier: params.userPnIdentifier,
    deviceId: keypair.deviceId,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    label: params.label,
  });
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: reg.label,
    deviceType: reg.deviceType,
  });
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    privateDisplay,
    pairingNonce: params.pairingNonce,
  });
  return reg;
}

export async function buildLocalDeviceProofHeaders(
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, string>> {
  return buildProofHeaders(pnIdentifier, method, path, body);
}

export async function getLocalDeviceRegistration(
  pnIdentifier: string
): Promise<Pick<StoredDeviceRegistration, 'deviceId' | 'publicKey' | 'label'> | null> {
  const reg = await loadDeviceRegistration(pnIdentifier);
  if (!reg) return null;
  return { deviceId: reg.deviceId, publicKey: reg.publicKey, label: reg.label };
}
