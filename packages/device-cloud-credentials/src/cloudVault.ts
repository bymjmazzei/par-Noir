/**
 * Cross-app sealed cloud-credentials vault.
 * Seal key is identity-canonical (pn name + passcode), not per-app sessionId,
 * so dashboard publish can be unsealed by browse/messaging/portals after unlock.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sealCredentials, unsealCredentials } from './seal.js';
import { setSessionCloudCredentials } from './sessionMemory.js';
import type { SealSession, SealedEnvelope } from './types.js';

/** Fixed purpose string — must be identical across all first-party apps. */
export const CLOUD_VAULT_SEAL_SESSION_ID = 'pn-cloud-creds-v1';

export const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';

export function canonicalCloudSealSession(pnName: string, passcode: string): SealSession {
  return {
    sessionId: CLOUD_VAULT_SEAL_SESSION_ID,
    pnName: pnName.trim(),
    passcode
  };
}

export async function sealCloudVault(
  credentials: StorageCredentialsEnvelope,
  pnName: string,
  passcode: string
): Promise<SealedEnvelope> {
  return sealCredentials(credentials, canonicalCloudSealSession(pnName, passcode), null);
}

export async function unsealCloudVault(
  envelope: SealedEnvelope,
  pnName: string,
  passcode: string
): Promise<StorageCredentialsEnvelope> {
  return unsealCredentials<StorageCredentialsEnvelope>(
    envelope,
    canonicalCloudSealSession(pnName, passcode)
  );
}

/** True when object looks like a SealedEnvelope (ciphertext), not raw OAuth tokens. */
export function isSealedEnvelopeShape(value: unknown): value is SealedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.encryptedData === 'string' &&
    o.encryptedData.length > 0 &&
    typeof o.iv === 'string' &&
    o.iv.length > 0 &&
    typeof o.salt === 'string' &&
    o.salt.length > 0 &&
    typeof o.updatedAt === 'string'
  );
}

/** Reject payloads that look like plaintext cloud secrets. */
export function looksLikePlaintextCloudSecrets(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  const secretKeys = [
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'encryptedData'
  ];
  // Raw OAuth object (has access/refresh but not sealed shape)
  if (
    (typeof o.access_token === 'string' || typeof o.accessToken === 'string') &&
    !isSealedEnvelopeShape(value)
  ) {
    return true;
  }
  if (typeof o.refresh_token === 'string' || typeof o.refreshToken === 'string') {
    if (!isSealedEnvelopeShape(value)) return true;
  }
  if (Array.isArray(o.googleDriveAccounts) || o.googleDrive) {
    return true;
  }
  for (const k of secretKeys) {
    if (k === 'encryptedData') continue;
    if (typeof o[k] === 'string' && (o[k] as string).length > 0 && !isSealedEnvelopeShape(value)) {
      return true;
    }
  }
  return false;
}

function googleTokenFromEnvelope(envelope: StorageCredentialsEnvelope | null): string | null {
  if (!envelope) return null;
  const legacy = (envelope as { googleDrive?: Record<string, unknown> }).googleDrive;
  const accounts =
    (envelope.googleDriveAccounts as Record<string, unknown>[] | undefined) ||
    (legacy ? [legacy] : []);
  for (const acct of accounts) {
    const tok =
      (typeof acct.access_token === 'string' && acct.access_token) ||
      (typeof acct.accessToken === 'string' && acct.accessToken) ||
      '';
    if (tok.trim()) return tok.trim();
  }
  return null;
}

export type CloudVaultHydrateResult =
  | { status: 'ready'; credentials: StorageCredentialsEnvelope; accessToken: string | null }
  | { status: 'missing' }
  | { status: 'unseal_failed'; error: string }
  | { status: 'error'; error: string };

/**
 * Fetch sealed vault from API, unseal with identity factors, load session memory.
 */
export async function hydrateCloudCredentialsFromVault(opts: {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  pnName: string;
  passcode: string;
  extraHeaders?: Record<string, string>;
}): Promise<CloudVaultHydrateResult> {
  const base = opts.apiEndpoint.replace(/\/$/, '');
  const url = `${base}/api/storage/cloud-vault/${encodeURIComponent(opts.pnIdentifier)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        ...(opts.extraHeaders || {})
      }
    });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) {
      return { status: 'error', error: `cloud-vault GET ${res.status}` };
    }
    const data = (await res.json()) as { envelope?: SealedEnvelope; sealed?: SealedEnvelope };
    const envelope = data.envelope || data.sealed;
    if (!envelope || !isSealedEnvelopeShape(envelope)) {
      return { status: 'missing' };
    }
    try {
      const credentials = await unsealCloudVault(envelope, opts.pnName, opts.passcode);
      setSessionCloudCredentials(opts.pnIdentifier, credentials);
      return {
        status: 'ready',
        credentials,
        accessToken: googleTokenFromEnvelope(credentials)
      };
    } catch (e) {
      return {
        status: 'unseal_failed',
        error: e instanceof Error ? e.message : 'unseal failed'
      };
    }
  } catch (e) {
    return {
      status: 'error',
      error: e instanceof Error ? e.message : 'cloud-vault fetch failed'
    };
  }
}

/**
 * Seal credentials and PUT opaque vault to API (ciphertext only).
 */
export async function publishCloudCredentialsVault(opts: {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  pnName: string;
  passcode: string;
  credentials: StorageCredentialsEnvelope;
  extraHeaders?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const envelope = await sealCloudVault(opts.credentials, opts.pnName, opts.passcode);
  const base = opts.apiEndpoint.replace(/\/$/, '');
  const url = `${base}/api/storage/cloud-vault/${encodeURIComponent(opts.pnIdentifier)}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json',
        ...(opts.extraHeaders || {})
      },
      body: JSON.stringify({ envelope })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string; message?: string };
      return {
        ok: false,
        status: res.status,
        error: err.error || err.message || `cloud-vault PUT ${res.status}`
      };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : 'cloud-vault PUT failed'
    };
  }
}

/** Build headers for owner Drive-backed API calls after vault hydrate. */
export function cloudAccessHeaders(
  authToken: string,
  accessToken?: string | null
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  };
  if (accessToken && accessToken.trim()) {
    headers[PN_CLOUD_ACCESS_TOKEN_HEADER] = accessToken.trim();
  }
  return headers;
}
