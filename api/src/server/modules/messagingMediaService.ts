/**
 * Messaging media — Drive folder helpers and recipient sharing for attachments.
 */

import { googleDriveProxyService } from './googleDriveProxy';
import { storageCredentialsService } from './storageCredentialsService';
import { MessageSheetsService } from './messageSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';

const ATTACHMENTS_FOLDER_NAME = 'attachments';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

async function getSenderDriveContext(senderPn: string, accountId?: string): Promise<{
  pnIdentifier: string;
  accessToken: string;
  token: GoogleDriveToken;
  accountId: string;
  pnFolderId: string;
}> {
  const pnIdentifier = normalizePn(senderPn);
  const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
  const credentials = credentialsRecord?.credentials;
  if (!credentials) {
    throw new Error('Sender Google Drive credentials not found');
  }
  const accounts =
    credentials.googleDriveAccounts ||
    (credentials.googleDrive ? [credentials.googleDrive] : []);
  if (accounts.length === 0) {
    throw new Error('Sender has no Google Drive account connected');
  }

  let account = accounts[0] as {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    refreshToken?: string;
    expires_at?: number;
    expires_in?: number;
    backendId?: string;
    keyPrefix?: string;
    accountId?: string;
  };
  if (accountId) {
    const match = accounts.find(
      (acc: any) =>
        acc.backendId === accountId ||
        acc.keyPrefix === accountId ||
        acc.accountId === accountId
    );
    if (match) {
      account = match;
    }
  }

  const resolvedAccountId =
    accountId ||
    account.accountId ||
    account.backendId ||
    account.keyPrefix ||
    'default';

  const token: GoogleDriveToken = {
    access_token: account.access_token || account.accessToken || '',
    refresh_token: account.refresh_token || account.refreshToken,
    expires_at: account.expires_at,
    expires_in: account.expires_in
  };

  const accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, resolvedAccountId);

  const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
  const index = readPnDriveIndex(credentials as Record<string, unknown>);
  if (!isPnDriveIndexComplete(index)) {
    throw new Error('Sender Google Drive index not initialized');
  }
  const pnFolderId = index.pnFolderId;

  return { pnIdentifier, accessToken, token, accountId: resolvedAccountId, pnFolderId };
}

/**
 * Ensure par-noir-messages/attachments/ exists under the sender's pN folder.
 */
export async function ensureMessagesAttachmentsFolder(
  senderPn: string,
  accountId?: string
): Promise<string> {
  const ctx = await getSenderDriveContext(senderPn, accountId);
  const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
    ctx.token,
    ctx.pnFolderId,
    ctx.pnIdentifier,
    ctx.accountId
  );

  const folderQuery = `name='${ATTACHMENTS_FOLDER_NAME}' and '${messagesFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${ctx.accessToken}` } }
  );
  if (searchRes.ok) {
    const data = (await searchRes.json()) as { files?: Array<{ id: string }> };
    if (data.files?.[0]?.id) {
      return data.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: ATTACHMENTS_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [messagesFolderId]
    })
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create messaging attachments folder: ${text}`);
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new Error('Failed to create messaging attachments folder: no id returned');
  }
  return created.id;
}

/**
 * Grant Drive reader on sender-owned attachment to each recipient's Google email.
 */
export async function shareAttachmentWithRecipients(
  senderPn: string,
  driveFileId: string,
  recipientPnIdentifiers: string[],
  senderAccountId?: string
): Promise<void> {
  const ctx = await getSenderDriveContext(senderPn, senderAccountId);
  const uniqueRecipients = [...new Set(recipientPnIdentifiers.map(normalizePn))];

  for (const recipientPn of uniqueRecipients) {
    const email = await googleDriveProxyService.getGoogleEmailForPn(recipientPn);
    if (!email) {
      throw new Error(
        `Cannot share attachment: recipient has no Google Drive email on file (${recipientPn})`
      );
    }
    await googleDriveProxyService.grantReaderPermission(ctx.accessToken, driveFileId, email);
  }
}

/** Exclude Drive system / messaging artifacts from shared-with-me listings. */
export function isMessagingLibraryDriveFile(file: { name?: string; mimeType?: string }): boolean {
  const name = (file.name || '').toLowerCase();
  const mime = file.mimeType || '';
  if (mime === 'application/vnd.google-apps.folder') {
    return false;
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    return false;
  }
  if (name.endsWith('.xlsx')) {
    return false;
  }
  if (name.startsWith('conversation-')) {
    return false;
  }
  if (name === 'inbox' || name === '_metadata') {
    return false;
  }
  return true;
}
