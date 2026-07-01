import { API_ENDPOINT } from '../config/api';

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
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

export async function rewrapConnectionRoot(
  authToken: string,
  migrationId: string,
  connectionId: string,
  userPnIdentifier: string,
  participantPnIdentifier: string,
  wrappedMessageRootKey: string
): Promise<void> {
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/connections/rewrap-root`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({
        connectionId,
        userPnIdentifier,
        participantPnIdentifier,
        wrappedMessageRootKey,
      }),
    }
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

export async function ackMigrationStep(
  authToken: string,
  migrationId: string,
  stepId: string
): Promise<void> {
  await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/steps/${encodeURIComponent(stepId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(authToken),
      body: JSON.stringify({}),
    }
  );
}

export async function fetchConversationRowsForMigration(
  authToken: string,
  migrationId: string,
  participantPn: string,
  spreadsheetId?: string
): Promise<{
  rows: Array<{ rowIndex: number; fromPnIdentifier: string; encryptedContent: string }>;
  spreadsheetId: string;
}> {
  const qs = spreadsheetId ? `?spreadsheetId=${encodeURIComponent(spreadsheetId)}` : '';
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/conversations/${encodeURIComponent(participantPn)}/rows${qs}`,
    { headers: authHeaders(authToken) }
  );
  if (!res.ok) return { rows: [], spreadsheetId: spreadsheetId || '' };
  return res.json();
}

export async function postDmMessageRowUpdates(
  authToken: string,
  migrationId: string,
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
  const res = await fetch(
    `${API_ENDPOINT}/api/identity/migration/${encodeURIComponent(migrationId)}/drive/messages/rows`,
    {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error('Failed to update conversation rows');
}
