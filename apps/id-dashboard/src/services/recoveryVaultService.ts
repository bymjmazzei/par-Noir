import type { ShamirShare } from '@par-noir/recovery-crypto';
import {
  encryptSharesForVault,
  fetchPendingVaultShares,
  initializeRecoveryVault,
  reconcileRecoveryVault,
} from './recoveryApiService';

const PENDING_SHARES_KEY = 'pn_pending_recovery_shares';
const RECOVERY_REQUESTS_KEY = 'pn_recovery_requests';

export interface PendingRecoveryShares {
  publicKey: string;
  shares: ShamirShare[];
  threshold: number;
}

export function getPendingRecoverySharesBuffer(): PendingRecoveryShares | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARES_KEY);
    return raw ? (JSON.parse(raw) as PendingRecoveryShares) : null;
  } catch {
    return null;
  }
}

export function setPendingRecoverySharesBuffer(data: PendingRecoveryShares): void {
  sessionStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(data));
}

export function clearPendingRecoverySharesBuffer(): void {
  sessionStorage.removeItem(PENDING_SHARES_KEY);
}

/** Persist all Shamir shares to Drive pending pool; clears session buffer on success. */
export async function initializeRecoveryVaultOnDrive(params: {
  userPnIdentifier: string;
  authToken: string;
  publicKey: string;
  shares: ShamirShare[];
  threshold: number;
}): Promise<{ inserted: number; skipped: number }> {
  const encrypted = await encryptSharesForVault(params.shares, params.publicKey);
  const result = await initializeRecoveryVault(params.userPnIdentifier, params.authToken, encrypted);
  if (result.inserted > 0 || result.skipped > 0) {
    clearPendingRecoverySharesBuffer();
  }
  return result;
}

/** Flush sessionStorage buffer to Drive if present. */
export async function flushPendingRecoverySharesToDrive(params: {
  userPnIdentifier: string;
  authToken: string;
  publicKey: string;
}): Promise<{ flushed: boolean; inserted?: number; skipped?: number }> {
  const buffer = getPendingRecoverySharesBuffer();
  if (!buffer?.shares?.length || buffer.publicKey !== params.publicKey) {
    return { flushed: false };
  }
  const result = await initializeRecoveryVaultOnDrive({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    publicKey: params.publicKey,
    shares: buffer.shares,
    threshold: buffer.threshold,
  });
  return { flushed: true, ...result };
}

/** Normalize legacy custodian rows and report share indices still missing from Drive vault. */
export async function reconcileRecoveryVaultOnDrive(params: {
  userPnIdentifier: string;
  authToken: string;
  totalShares: number;
}): Promise<{ normalized: number; missingIndices: number[] }> {
  return reconcileRecoveryVault(params.userPnIdentifier, params.authToken, params.totalShares);
}

export async function pickLowestPendingShareIndex(
  userPnIdentifier: string,
  authToken: string
): Promise<number | null> {
  const pending = await fetchPendingVaultShares(userPnIdentifier, authToken, false);
  if (!pending.length) return null;
  return pending.map((p) => p.shareIndex).sort((a, b) => a - b)[0] ?? null;
}

export { RECOVERY_REQUESTS_KEY };
