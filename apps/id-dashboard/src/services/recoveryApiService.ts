import { API_ENDPOINT } from '../config/api';
import type { RecoveryZkApprovalPayload } from '@par-noir/recovery-crypto';

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ userPnIdentifier, ...payload, status: 'pending' })
  });
  if (!res.ok) {
    throw new Error('Failed to persist recovery request');
  }
}

export async function submitRecoveryApproval(
  userPnIdentifier: string,
  authToken: string,
  requestId: string,
  approval: RecoveryZkApprovalPayload,
  threshold?: number
): Promise<{ status: string; approvalCount: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests/${encodeURIComponent(requestId)}/approvals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ userPnIdentifier, approval, threshold })
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
    headers: { Authorization: `Bearer ${authToken}` }
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
}> {
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/requests/${encodeURIComponent(requestId)}/vault-shares`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) {
    throw new Error('Failed to fetch vault shares');
  }
  return res.json();
}

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
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/custodians`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ userPnIdentifier, ...payload })
  });
  if (!res.ok) {
    throw new Error('Failed to persist custodian vault entry');
  }
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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error('Failed to migrate platform id');
  }
}
