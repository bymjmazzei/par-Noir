import { apiFetch, ownerFetch } from './ownerApiFetch';

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
  _authToken: string,
  _migrationId: string,
  _participantPn: string,
  ownerPnIdentifier: string,
  spreadsheetId?: string
): Promise<{
  rows: Array<{ rowIndex: number; fromPnIdentifier: string; encryptedContent: string }>;
  spreadsheetId: string;
}> {
  if (!spreadsheetId) return { rows: [], spreadsheetId: '' };
  const { getCloudAccessTokenFromSession, readSheetValues } = await import(
    '@par-noir/device-cloud-credentials'
  );
  const pn = ownerPnIdentifier.startsWith('pn-') ? ownerPnIdentifier : `pn-${ownerPnIdentifier}`;
  const accessToken = getCloudAccessTokenFromSession(pn);
  if (!accessToken) return { rows: [], spreadsheetId };
  const values = await readSheetValues(accessToken, spreadsheetId, 'Messages!A2:J');
  const rows = values
    .map((row, index) => ({
      rowIndex: index + 2,
      fromPnIdentifier: row[0] || '',
      encryptedContent: row[1] || '',
    }))
    .filter((row) => row.fromPnIdentifier || row.encryptedContent);
  return { rows, spreadsheetId };
}

export async function postDmMessageRowUpdates(
  _authToken: string,
  _migrationId: string,
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
  if (!body.spreadsheetId) return;
  const { getCloudAccessTokenFromSession, writeSheetValues } = await import(
    '@par-noir/device-cloud-credentials'
  );
  const pn = ownerPnIdentifier.startsWith('pn-') ? ownerPnIdentifier : `pn-${ownerPnIdentifier}`;
  const accessToken = getCloudAccessTokenFromSession(pn);
  if (!accessToken) throw new Error('cloud_on_device');
  for (const update of body.rowUpdates) {
    if (!update.rowIndex || update.encryptedContent == null) continue;
    await writeSheetValues(
      accessToken,
      body.spreadsheetId,
      `Messages!B${update.rowIndex}`,
      [[update.encryptedContent]]
    );
  }
}
