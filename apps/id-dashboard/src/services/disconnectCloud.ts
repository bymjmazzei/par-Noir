/**
 * Google Drive disconnect commits the sealed vault and the API layout
 * before the screen or the local seal drop the account.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import {
  clearSessionCloudCredentials,
  getSessionCloudCredentials,
  loadLocalCloudCredentials,
  normalizeCloudIdentityId,
  wipeSealedCloudCredentials,
} from '@par-noir/device-cloud-credentials';

type DriveAccount = NonNullable<StorageCredentialsEnvelope['googleDriveAccounts']>[number];

type LayoutEnvelope = StorageCredentialsEnvelope & {
  googleDrive?: unknown;
  pnDriveIndex?: unknown;
};

const generationByPn = new Map<string, number>();

export function cloudDisconnectGeneration(pnIdentifier: string): number {
  return generationByPn.get(normalizeCloudIdentityId(pnIdentifier)) ?? 0;
}

export function bumpCloudDisconnectGeneration(pnIdentifier: string): number {
  const key = normalizeCloudIdentityId(pnIdentifier);
  const next = (generationByPn.get(key) ?? 0) + 1;
  generationByPn.set(key, next);
  return next;
}

/** True when a disconnect committed while this caller was awaiting. */
export function cloudDisconnectWasSuperseded(pnIdentifier: string, seen: number): boolean {
  return cloudDisconnectGeneration(pnIdentifier) !== seen;
}

/**
 * Drop a vault write that lost the race with disconnect.
 * Clears the session copy and the local seal so unlock cannot put the token back.
 */
export async function discardIfCloudDisconnected(
  pnIdentifier: string,
  seen: number
): Promise<boolean> {
  if (!cloudDisconnectWasSuperseded(pnIdentifier, seen)) return false;
  clearSessionCloudCredentials(pnIdentifier);
  await wipeSealedCloudCredentials(pnIdentifier);
  return true;
}

function sameDriveAccount(account: DriveAccount, backendId: string): boolean {
  const id = backendId.trim();
  return account.backendId === id || account.accountId === id;
}

/** Envelope to seal after this Drive account is removed. */
export function envelopeWithoutGoogleDriveAccount(
  current: StorageCredentialsEnvelope | null | undefined,
  backendId?: string | null
): StorageCredentialsEnvelope {
  const base = { ...(current || {}) } as LayoutEnvelope;
  const accounts = base.googleDriveAccounts ?? [];
  const keep = backendId?.trim()
    ? accounts.filter((account) => !sameDriveAccount(account, backendId))
    : [];
  const next: LayoutEnvelope = {
    ...base,
    googleDriveAccounts: keep,
  };
  delete next.googleDrive;
  if (keep.length === 0) {
    delete next.pnDriveIndex;
    delete next.cachedFolderIds;
    delete next.driveFolderId;
    if (!next.socialCloudProvider || next.socialCloudProvider === 'google_drive') {
      delete next.socialCloudProvider;
      delete next.socialCloudAccountId;
    }
  }
  return next;
}

/** API layout body. An empty Drive list clears the stored folder index. */
export function googleDriveDisconnectLayout(
  remaining: StorageCredentialsEnvelope
): Record<string, unknown> {
  const accounts = remaining.googleDriveAccounts ?? [];
  if (accounts.length === 0) {
    return {
      googleDriveAccounts: [],
      googleDrive: null,
      pnDriveIndex: null,
      cachedFolderIds: null,
      driveFolderId: null,
      socialCloudProvider: remaining.socialCloudProvider ?? null,
      socialCloudAccountId: remaining.socialCloudAccountId ?? null,
    };
  }
  return {
    socialCloudProvider: remaining.socialCloudProvider,
    socialCloudAccountId: remaining.socialCloudAccountId,
    googleDriveAccounts: accounts.map((account) => ({
      backendId: account.backendId || account.accountId,
      accountId: account.accountId || account.backendId,
      keyPrefix: account.keyPrefix,
      email: account.email,
      connectedAt: account.connectedAt,
    })),
  };
}

