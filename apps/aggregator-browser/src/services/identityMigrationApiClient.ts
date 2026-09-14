import { apiFetch, ownerFetch, ownerGet } from './ownerApiFetch';

/** Non-Drive step ack — Bearer session only. */
export async function ackMigrationStep(
  authToken: string,
  migrationId: string,
  stepId: string
): Promise<void> {
  await apiFetch(
    'PATCH',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/steps/${encodeURIComponent(stepId)}`,
    {},
    { authToken }
  );
}

export async function rekeyConnection(
  authToken: string,
  migrationId: string,
  connectionId: string,
  userPnIdentifier: string,
  kemCiphertext: string
): Promise<void> {
  const res = await ownerFetch(
    'POST',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/connections/rekey`,
    { connectionId, userPnIdentifier, kemCiphertext },
    { authToken, pnIdentifier: userPnIdentifier }
  );
  if (!res.ok) throw new Error('Failed to rekey connection');
}

export async function rewrapConnectionRoot(
  authToken: string,
  migrationId: string,
  connectionId: string,
  userPnIdentifier: string,
  participantPnIdentifier: string,
  wrappedMessageRootKey: string
): Promise<void> {
  const res = await ownerFetch(
    'POST',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/connections/rewrap-root`,
    {
      connectionId,
      userPnIdentifier,
      participantPnIdentifier,
      wrappedMessageRootKey,
    },
    { authToken, pnIdentifier: userPnIdentifier }
  );
  if (!res.ok) throw new Error('Failed to rewrap connection root');
}

export async function rewrapGroupKeys(
  authToken: string,
  migrationId: string,
  ownerPnIdentifier: string,
  successorOwnerPnIdentifier: string,
  groupId: string,
  keyRotation: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: string }>
): Promise<void> {
  const res = await ownerFetch(
    'POST',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/groups/rewrap`,
    { ownerPnIdentifier, successorOwnerPnIdentifier, groupId, keyRotation },
    { authToken, pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) throw new Error('Failed to rewrap group keys');
}

export async function fetchConversationRowsForMigration(
  authToken: string,
  migrationId: string,
  participantPn: string,
  ownerPnIdentifier: string,
  spreadsheetId?: string
): Promise<{
  rows: Array<{ rowIndex: number; fromPnIdentifier: string; encryptedContent: string }>;
  spreadsheetId: string;
}> {
  const qs = spreadsheetId ? `?spreadsheetId=${encodeURIComponent(spreadsheetId)}` : '';
  const res = await ownerGet(
    `/api/identity/migration/${encodeURIComponent(migrationId)}/conversations/${encodeURIComponent(participantPn)}/rows${qs}`,
    { authToken, pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) return { rows: [], spreadsheetId: spreadsheetId || '' };
  return res.json();
}

export async function postDmMessageRowUpdates(
  authToken: string,
  migrationId: string,
  ownerPnIdentifier: string,
  body: {
    connectionId: string;
    kemCiphertext?: string;
    spreadsheetId?: string;
    participantPnIdentifier?: string;
    rowUpdates: Array<{
      rowIndex: number;
      fromPnIdentifier?: string;
      encryptedContent?: string;
    }>;
  }
): Promise<void> {
  const res = await ownerFetch(
    'POST',
    `/api/identity/migration/${encodeURIComponent(migrationId)}/drive/messages/rows`,
    body,
    { authToken, pnIdentifier: ownerPnIdentifier }
  );
  if (!res.ok) throw new Error('Failed to update conversation rows');
}
