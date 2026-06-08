import {
  combineShares,
  decryptRecoveryEnvelope,
  normalizeShare,
  type RecoveryEnvelope,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import { IdentityCrypto, type EncryptedIdentity } from '../utils/crypto';

export interface RecoveryCompletionInput {
  envelope: RecoveryEnvelope;
  shares: ShamirShare[];
  newPasscode: string;
  existingIdentity: EncryptedIdentity;
}

export interface RecoveryCompletionResult {
  identity: EncryptedIdentity;
  pnName: string;
}

/**
 * Combine custodian Shamir shares, decrypt recovery envelope, re-wrap identity with new passcode.
 * Preserves same cryptographic keys (same pN).
 */
export async function completeRecoveryWithShares(
  input: RecoveryCompletionInput
): Promise<RecoveryCompletionResult> {
  const master = combineShares(input.shares.map((s) => normalizeShare(s)));
  const payload = await decryptRecoveryEnvelope(master, input.envelope);

  if (payload.publicKey !== input.existingIdentity.publicKey) {
    throw new Error('Recovery envelope does not match this identity file');
  }

  const identityData: Record<string, unknown> = {
    id: payload.identityId,
    username: payload.pnName,
    pnName: payload.pnName,
    recoveryConfig: payload.recoveryConfig,
    custodiansRequired: true,
    custodiansSetup: true,
    status: 'active',
    pqcSecrets: {
      mlDsaSecretKey: payload.mlDsaSecretKey,
      mlKemSecretKey: payload.mlKemSecretKey
    }
  };

  const encryptedData = await IdentityCrypto.encryptData(
    JSON.stringify(identityData),
    payload.pnName,
    input.newPasscode
  );

  return {
    pnName: payload.pnName,
    identity: {
      publicKey: payload.publicKey,
      mlKemPublicKey: payload.mlKemPublicKey,
      encryptedData: encryptedData.encrypted,
      iv: encryptedData.iv,
      salt: encryptedData.salt,
      recoveryEnvelope: input.envelope
    }
  };
}

/** Persist Shamir share assigned to a custodian (local until Drive sheet wired). */
const CUSTODIAN_SHARES_KEY = 'pn_recovery_custodian_shares';
const PENDING_SHARES_KEY = 'pn_pending_recovery_shares';
const RECOVERY_REQUESTS_KEY = 'pn_recovery_requests';

export function takeRecoveryShareForCustodian(custodianId: string): ShamirShare | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { shares?: ShamirShare[] };
    if (!parsed.shares?.length) return null;
    const share = parsed.shares.shift()!;
    sessionStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(parsed));
    storeCustodianShare(custodianId, share);
    return share;
  } catch {
    return null;
  }
}

export interface StoredRecoveryRequest {
  id: string;
  status: 'pending' | 'ready' | 'completed';
  shares: ShamirShare[];
  requiredThreshold: number;
  publicKey: string;
  createdAt: string;
}

export function saveRecoveryRequest(req: StoredRecoveryRequest): void {
  const list = listRecoveryRequests().filter((r) => r.id !== req.id);
  list.push(req);
  localStorage.setItem(RECOVERY_REQUESTS_KEY, JSON.stringify(list));
}

export function listRecoveryRequests(): StoredRecoveryRequest[] {
  try {
    const raw = localStorage.getItem(RECOVERY_REQUESTS_KEY);
    return raw ? (JSON.parse(raw) as StoredRecoveryRequest[]) : [];
  } catch {
    return [];
  }
}

export function appendShareToRecoveryRequest(requestId: string, share: ShamirShare): StoredRecoveryRequest | null {
  const list = listRecoveryRequests();
  const req = list.find((r) => r.id === requestId);
  if (!req) return null;
  req.shares = [...req.shares, share];
  if (req.shares.length >= req.requiredThreshold) req.status = 'ready';
  saveRecoveryRequest(req);
  return req;
}

export function storeCustodianShare(custodianId: string, share: ShamirShare): void {
  const raw = localStorage.getItem(CUSTODIAN_SHARES_KEY);
  const map: Record<string, ShamirShare> = raw ? JSON.parse(raw) : {};
  map[custodianId] = share;
  localStorage.setItem(CUSTODIAN_SHARES_KEY, JSON.stringify(map));
}

export function getCustodianShare(custodianId: string): ShamirShare | null {
  const raw = localStorage.getItem(CUSTODIAN_SHARES_KEY);
  if (!raw) return null;
  const map = JSON.parse(raw) as Record<string, ShamirShare>;
  return map[custodianId] ?? null;
}

export function listCustodianShares(): ShamirShare[] {
  const raw = localStorage.getItem(CUSTODIAN_SHARES_KEY);
  if (!raw) return [];
  return Object.values(JSON.parse(raw) as Record<string, ShamirShare>);
}
