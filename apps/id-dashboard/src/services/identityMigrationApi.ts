import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';

function authHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function migrationFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    method,
    headers: authHeaders(authToken, proof),
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

export async function startIdentityMigration(
  authToken: string,
  body: {
    predecessorPnIdentifier: string;
    successorPnIdentifier: string;
    predecessorDid: string;
    successorDid: string;
    migrationId?: string;
  }
): Promise<{
  migrationId: string;
  driveFolderId: string | null;
  requiredSteps: string[];
}> {
  const path = '/api/identity/migration/start';
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string }).error_description || 'Failed to start migration');
  }
  return res.json();
}

export async function ackMigrationStep(
  authToken: string,
  migrationId: string,
  stepId: string
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/steps/${encodeURIComponent(stepId)}`;
  const res = await migrationFetch(authToken, 'PATCH', path, {});
  if (!res.ok) throw new Error(`Failed to ack step ${stepId}`);
}

export async function fetchZkpsFromDrive(
  authToken: string,
  migrationId: string
): Promise<Array<{ dataPointId: string; zkpProof: string; proofType?: string }>> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/zkp-data-points/from-drive`;
  const res = await migrationFetch(authToken, 'GET', path);
  if (!res.ok) return [];
  const data = (await res.json()) as { proofs?: Array<{ dataPointId: string; zkpProof: string; proofType?: string }> };
  return data.proofs || [];
}

export async function batchReissueZkps(
  authToken: string,
  migrationId: string,
  userPnIdentifier: string,
  updates: Array<{ dataPointId: string; zkpProof: string; proofType?: string }>
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/zkp-data-points/batch`;
  const body = { userPnIdentifier, updates };
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to batch update ZKPs');
}

export async function rekeyConnection(
  authToken: string,
  migrationId: string,
  connectionId: string,
  userPnIdentifier: string,
  kemCiphertext: string
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/connections/rekey`;
  const body = { connectionId, userPnIdentifier, kemCiphertext };
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to rekey connection');
}

export async function rewrapGroupKeys(
  authToken: string,
  migrationId: string,
  ownerPnIdentifier: string,
  successorOwnerPnIdentifier: string,
  groupId: string,
  keyRotation: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: string }>
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/groups/rewrap`;
  const body = { ownerPnIdentifier, successorOwnerPnIdentifier, groupId, keyRotation };
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to rewrap group keys');
}

export async function batchRecoveryCustodians(
  authToken: string,
  migrationId: string,
  userPnIdentifier: string,
  custodians: Array<Record<string, unknown>>
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/recovery/custodians`;
  const body = { userPnIdentifier, custodians };
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to update recovery custodians');
}

export async function completeIdentityMigration(
  authToken: string,
  migrationId: string,
  body: {
    lineagePredecessorProof: string;
    lineageSuccessorProof: string;
    driveFolderId?: string;
    successorPublicKey: string;
  }
): Promise<void> {
  const path = `/api/identity/migration/${encodeURIComponent(migrationId)}/complete`;
  const res = await migrationFetch(authToken, 'POST', path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string; error?: string }).error_description || (err as { error?: string }).error || 'Failed to complete migration');
  }
}
