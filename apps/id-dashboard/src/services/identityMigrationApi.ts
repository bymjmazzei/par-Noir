import { ownerFetch } from './ownerApiService';

/** Non-Drive migration routes: Bearer + device proof only (no cloud AT required). */
async function migrationMetaFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return ownerFetch(authToken, method, path, body);
}

/** Drive-backed migration routes: require forwarded X-PN-Cloud-Access-Token. */
async function migrationDriveFetch(
  authToken: string,
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return ownerFetch(authToken, method, path, body, { pnIdentifier });
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
  const res = await migrationMetaFetch(authToken, 'POST', path, body);
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
  const res = await migrationMetaFetch(authToken, 'PATCH', path, {});
  if (!res.ok) throw new Error(`Failed to ack step ${stepId}`);
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
  const res = await migrationDriveFetch(authToken, userPnIdentifier, 'POST', path, body);
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
  const res = await migrationDriveFetch(authToken, ownerPnIdentifier, 'POST', path, body);
  if (!res.ok) throw new Error('Failed to rewrap group keys');
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
  const res = await migrationMetaFetch(authToken, 'POST', path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string; error?: string }).error_description || (err as { error?: string }).error || 'Failed to complete migration');
  }
}
