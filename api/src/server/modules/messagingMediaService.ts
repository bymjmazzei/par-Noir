/**
 * Messaging media — attachments dual-written into each user's own silo (no peer Drive ACLs).
 */

import { genericAttachmentFileName } from '@par-noir/dm-crypto';
import { googleDriveProxyService } from './googleDriveProxy';
import { storageCredentialsService } from './storageCredentialsService';
import { MessageSheetsService } from './messageSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';

const ATTACHMENTS_FOLDER_NAME = 'attachments';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOwnerDriveContext(ownerPn: string, accountId?: string): Promise<{
  pnIdentifier: string;
  accessToken: string;
  token: GoogleDriveToken;
  accountId: string;
  pnFolderId: string;
}> {
  const pnIdentifier = normalizePn(ownerPn);
  const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
  const credentials = credentialsRecord?.credentials;
  if (!credentials) {
    throw new Error('Google Drive credentials not found');
  }
  const accounts =
    credentials.googleDriveAccounts ||
    (credentials.googleDrive ? [credentials.googleDrive] : []);
  if (accounts.length === 0) {
    throw new Error('No Google Drive account connected');
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
    throw new Error('Google Drive index not initialized');
  }
  const pnFolderId = index.pnFolderId;

  return { pnIdentifier, accessToken, token, accountId: resolvedAccountId, pnFolderId };
}

/**
 * Ensure par-noir-messages/attachments/ exists under the owner's pN folder.
 */
export async function ensureMessagesAttachmentsFolder(
  ownerPn: string,
  accountId?: string
): Promise<string> {
  const ctx = await getOwnerDriveContext(ownerPn, accountId);
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

export type MediaCopyInput = {
  /** Recipient pN → pre-encrypted envelope (UTF-8). When set, skip byte-copy from sender. */
  envelopeByPn?: Record<string, string>;
};

/**
 * Dual-write attachment into each recipient's own attachments folder.
 * Returns map of pnIdentifier → mediaFileId for that silo (includes sender unchanged).
 * No peer Drive ACLs.
 */
export async function dualWriteAttachmentToRecipients(
  senderPn: string,
  senderMediaFileId: string,
  recipientPnIdentifiers: string[],
  senderAccountId?: string,
  opts?: MediaCopyInput & { jitterMs?: number }
): Promise<Record<string, string>> {
  const senderNorm = normalizePn(senderPn);
  const result: Record<string, string> = { [senderNorm]: senderMediaFileId };
  const uniqueRecipients = [
    ...new Set(recipientPnIdentifiers.map(normalizePn).filter((pn) => pn !== senderNorm))
  ];
  if (uniqueRecipients.length === 0) {
    return result;
  }

  let senderBytes: Buffer | undefined;
  const needCopy = uniqueRecipients.some((pn) => !opts?.envelopeByPn?.[pn]);
  if (needCopy) {
    const blob = await googleDriveProxyService.downloadFile(
      senderNorm,
      senderMediaFileId,
      senderAccountId
    );
    const ab = await blob.arrayBuffer();
    senderBytes = Buffer.from(ab);
  }

  for (let i = 0; i < uniqueRecipients.length; i++) {
    const recipientPn = uniqueRecipients[i];
    if (opts?.jitterMs && opts.jitterMs > 0 && i > 0) {
      const jitter = Math.floor(Math.random() * opts.jitterMs);
      await sleep(jitter);
    }

    const folderId = await ensureMessagesAttachmentsFolder(recipientPn);
    const fileName = genericAttachmentFileName();
    const envelope = opts?.envelopeByPn?.[recipientPn];
    const body = envelope ? Buffer.from(envelope, 'utf8') : senderBytes!;
    const uploaded = await googleDriveProxyService.uploadFile(
      recipientPn,
      body,
      fileName,
      'application/octet-stream',
      [folderId]
    );
    if (!uploaded?.id) {
      throw new Error(`Failed to dual-write attachment for ${recipientPn}`);
    }
    result[recipientPn] = uploaded.id;
  }

  return result;
}

/**
 * @deprecated Peer ACLs removed — use dualWriteAttachmentToRecipients.
 * Kept as no-op so stale imports fail soft if any remain.
 */
export async function shareAttachmentWithRecipients(
  _senderPn: string,
  _driveFileId: string,
  _recipientPnIdentifiers: string[],
  _senderAccountId?: string
): Promise<void> {
  throw new Error(
    'shareAttachmentWithRecipients is removed; use dualWriteAttachmentToRecipients (no peer Drive ACLs)'
  );
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
