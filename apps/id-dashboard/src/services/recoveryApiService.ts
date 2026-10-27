import { API_ENDPOINT } from '../config/api';
import type {
  KeyRecoveryEnvelope,
  RecoveryEnvelope,
  RecoveryZkApprovalPayload,
} from '@par-noir/recovery-crypto';
import { ownerFetch, ownerGet } from './ownerApiService';

export interface RecoveryCustodianApiRow {
  custodianId: string;
  name: string;
  custodianType: string;
  shareIndex: number;
  custodianshipCredential: string;
  status: string;
  createdAt: string;
  unrevokable: boolean;
  /** Published by the custodian on accept; shares are sealed to it. */
  mlKemPublicKey: string | null;
  /** Custodian holds the share for the current epoch. */
  custodyCurrent: boolean;
  /** A share delivery for the current epoch is waiting for the custodian. */
  custodyPending: boolean;
}

export interface RecoveryCustodianSummary {
  configured: boolean;
  epoch: number | null;
  threshold: number | null;
  totalShares: number | null;
  custodians: RecoveryCustodianApiRow[];
  counts: {
    accepted: number;
    acceptedUnrevokable: number;
    invited: number;
    /** Accepted and holding the current-epoch share. */
    ready: number;
    readyUnrevokable: number;
  };
}

export type RecoveryRequestType = 'identity_recovery' | 'device_registry_reset' | 'key_recovery';

/** key_only: recovery key + Drive + 24h wait. custodians: the key starts custodian approval. */
export type RecoveryFailsafeMode = 'key_only' | 'custodians';

export interface OwnerRecoveryRequest {
  requestId: string;
  requestType: RecoveryRequestType;
  status: string;
  approvalCount: number;
  threshold: number;
  includesUnrevokableShare: boolean;
  claimantContact: string;
  createdAt: string;
  releaseAfter: string;
  expiresAt: string;
}

export interface CustodianRecoveryRequest extends OwnerRecoveryRequest {
  ownerPublicKey: string;
  custodianId: string;
  shareIndex: number;
  custodianshipCredential: string;
  epoch: number;
  temporaryPublicKey: string | null;
}

export interface CustodyDelivery {
  deliveryId: string;
  ownerPublicKey: string;
  custodianId: string;
  shareIndex: number;
  epoch: number;
  sealedShare: string;
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  return new Error(err.message || err.error || fallback);
}

