/**
 * Combine Shamir shares, decrypt envelope, re-wrap identity with new Key 1 + Key 2.
 * Cryptographic secrets and publicKey stay the same (continuity, not succession).
 */
import {
  combineShares,
  decryptRecoveryEnvelope,
  decryptOwnerVaultShare,
  normalizeShare,
  parseOwnerVaultShare,
  sealRecoveryShares,
  type RecoveryEnvelope,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import { IdentityCrypto, type EncryptedIdentity } from '@par-noir/identity-crypto';

export interface RecoveryCompletionInput {
  envelope: RecoveryEnvelope;
  shares: ShamirShare[];
  /** New Key 1 (internal: pnName) */
  newPnName: string;
  /** New Key 2 (internal: passcode) */
  newPasscode: string;
  existingIdentity: EncryptedIdentity;
}

export interface RecoveryCompletionResult {
  identity: EncryptedIdentity;
  pnName: string;
}

export async function completeRecoveryWithShares(
  input: RecoveryCompletionInput
): Promise<RecoveryCompletionResult> {
  const newPnName = input.newPnName.trim();
  if (!newPnName) {
    throw new Error('Key 1 is required');
  }
  if (!input.newPasscode || input.newPasscode.length < 8) {
    throw new Error('Key 2 must be at least 8 characters');
  }

  const master = combineShares(input.shares.map((s) => normalizeShare(s)));
  const payload = await decryptRecoveryEnvelope(master, input.envelope);

  if (payload.publicKey !== input.existingIdentity.publicKey) {
    throw new Error('Recovery envelope does not match this identity file');
  }

  const identityData: Record<string, unknown> = {
    id: payload.identityId,
    username: newPnName,
    pnName: newPnName,
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
    newPnName,
    input.newPasscode
  );

  const recoverySharesSealed = await sealRecoveryShares(
    input.shares.map((s) => normalizeShare(s)),
    newPnName,
    input.newPasscode
  );

  return {
    pnName: newPnName,
    identity: {
      publicKey: payload.publicKey,
      mlKemPublicKey: payload.mlKemPublicKey,
      encryptedData: encryptedData.encrypted,
      iv: encryptedData.iv,
      salt: encryptedData.salt,
      recoveryEnvelope: input.envelope,
      recoverySharesSealed
    }
  };
}

export async function decryptVaultSharesForRecovery(
  vaultShares: Array<{ encryptedShare: string; shareIndex: number }>,
  identityPublicKey: string
): Promise<ShamirShare[]> {
  const shares: ShamirShare[] = [];
  for (const row of vaultShares) {
    const enc = parseOwnerVaultShare(row.encryptedShare);
    shares.push(await decryptOwnerVaultShare(enc, identityPublicKey));
  }
  return shares;
}

const PENDING_SHARES_KEY = 'pn_pending_recovery_shares';
const RECOVERY_REQUESTS_KEY = 'pn_recovery_requests';

export interface PendingRecoveryShares {
  publicKey: string;
  shares: ShamirShare[];
  threshold: number;
}

/** @deprecated Use getPendingRecoverySharesBuffer from recoveryVaultService */
export function getPendingRecoveryShares(): PendingRecoveryShares | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SHARES_KEY);
    return raw ? (JSON.parse(raw) as PendingRecoveryShares) : null;
  } catch {
    return null;
  }
}

/** @deprecated Use setPendingRecoverySharesBuffer — flush to Drive via initializeRecoveryVaultOnDrive */
export function setPendingRecoveryShares(data: PendingRecoveryShares): void {
  sessionStorage.setItem(PENDING_SHARES_KEY, JSON.stringify(data));
}

/** @deprecated Shares come from Drive pending pool via assignCustodianVaultAndIssueCredential */
export function takeShareForCustodianAssignment(): { share: ShamirShare; shareIndex: number } | null {
  const pending = getPendingRecoveryShares();
  if (!pending?.shares?.length) return null;
  const share = pending.shares.shift()!;
  setPendingRecoveryShares(pending);
  return { share, shareIndex: share.index };
}

export interface StoredRecoveryRequest {
  id: string;
  status: 'pending' | 'ready' | 'completed';
  approvalCount: number;
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

export function appendApprovalToRecoveryRequest(requestId: string): StoredRecoveryRequest | null {
  const list = listRecoveryRequests();
  const req = list.find((r) => r.id === requestId);
  if (!req) return null;
  req.approvalCount += 1;
  if (req.approvalCount >= req.requiredThreshold) req.status = 'ready';
  saveRecoveryRequest(req);
  return req;
}

export function markRecoveryRequestCompleted(requestId: string): void {
  const list = listRecoveryRequests();
  const req = list.find((r) => r.id === requestId);
  if (!req) return;
  req.status = 'completed';
  saveRecoveryRequest(req);
}

export function markRecoveryRequestExpired(requestId: string): void {
  const list = listRecoveryRequests().filter((r) => r.id !== requestId);
  localStorage.setItem(RECOVERY_REQUESTS_KEY, JSON.stringify(list));
}
