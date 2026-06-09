import { API_ENDPOINT } from '../config/api';
import type { RecoveryZkApprovalPayload, ShamirShare } from '@par-noir/recovery-crypto';
import {
  encryptOwnerVaultShare,
  serializeOwnerVaultShare,
} from '@par-noir/recovery-crypto';

export interface RecoveryCustodianApiRow {
  custodianId: string;
  name: string;
  custodianType: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: string;
  createdAt: string;
  unrevokable: boolean;
  custodianPublicKey?: string;
  custodianPnIdentifier?: string;
}

export interface RecoveryCustodianSummary {
  custodians: RecoveryCustodianApiRow[];
  pending: Array<{ shareIndex: number; createdAt: string }>;
  counts: { accepted: number; acceptedUnrevokable: number; invited: number };
}

function authHeaders(authToken: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

export async function persistRecoveryRequest(
  userPnIdentifier: string,
  authToken: string,
  payload: {
    requestId: string;
    publicKey: string;
    threshold: number;
    claimantName: string;
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, ...payload, status: 'pending' }),
  });
  if (!res.ok) throw new Error('Failed to persist recovery request');
}

export async function submitRecoveryApproval(
  userPnIdentifier: string,
  authToken: string,
  requestId: string,
  approval: RecoveryZkApprovalPayload,
  threshold?: number
): Promise<{ status: string; approvalCount: number; includesUnrevokableShare?: boolean; reason?: string }> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests/${encodeURIComponent(requestId)}/approvals`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, approval, threshold }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to submit recovery approval');
  }
  return res.json();
}

export async function fetchRecoveryRequests(
  userPnIdentifier: string,
  authToken: string
): Promise<Array<{
  requestId: string;
  publicKey: string;
  status: string;
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
}>> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/requests`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.requests || [];
}

export async function fetchRecoveryRequest(
  userPnIdentifier: string,
  authToken: string,
  requestId: string
): Promise<{
  requestId: string;
  publicKey: string;
  status: string;
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
} | null> {
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/requests/${encodeURIComponent(requestId)}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.request || null;
}

export async function fetchVaultShares(
  userPnIdentifier: string,
  authToken: string,
  requestId: string
): Promise<{
  vaultShares: Array<{ custodianId: string; shareIndex: number; encryptedShare: string }>;
  approvalCount: number;
  threshold: number;
  includesUnrevokableShare: boolean;
}> {
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/requests/${encodeURIComponent(requestId)}/vault-shares`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to fetch vault shares');
  }
  return res.json();
}

export async function reconcileRecoveryVault(
  userPnIdentifier: string,
  authToken: string,
  totalShares?: number
): Promise<{ normalized: number; missingIndices: number[] }> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/vault/reconcile`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, totalShares }),
  });
  if (!res.ok) throw new Error('Failed to reconcile recovery vault');
  return res.json();
}

export async function initializeRecoveryVault(
  userPnIdentifier: string,
  authToken: string,
  shares: Array<{ shareIndex: number; encryptedShare: string }>
): Promise<{ inserted: number; skipped: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/vault/initialize`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, shares }),
  });
  if (!res.ok) throw new Error('Failed to initialize recovery vault');
  return res.json();
}

export async function fetchPendingVaultShares(
  userPnIdentifier: string,
  authToken: string,
  includeEncrypted = false
): Promise<Array<{ shareIndex: number; createdAt: string; encryptedShare?: string }>> {
  const q = includeEncrypted ? '?includeEncrypted=true' : '';
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/vault/pending${q}`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.pending || [];
}

export async function fetchRecoveryCustodianSummary(
  userPnIdentifier: string,
  authToken: string
): Promise<RecoveryCustodianSummary | null> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/custodians`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function assignRecoveryCustodian(
  userPnIdentifier: string,
  authToken: string,
  payload: {
    custodianId: string;
    name: string;
    custodianType: string;
    shareIndex: number;
    custodianshipCredential: string;
    encryptedShare: string;
    unrevokable?: boolean;
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians/assign`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to assign custodian');
  }
}

export async function resendRecoveryCustodianInvitation(
  userPnIdentifier: string,
  authToken: string,
  custodianId: string
): Promise<{
  custodianId: string;
  name: string;
  custodianType: string;
  shareIndex: number;
  custodianshipCredential: string;
  unrevokable: boolean;
}> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians/${encodeURIComponent(custodianId)}/resend`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier }),
  });
  if (!res.ok) throw new Error('Failed to resend custodian invitation');
  return res.json();
}

export async function revokeRecoveryCustodian(
  userPnIdentifier: string,
  authToken: string,
  custodianId: string,
  threshold?: number
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians/${encodeURIComponent(custodianId)}/revoke`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, threshold }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to revoke custodian');
  }
}

export async function acceptRecoveryCustodianship(
  ownerPnIdentifier: string,
  authToken: string,
  custodianId: string,
  custodianshipZkp: string
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians/accept`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ ownerPnIdentifier, custodianId, custodianshipZkp }),
  });
  if (!res.ok) throw new Error('Failed to accept custodianship on owner vault');
}

/** @deprecated Use assignRecoveryCustodian after vault initialize */
export async function persistCustodianVault(
  userPnIdentifier: string,
  authToken: string,
  payload: {
    custodianId: string;
    name: string;
    custodianType: string;
    encryptedShare: string;
    shareIndex: number;
    custodianshipCredential: string;
    unrevokable?: boolean;
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ userPnIdentifier, ...payload, status: 'invited' }),
  });
  if (!res.ok) throw new Error('Failed to persist custodian vault entry');
}

export async function encryptSharesForVault(
  shares: ShamirShare[],
  identityPublicKey: string
): Promise<Array<{ shareIndex: number; encryptedShare: string }>> {
  const out: Array<{ shareIndex: number; encryptedShare: string }> = [];
  for (const share of shares) {
    const encrypted = await encryptOwnerVaultShare(share, identityPublicKey);
    out.push({
      shareIndex: share.index,
      encryptedShare: serializeOwnerVaultShare(encrypted),
    });
  }
  return out;
}

export async function migrateVolumeId(
  authToken: string,
  payload: {
    legacyPnIdentifier: string;
    canonicalPnIdentifier: string;
    publicKey: string;
    driveFolderId?: string;
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/storage/migrate-volume-id`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to migrate platform id');
}