export async function commitGoogleDriveDisconnect(opts: {
  pnIdentifier: string;
  /** Omit to remove every Google Drive account. */
  backendId?: string | null;
  current: StorageCredentialsEnvelope | null | undefined;
  publishVault: (
    credentials: StorageCredentialsEnvelope
  ) => Promise<{ ok: boolean; error?: string }>;
  putLayout: (credentials: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  clearSealed: () => Promise<void>;
}): Promise<StorageCredentialsEnvelope> {
  const remaining = envelopeWithoutGoogleDriveAccount(opts.current, opts.backendId);
  const vault = await opts.publishVault(remaining);
  if (!vault.ok) {
    throw new Error(vault.error || 'Cloud vault update failed');
  }
  bumpCloudDisconnectGeneration(opts.pnIdentifier);
  const layout = await opts.putLayout(googleDriveDisconnectLayout(remaining));
  if (!layout.ok) {
    throw new Error(layout.error || 'Cloud layout update failed');
  }
  clearSessionCloudCredentials(opts.pnIdentifier);
  await opts.clearSealed();
  return remaining;
}

/** Shell unlock has no passcode. The ML-KEM key from that unlock can still seal the vault. */
export function canSealCloudDisconnect(opts: {
  pnIdentifier: string | null | undefined;
  authToken: string | null | undefined;
  pnName?: string | null;
  passcode?: string | null;
  mlKemSecretKey?: string | null;
}): boolean {
  if (!opts.pnIdentifier?.startsWith('pn-') || !opts.authToken) return false;
  if (opts.mlKemSecretKey) return true;
  return Boolean(opts.pnName && opts.passcode);
}

async function currentDriveEnvelope(opts: {
  pnIdentifier: string;
  pnName?: string | null;
  passcode?: string | null;
}): Promise<StorageCredentialsEnvelope | null> {
  const fromSession = getSessionCloudCredentials(opts.pnIdentifier);
  if (fromSession) return fromSession;
  if (!opts.pnName || !opts.passcode) return null;
  return loadLocalCloudCredentials({
    identityId: opts.pnIdentifier,
    session: {
      sessionId: 'pn-cloud-creds-v1',
      pnName: opts.pnName,
      passcode: opts.passcode,
    },
  });
}

/** Dashboard wiring: vault PUT, layout PUT, then local wipe. */
export async function commitDashboardGoogleDriveDisconnect(opts: {
  pnIdentifier: string;
  authToken: string;
  pnName?: string | null;
  passcode?: string | null;
  publicKey?: string | null;
  mlKemSecretKey?: string | null;
  backendId?: string | null;
}): Promise<void> {
  if (
    !canSealCloudDisconnect({
      pnIdentifier: opts.pnIdentifier,
      authToken: opts.authToken,
      pnName: opts.pnName,
      passcode: opts.passcode,
      mlKemSecretKey: opts.mlKemSecretKey,
    })
  ) {
    throw new Error('Unlock again to disconnect Google Drive.');
  }
  const current = await currentDriveEnvelope(opts);
  const { publishCloudVaultForIdentity } = await import('./deviceCloudCredentials');
  const { ownerFetch } = await import('./ownerApiService');
  await commitGoogleDriveDisconnect({
    pnIdentifier: opts.pnIdentifier,
    backendId: opts.backendId,
    current,
    publishVault: (credentials) =>
      publishCloudVaultForIdentity({
        identityId: opts.pnIdentifier,
        authToken: opts.authToken,
        pnName: opts.pnName,
        passcode: opts.passcode,
        credentials,
        publicKey: opts.publicKey,
        mlKemSecretKey: opts.mlKemSecretKey,
      }),
    putLayout: async (credentials) => {
      const res = await ownerFetch(
        opts.authToken,
        'PUT',
        `/api/storage/credentials/${encodeURIComponent(opts.pnIdentifier)}`,
        { credentials, cid: null },
        { pnIdentifier: opts.pnIdentifier }
      );
      if (!res.ok) {
        const error = await res.text().catch(() => '');
        return { ok: false, error: error || `Cloud layout update failed (${res.status})` };
      }
      return { ok: true };
    },
    clearSealed: () => wipeSealedCloudCredentials(opts.pnIdentifier),
  });
}