async function ownerJson<T>(authToken: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = method === 'GET' ? await ownerGet(authToken, path) : await ownerFetch(authToken, method, path, body);
  if (!res.ok) throw await errorFrom(res, `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function publicJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await errorFrom(res, `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

export function setupRecoveryEpoch(
  authToken: string,
  payload: { ownerPublicKey: string; threshold: number; totalShares: number; rotate?: boolean }
): Promise<{ epoch: number; threshold: number; totalShares: number }> {
  return ownerJson(authToken, 'POST', '/api/recovery/owner/epoch', payload);
}

export async function fetchRecoveryCustodianSummary(
  _userPnIdentifier: string,
  authToken: string
): Promise<RecoveryCustodianSummary | null> {
  try {
    return await ownerJson<RecoveryCustodianSummary>(authToken, 'GET', '/api/recovery/owner/summary');
  } catch (err) {
    console.warn('[recovery] custodian summary unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function registerRecoveryCustodian(
  authToken: string,
  payload: {
    custodianId: string;
    name: string;
    custodianType: string;
    shareIndex: number;
    custodianshipCredential: string;
    unrevokable: boolean;
  }
): Promise<{ custodianId: string; shareIndex: number }> {
  return ownerJson(authToken, 'POST', '/api/recovery/owner/custodians', payload);
}

export function sendCustodyDelivery(
  authToken: string,
  custodianId: string,
  payload: { epoch: number; sealedShare: string }
): Promise<{ success: boolean }> {
  return ownerJson(
    authToken,
    'POST',
    `/api/recovery/owner/custodians/${encodeURIComponent(custodianId)}/custody`,
    payload
  );
}

export function revokeRecoveryCustodian(
  authToken: string,
  custodianId: string
): Promise<{ success: boolean; resplitRequired: boolean }> {
  return ownerJson(
    authToken,
    'POST',
    `/api/recovery/owner/custodians/${encodeURIComponent(custodianId)}/revoke`,
    {}
  );
}

export async function fetchOwnerRecoveryRequests(authToken: string): Promise<OwnerRecoveryRequest[]> {
  const data = await ownerJson<{ requests: OwnerRecoveryRequest[] }>(authToken, 'GET', '/api/recovery/owner/requests');
  return data.requests || [];
}

export function cancelOwnerRecoveryRequest(authToken: string, requestId: string): Promise<{ status: string }> {
  return ownerJson(
    authToken,
    'POST',
    `/api/recovery/owner/requests/${encodeURIComponent(requestId)}/cancel`,
    {}
  );
}

/** Keyed device only: let a key-only recovery finish now instead of after the wait. */
export function approveOwnerRecoveryRequest(
  authToken: string,
  requestId: string
): Promise<{ status: string; releaseAfter: string }> {
  return ownerJson(
    authToken,
    'POST',
    `/api/recovery/owner/requests/${encodeURIComponent(requestId)}/approve`,
    {}
  );
}

export function startDeviceRegistryReset(
  authToken: string
): Promise<{ requestId: string; threshold: number }> {
  return ownerJson(authToken, 'POST', '/api/recovery/owner/device-reset', {});
}

// ---------------------------------------------------------------------------
// Custodian
// ---------------------------------------------------------------------------

export async function acceptRecoveryCustodianship(
  ownerPnIdentifier: string,
  authToken: string,
  custodianId: string,
  custodianshipZkp: string,
  mlKemPublicKey: string
): Promise<void> {
  await ownerJson(authToken, 'POST', '/api/recovery/custodian/accept', {
    ownerPnIdentifier,
    custodianId,
    custodianshipZkp,
    mlKemPublicKey,
  });
}

export async function fetchCustodyDeliveries(authToken: string): Promise<CustodyDelivery[]> {
  const data = await ownerJson<{ deliveries: CustodyDelivery[] }>(authToken, 'GET', '/api/recovery/custodian/custody');
  return data.deliveries || [];
}

export async function ackCustodyDeliveries(authToken: string, deliveryIds: string[]): Promise<number> {
  const data = await ownerJson<{ acked: number }>(authToken, 'POST', '/api/recovery/custodian/custody/ack', {
    deliveryIds,
  });
  return data.acked;
}

export async function fetchCustodianRecoveryRequests(authToken: string): Promise<CustodianRecoveryRequest[]> {
  const data = await ownerJson<{ requests: CustodianRecoveryRequest[] }>(
    authToken,
    'GET',
    '/api/recovery/custodian/requests'
  );
  return data.requests || [];
}

export function submitRecoveryApproval(
  authToken: string,
  requestId: string,
  payload: { custodianId: string; approval: RecoveryZkApprovalPayload; sealedShare?: string }
): Promise<{ status: string; approvalCount: number; includesUnrevokableShare: boolean; reason?: string }> {
  return ownerJson(
    authToken,
    'POST',
    `/api/recovery/custodian/requests/${encodeURIComponent(requestId)}/approve`,
    payload
  );
}

// ---------------------------------------------------------------------------
// Failsafe key + claimant (no pN session)
// ---------------------------------------------------------------------------

/** SHA-256 hex of the recovery key string (failsafe registration / start / release). */
export async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  const data = new TextEncoder().encode(recoveryKey.trim());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface RecoverySetupOwnerProof {
  challengeId: string;
  publicKey: string;
  signature: string;
}

export function fetchRecoverySetupChallenge(
  authToken: string
): Promise<{ challengeId: string; challenge: string; expiresAt: number }> {
  return ownerJson(authToken, 'POST', '/api/recovery/owner/setup-challenge', {});
}

export async function registerRecoveryFailsafe(
  authToken: string,
  payload: {
    userPnIdentifier: string;
    publicKey: string;
    envelope?: unknown;
    /** Key-only mode: recovery data sealed to the recovery key itself. */
    keyEnvelope?: KeyRecoveryEnvelope;
    keyHash?: string;
    driveProofHash?: string;
    /** Required before any device is keyed; ignored by the API on keyed devices. */
    ownerProof?: RecoverySetupOwnerProof;
  }
): Promise<void> {
  await ownerJson(authToken, 'POST', '/api/recovery/failsafe/register', payload);
}

export async function fetchRecoveryFailsafeStatus(
  userPnIdentifier: string,
  authToken: string
): Promise<{
  hasKey: boolean;
  hasEnvelope: boolean;
  hasDriveProof?: boolean;
  mode?: RecoveryFailsafeMode | null;
  createdAt?: string;
}> {
  const res = await fetch(
    `${API_ENDPOINT}/api/recovery/${encodeURIComponent(userPnIdentifier)}/failsafe`,
    { headers: { Authorization: `Bearer ${authToken}` } }
  );
  if (!res.ok) return { hasKey: false, hasEnvelope: false };
  return res.json();
}

export type StartRecoveryResult = {
  requestId: string;
  pnIdentifier: string;
  publicKey: string;
  threshold: number;
  releaseAfter: string;
  expiresAt: string;
} & ({ mode: 'key_only' } | { mode: 'custodians'; envelope: RecoveryEnvelope });

export function startRecoveryWithFailsafeKey(payload: {
  keyHash: string;
  temporaryPublicKey: string;
  claimantContact?: string;
}): Promise<StartRecoveryResult> {
  return publicJson('POST', '/api/recovery/failsafe/start', payload);
}

export function fetchRecoveryRequestStatus(requestId: string): Promise<{
  requestType: RecoveryRequestType;
  status: string;
  approvalCount: number;
  threshold: number;
  includesUnrevokableShare: boolean;
  releaseAfter: string;
  expiresAt: string;
}> {
  return publicJson('GET', `/api/recovery/requests/${encodeURIComponent(requestId)}/status`);
}

export function releaseRecoveryShares(
  requestId: string,
  payload: { keyHash: string; driveProof: string }
): Promise<{
  pnIdentifier: string;
  publicKey: string;
  envelope: RecoveryEnvelope;
  shares: Array<{ custodianId: string; shareIndex: number; epoch: number; sealedShare: string }>;
}> {
  return publicJson('POST', `/api/recovery/requests/${encodeURIComponent(requestId)}/release`, payload);
}

/** Key-only release: the key envelope comes back once, then the server drops the key. */
export function releaseKeyRecovery(
  requestId: string,
  payload: { keyHash: string; driveProof: string }
): Promise<{ mode: 'key_only'; pnIdentifier: string; publicKey: string; keyEnvelope: KeyRecoveryEnvelope }> {
  return publicJson('POST', `/api/recovery/requests/${encodeURIComponent(requestId)}/release`, payload);
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
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to migrate platform id');
}
