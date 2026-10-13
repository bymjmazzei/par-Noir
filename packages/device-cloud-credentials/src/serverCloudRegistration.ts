/**
 * Server cloud layout registration: PUT layout shells → device Drive layout → POST initialize → verify accounts.
 * Coordination only — no long-lived provider secrets on the API (custody strips server-side).
 */

import {
  CLOUD_SECRET_FIELDS,
  envelopeHasUsableSecrets,
  type StorageCredentialsEnvelope,
} from '@par-noir/user-owned-storage';
import { ensureDeviceDriveLayout } from './deviceDriveLayout.js';
import { normalizePnIdentifier } from './deviceDriveFind.js';
export const SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT = 'pn-server-cloud-registered';

export type CloudRegistrationPhase =
  | 'put_failed'
  | 'init_failed'
  | 'verify_empty'
  | 'missing_google_token'
  | 'missing_layout_payload';

export class CloudRegistrationIncomplete extends Error {
  readonly phase: CloudRegistrationPhase;
  readonly status?: number;

  constructor(phase: CloudRegistrationPhase, message: string, status?: number) {
    super(message);
    this.name = 'CloudRegistrationIncomplete';
    this.phase = phase;
    this.status = status;
  }
}

export interface StorageAccountsLayout {
  accounts: Array<{ provider: string; accountId: string; [key: string]: unknown }>;
  socialCloudProvider: string | null;
}

export interface EnsureServerCloudRegistrationOpts {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  envelope: StorageCredentialsEnvelope;
  /** Ephemeral Google access token to build Drive layout and authorize POST initialize. */
  googleAccessToken: string;
  fetchImpl?: typeof fetch;
}

export interface EnsureServerCloudRegistrationResult extends StorageAccountsLayout {
  pnIdentifier: string;
}

function apiBase(apiEndpoint: string): string {
  return apiEndpoint.replace(/\/$/, '');
}

function stripSecretsFromRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out = { ...record };
  for (const key of CLOUD_SECRET_FIELDS) {
    delete out[key];
  }
  return out;
}

/** Layout-only credentials body for PUT /api/storage/credentials (no provider secrets). */
export function buildLayoutCredentialsForPut(
  envelope: StorageCredentialsEnvelope
): Record<string, unknown> | null {
  const rawAccounts = envelope.googleDriveAccounts ?? [];
  const legacy = (envelope as { googleDrive?: Record<string, unknown> }).googleDrive;
  const source = rawAccounts.length > 0 ? rawAccounts : legacy ? [legacy] : [];
  if (source.length === 0) return null;

  const googleDriveAccounts = source.map((acct) => {
    const row = stripSecretsFromRecord(acct as Record<string, unknown>);
    const accountId =
      (row.accountId as string) ||
      (row.backendId as string) ||
      (row.keyPrefix as string) ||
      undefined;
    return {
      ...row,
      ...(accountId ? { accountId, backendId: row.backendId ?? accountId } : {}),
    };
  });

  const social =
    envelope.socialCloudProvider ||
    envelope.primaryProvider ||
    ('google_drive' as const);

  const socialAccountId =
    envelope.socialCloudAccountId ||
    (googleDriveAccounts[0] as { accountId?: string })?.accountId ||
    null;

  return {
    socialCloudProvider: social,
    ...(socialAccountId ? { socialCloudAccountId: socialAccountId } : {}),
    googleDriveAccounts,
  };
}

