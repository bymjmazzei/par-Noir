import type { ShamirShare } from '@par-noir/recovery-crypto';

const PENDING_SHARES_KEY = 'pn_pending_recovery_shares';

/** Shares of a freshly split identity, held in this tab until the .pn carries them sealed. */
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
