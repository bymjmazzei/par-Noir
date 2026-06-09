import { API_ENDPOINT } from '../config/api';
import type { ShamirShare } from '@par-noir/recovery-crypto';

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

export async function submitRecoveryShare(
  userPnIdentifier: string,
  authToken: string,
  requestId: string,
  share: ShamirShare,
  threshold?: number,
  approval?: {
    proof: unknown;
    encryptedShare: string;
    custodianId: string;
  }
): Promise<{ status: string; shareCount: number }> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests/${encodeURIComponent(requestId)}/shares`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ userPnIdentifier, share, threshold, approval })
  });
  if (!res.ok) {
    throw new Error('Failed to submit recovery share');
  }
  return res.json();
}

export async function persistCustodianShare(
  userPnIdentifier: string,
  authToken: string,
  payload: {
    custodianId: string;
    name: string;
    custodianType: string;
    encryptedShare: string;
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
    throw new Error('Failed to persist custodian share');
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
