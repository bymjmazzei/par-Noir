import { API_ENDPOINT } from '../config/api';
import type { RecoveryZkApprovalPayload, ShamirShare } from '@par-noir/recovery-crypto';
import {
  encryptOwnerVaultShare,
  serializeOwnerVaultShare,
} from '@par-noir/recovery-crypto';
import {
  findRecoveryWorkbookId,
  listDeviceRecoveryRequests,
  readSheetValues,
} from '@par-noir/device-cloud-credentials';
import { ownerFetch, ownerGet } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';

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

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

async function ownerMutatingFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return ownerFetch(authToken, method, path, body);
}

export async function persistRecoveryRequest(
  userPnIdentifier: string,
  authToken: string,
  payload: {
    requestId: string;
    publicKey: string;
    threshold: number;
    claimantName?: string;
    claimantContact?: string;
  }
): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/recovery/requests`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({
      userPnIdentifier,
      ...payload,
      claimantName: payload.claimantContact || payload.claimantName || '',
      status: 'pending',
    }),
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
  authToken?: string | null
): Promise<Array<{
  requestId: string;
  publicKey: string;
  status: string;
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
}>> {
  if (!authToken) return [];
  try {
    const drive = await sessionDriveFor(userPnIdentifier, authToken);
    const workbook = await findRecoveryWorkbookId(drive.accessToken, drive.index.metadataFolderId);
    if (!workbook) return [];
    return listDeviceRecoveryRequests(drive.accessToken, workbook);
  } catch {
    return [];
  }
}

export async function fetchRecoveryRequest(
  userPnIdentifier: string,
  authToken: string | null | undefined,
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
  const rows = await fetchRecoveryRequests(userPnIdentifier, authToken);
  return rows.find((row) => row.requestId === requestId) || null;
}

export async function fetchVaultShares(
  userPnIdentifier: string,
  authToken: string | null | undefined,
  requestId: string
): Promise<{
  vaultShares: Array<{ custodianId: string; shareIndex: number; encryptedShare: string }>;
  approvalCount: number;
  threshold: number;
  includesUnrevokableShare: boolean;
}> {
  const request = await fetchRecoveryRequest(userPnIdentifier, authToken, requestId);
  let vaultShares: Array<{ custodianId: string; shareIndex: number; encryptedShare: string }> = [];
  try {
    const parsed = request?.sharesJson ? JSON.parse(request.sharesJson) : [];
    if (Array.isArray(parsed)) vaultShares = parsed;
  } catch {
    vaultShares = [];
  }
  return {
    vaultShares,
    approvalCount: 0,
    threshold: request?.threshold || 0,
    includesUnrevokableShare: false,
  };
}

export async function reconcileRecoveryVault(
  userPnIdentifier: string,
  authToken: string,
  totalShares?: number
): Promise<{ normalized: number; missingIndices: number[] }> {
  const path = '/api/recovery/vault/reconcile';
  const body = { userPnIdentifier, totalShares };
  const res = await ownerMutatingFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to reconcile recovery vault');
  return res.json();
}

export async function initializeRecoveryVault(
  userPnIdentifier: string,
  authToken: string,
  shares: Array<{ shareIndex: number; encryptedShare: string }>
): Promise<{ inserted: number; skipped: number }> {
  const path = '/api/recovery/vault/initialize';
  const body = { userPnIdentifier, shares };
  const res = await ownerMutatingFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to initialize recovery vault');
  return res.json();
}

export async function fetchPendingVaultShares(
  userPnIdentifier: string,
  authToken: string,
  includeEncrypted = false
): Promise<Array<{ shareIndex: number; createdAt: string; encryptedShare?: string }>> {
  const q = includeEncrypted ? '?includeEncrypted=true' : '';
  const path = `/api/recovery/${encodeURIComponent(userPnIdentifier)}/vault/pending${q}`;
  const res = await ownerGet(authToken, path);
  if (!res.ok) return [];
  const data = await res.json();
  return data.pending || [];
}

export async function fetchRecoveryCustodianSummary(
  userPnIdentifier: string,
  authToken: string
): Promise<RecoveryCustodianSummary | null> {
  try {
    const drive = await sessionDriveFor(userPnIdentifier, authToken);
    const workbook = await findRecoveryWorkbookId(drive.accessToken, drive.index.metadataFolderId);
    if (!workbook) {
      return {
        custodians: [],
        pending: [],
        counts: { accepted: 0, acceptedUnrevokable: 0, invited: 0 },
      };
    }
    const rows = await readSheetValues(drive.accessToken, workbook, 'Custodians!A2:K');
    const custodians: RecoveryCustodianApiRow[] = rows
      .filter((row) => row[0])
      .map((row) => ({
        custodianId: row[0],
        name: row[1] || '',
        custodianType: row[2] || '',
        shareIndex: Number(row[4] || 0),
        custodianshipCredential: row[5] || '',
        status: row[6] || 'invited',
        createdAt: row[7] || '',
        unrevokable: row[8] === 'true' || row[8] === 'TRUE',
        custodianPublicKey: row[9] || undefined,
        custodianPnIdentifier: row[10] || undefined,
      }));
    const accepted = custodians.filter((c) => c.status === 'accepted').length;
    const acceptedUnrevokable = custodians.filter((c) => c.status === 'accepted' && c.unrevokable).length;
    const invited = custodians.filter((c) => c.status === 'invited').length;
    const pendingRows = await readSheetValues(drive.accessToken, workbook, 'PendingShares!A2:C');
    return {
      custodians,
      pending: pendingRows
        .filter((row) => row[0])
        .map((row) => ({ shareIndex: Number(row[0] || 0), createdAt: row[2] || '' })),
      counts: { accepted, acceptedUnrevokable, invited },
    };
  } catch {
    return null;
  }
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
  const path = '/api/recovery/custodians/assign';
  const body = { userPnIdentifier, ...payload };
  const res = await ownerMutatingFetch(authToken, 'POST', path, body);
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
  const path = `/api/recovery/custodians/${encodeURIComponent(custodianId)}/resend`;
  const body = { userPnIdentifier };
  const res = await ownerMutatingFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to resend custodian invitation');
  return res.json();
}

export async function revokeRecoveryCustodian(
  userPnIdentifier: string,
  authToken: string,
  custodianId: string,
  threshold?: number
): Promise<void> {
  const path = `/api/recovery/custodians/${encodeURIComponent(custodianId)}/revoke`;
  const body = { userPnIdentifier, threshold };
  const res = await ownerMutatingFetch(authToken, 'POST', path, body);
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

/** SHA-256 hex of the recovery key string (for failsafe registration / resolve). */
export async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const data = new TextEncoder().encode(recoveryKey.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function registerRecoveryFailsafe(
  authToken: string,
  payload: {
    userPnIdentifier: string;
    publicKey: string;
    envelope: unknown;
    keyHash?: string;
  }
): Promise<void> {
  const res = await ownerMutatingFetch(authToken, 'POST', '/api/recovery/failsafe/register', payload);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to register recovery failsafe');
  }
}

export async function fetchRecoveryFailsafeStatus(
  userPnIdentifier: string,
  authToken: string
): Promise<{ hasKey: boolean; hasEnvelope: boolean; createdAt?: string }> {
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/failsafe`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) return { hasKey: false, hasEnvelope: false };
  return res.json();
}

export async function startRecoveryWithFailsafeKey(payload: {
  recoveryKey: string;
  pnIdentifier?: string;
  threshold?: number;
  claimantContact?: string;
}): Promise<{
  requestId: string;
  pnIdentifier: string;
  publicKey: string;
  envelope: unknown;
  threshold: number;
  persisted: boolean;
}> {
  const keyHash = await hashRecoveryKey(payload.recoveryKey);
  const res = await fetch(`${API_ENDPOINT}/api/recovery/failsafe/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyHash,
      pnIdentifier: payload.pnIdentifier,
      threshold: payload.threshold,
      claimantContact: payload.claimantContact,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string; error?: string }).message || (err as { error?: string }).error || 'Invalid recovery key');
  }
  return res.json();
}

