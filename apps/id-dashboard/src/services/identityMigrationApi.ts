import { API_ENDPOINT } from '../config/api';

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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
  const res = await fetch(`${API_ENDPOINT}/api/identity/migration/start`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(body),
  });
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
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/steps/${encodeURIComponent(stepId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(authToken),
      body: JSON.stringify({}),
    }
  );
  if (!res.ok) throw new Error(`Failed to ack step ${stepId}`);
}

export async function batchReissueZkps(
  authToken: string,
  migrationId: string,
  userPnIdentifier: string,
  updates: Array<{ dataPointId: string; zkpProof: string; proofType?: string }>
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/zkp-data-points/batch`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({ userPnIdentifier, updates }),
    }
  );
  if (!res.ok) throw new Error('Failed to batch update ZKPs');
}

export async function rekeyConnection(
  authToken: string,
  migrationId: string,
  connectionId: string,
  userPnIdentifier: string,
  kemCiphertext: string
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/connections/rekey`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({ connectionId, userPnIdentifier, kemCiphertext }),
    }
  );
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
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/groups/rewrap`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({ ownerPnIdentifier, successorOwnerPnIdentifier, groupId, keyRotation }),
    }
  );
  if (!res.ok) throw new Error('Failed to rewrap group keys');
}

export async function batchRecoveryCustodians(
  authToken: string,
  migrationId: string,
  userPnIdentifier: string,
  custodians: Array<Record<string, unknown>>
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/recovery/custodians`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({ userPnIdentifier, custodians }),
    }
  );
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
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/complete`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string; error?: string }).error_description || (err as { error?: string }).error || 'Failed to complete migration');
  }
}