export function storageAccountsHasLayout(data: StorageAccountsLayout | null | undefined): boolean {
  if (!data) return false;
  return (data.accounts?.length ?? 0) > 0 || !!data.socialCloudProvider?.trim();
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function fetchStorageAccountsLayout(
  base: string,
  authToken: string,
  pnNormalized: string,
  fetchImpl: typeof fetch
): Promise<StorageAccountsLayout> {
  const bare = pnNormalized.startsWith('pn-') ? pnNormalized.slice(3) : pnNormalized;
  const res = await fetchImpl(`${base}/api/storage/accounts/${encodeURIComponent(bare)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new CloudRegistrationIncomplete(
      'verify_empty',
      `Storage accounts read failed (${res.status})`,
      res.status
    );
  }
  const data = await parseJson(res);
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const social =
    (typeof data.socialCloudProvider === 'string' ? data.socialCloudProvider : null) ||
    (typeof data.primaryProvider === 'string' ? data.primaryProvider : null);
  return {
    accounts: accounts as StorageAccountsLayout['accounts'],
    socialCloudProvider: social,
  };
}

function dispatchRegistered(pnIdentifier: string, layout: StorageAccountsLayout): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SERVER_CLOUD_REGISTRATION_COMPLETE_EVENT, {
      detail: { pnIdentifier, ...layout },
    })
  );
}

/**
 * Register this pN's cloud layout on the API. Throws CloudRegistrationIncomplete on failure.
 */
export async function ensureServerCloudRegistration(
  opts: EnsureServerCloudRegistrationOpts
): Promise<EnsureServerCloudRegistrationResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = apiBase(opts.apiEndpoint);
  const pnNormalized = normalizePnIdentifier(opts.pnIdentifier.trim());
  const googleTok = opts.googleAccessToken?.trim();
  if (!googleTok) {
    throw new CloudRegistrationIncomplete(
      'missing_google_token',
      'Google access token is required to register server cloud layout'
    );
  }
  if (!opts.authToken?.trim()) {
    throw new CloudRegistrationIncomplete('put_failed', 'OAuth bearer token is required');
  }

  const layoutBody = buildLayoutCredentialsForPut(opts.envelope);
  if (!layoutBody || !Array.isArray(layoutBody.googleDriveAccounts) || layoutBody.googleDriveAccounts.length === 0) {
    throw new CloudRegistrationIncomplete(
      'missing_layout_payload',
      'No Google Drive account metadata to register on the server'
    );
  }

  const putRes = await fetchImpl(
    `${base}/api/storage/credentials/${encodeURIComponent(pnNormalized)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ credentials: layoutBody, cid: null }),
    }
  );
  if (!putRes.ok) {
    const errBody = await parseJson(putRes);
    const msg =
      (typeof errBody.message === 'string' && errBody.message) ||
      (typeof errBody.error === 'string' && errBody.error) ||
      `Credential layout PUT failed (${putRes.status})`;
    throw new CloudRegistrationIncomplete('put_failed', msg, putRes.status);
  }

  let pnDriveIndex: Record<string, unknown>;
  try {
    pnDriveIndex = await ensureDeviceDriveLayout(googleTok, pnNormalized, fetchImpl) as Record<
      string,
      unknown
    >;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Drive layout build failed';
    throw new CloudRegistrationIncomplete('init_failed', msg);
  }

  // POST initialize only persists pnDriveIndex — the API rejects X-PN-Cloud-Access-Token globally.
  const initRes = await fetchImpl(
    `${base}/api/storage/initialize/${encodeURIComponent(pnNormalized)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ pnDriveIndex }),
    }
  );
  if (!initRes.ok) {
    const errBody = await parseJson(initRes);
    const msg =
      (typeof errBody.message === 'string' && errBody.message) ||
      (typeof errBody.error_description === 'string' && errBody.error_description) ||
      (typeof errBody.error === 'string' && errBody.error) ||
      `Storage initialize failed (${initRes.status})`;
    throw new CloudRegistrationIncomplete('init_failed', msg, initRes.status);
  }

  const verified = await fetchStorageAccountsLayout(base, opts.authToken, pnNormalized, fetchImpl);
  if (!storageAccountsHasLayout(verified)) {
    throw new CloudRegistrationIncomplete(
      'verify_empty',
      'Server cloud registration completed but storage accounts layout is still empty'
    );
  }

  dispatchRegistered(pnNormalized, verified);
  return { pnIdentifier: pnNormalized, ...verified };
}

export interface RepairServerCloudRegistrationOpts {
  apiEndpoint: string;
  authToken: string;
  pnIdentifier: string;
  localEnvelope?: StorageCredentialsEnvelope | null;
  googleAccessToken?: string | null;
  fetchImpl?: typeof fetch;
}

/**
 * When the device has usable Google secrets but the API layout map is empty, run full registration once.
 */
export async function repairServerCloudRegistrationIfNeeded(
  opts: RepairServerCloudRegistrationOpts
): Promise<EnsureServerCloudRegistrationResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = apiBase(opts.apiEndpoint);
  const pnNormalized = normalizePnIdentifier(opts.pnIdentifier.trim());
  if (!opts.authToken?.trim()) return null;

  const existing = await fetchStorageAccountsLayout(
    base,
    opts.authToken,
    pnNormalized,
    fetchImpl
  ).catch(() => null);
  if (storageAccountsHasLayout(existing)) {
    return existing ? { pnIdentifier: pnNormalized, ...existing } : null;
  }

  const envelope = opts.localEnvelope;
  if (!envelope || !envelopeHasUsableSecrets(envelope, 'google_drive')) {
    return null;
  }

  const googleTok =
    opts.googleAccessToken?.trim() ||
    (envelope.googleDriveAccounts?.[0] as { accessToken?: string; access_token?: string })
      ?.accessToken ||
    (envelope.googleDriveAccounts?.[0] as { access_token?: string })?.access_token ||
    '';
  if (!googleTok.trim()) {
    return null;
  }

  return ensureServerCloudRegistration({
    apiEndpoint: opts.apiEndpoint,
    authToken: opts.authToken,
    pnIdentifier: pnNormalized,
    envelope,
    googleAccessToken: googleTok.trim(),
    fetchImpl,
  });
}
