/**
 * Cross-app sealed cloud-credentials vault.
 *
 * Primary seal key: ML-KEM secret (available after first-party OAuth messaging handoff).
 * Legacy seal key: pn name + passcode (dashboard identity unlock / migration).
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { sealCredentials, unsealCredentials } from './seal.js';
import { setSessionCloudCredentials } from './sessionMemory.js';
import { freshAccessTokenFromEnvelope } from './driveTokenResolver.js';
import type { SealSession, SealedEnvelope } from './types.js';

/** Legacy identity-factor seal (pn name + passcode). */
export const CLOUD_VAULT_SEAL_SESSION_ID = 'pn-cloud-creds-v1';
/** Primary seal — unsealable after OAuth ML-KEM handoff without re-entering passcode. */
export const CLOUD_VAULT_MLKEM_SESSION_ID = 'pn-cloud-creds-v1-mlkem';

export const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';

export function cloudVaultSealSessionFromMlKem(mlKemSecretKey: string): SealSession {
  return {
    sessionId: CLOUD_VAULT_MLKEM_SESSION_ID,
    pnName: 'mlkem',
    passcode: mlKemSecretKey
  };
}

/** @deprecated Prefer cloudVaultSealSessionFromMlKem for cross-app OAuth unlock. */
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

export async function sealCloudVaultWithMlKem(
  credentials: StorageCredentialsEnvelope,
  mlKemSecretKey: string
): Promise<SealedEnvelope> {
  return sealCredentials(credentials, cloudVaultSealSessionFromMlKem(mlKemSecretKey), null);
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

export async function unsealCloudVaultWithMlKem(
  envelope: SealedEnvelope,
  mlKemSecretKey: string
): Promise<StorageCredentialsEnvelope> {
  return unsealCredentials<StorageCredentialsEnvelope>(
    envelope,
    cloudVaultSealSessionFromMlKem(mlKemSecretKey)
  );
}

/** Try ML-KEM first, then legacy identity factors. */
export async function unsealCloudVaultWithAnyFactor(
  envelope: SealedEnvelope,
  factors: { mlKemSecretKey?: string | null; pnName?: string | null; passcode?: string | null }
): Promise<StorageCredentialsEnvelope> {
  const errors: string[] = [];
  if (factors.mlKemSecretKey) {
    try {
      return await unsealCloudVaultWithMlKem(envelope, factors.mlKemSecretKey);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'mlkem unseal failed');
    }
  }
  if (factors.pnName && factors.passcode) {
    try {
      return await unsealCloudVault(envelope, factors.pnName, factors.passcode);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'identity unseal failed');
    }
  }
  throw new Error(errors.join('; ') || 'No cloud vault unseal factors');
}

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

export function looksLikePlaintextCloudSecrets(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (isSealedEnvelopeShape(value)) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.access_token === 'string' || typeof o.accessToken === 'string') return true;
  if (typeof o.refresh_token === 'string' || typeof o.refreshToken === 'string') return true;
  if (Array.isArray(o.googleDriveAccounts) || o.googleDrive) return true;
  return false;
}

/**
 * Google access token from an unsealed envelope, only when provably fresh.
 *
 * A sealed vault holds the token captured when Drive was connected, which Google
 * kills after about an hour. Handing that back unchecked is what made every
 * unlock re-prompt for consent. Callers needing a usable token past that window
 * must go through resolveFreshDriveToken so it can be refreshed.
 */
export function googleTokenFromEnvelope(envelope: StorageCredentialsEnvelope | null): string | null {
  return freshAccessTokenFromEnvelope(envelope);
}

export type CloudVaultHydrateResult =
  | { status: 'ready'; credentials: StorageCredentialsEnvelope; accessToken: string | null }
  | { status: 'missing' }
  | { status: 'unseal_failed'; error: string }
  | { status: 'error'; error: string };

export async function hydrateCloudCredentialsFromVault(opts: {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  /** Preferred: ML-KEM from OAuth messaging handoff */
  mlKemSecretKey?: string | null;
  /** Legacy / dashboard identity unlock */
  pnName?: string | null;
  passcode?: string | null;
  extraHeaders?: Record<string, string>;
}): Promise<CloudVaultHydrateResult> {
  if (!opts.mlKemSecretKey && !(opts.pnName && opts.passcode)) {
    return { status: 'error', error: 'No vault unseal factors' };
  }
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
      const credentials = await unsealCloudVaultWithAnyFactor(envelope, {
        mlKemSecretKey: opts.mlKemSecretKey,
        pnName: opts.pnName,
        passcode: opts.passcode
      });
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

export async function publishCloudCredentialsVault(opts: {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  credentials: StorageCredentialsEnvelope;
  /** Prefer ML-KEM so browse/messaging OAuth unlock can hydrate without passcode. */
  mlKemSecretKey?: string | null;
  pnName?: string | null;
  passcode?: string | null;
  extraHeaders?: Record<string, string>;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  let envelope: SealedEnvelope;
  if (opts.mlKemSecretKey) {
    envelope = await sealCloudVaultWithMlKem(opts.credentials, opts.mlKemSecretKey);
  } else if (opts.pnName && opts.passcode) {
    envelope = await sealCloudVault(opts.credentials, opts.pnName, opts.passcode);
  } else {
    return { ok: false, status: 0, error: 'No vault seal factors' };
  }
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
      const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
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
