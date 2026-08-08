/**
 * Messaging media — attachments dual-written into each user's own silo (no peer Drive ACLs).
 * Supports Google Drive and portable social-cloud blob backends.
 */

import { genericAttachmentFileName } from '@par-noir/dm-crypto';
import {
  ATTACHMENTS_DIR,
  messagesPath,
  type StorageProviderId
} from '@par-noir/user-owned-storage';
import { googleDriveProxyService } from './googleDriveProxy';
import { storageCredentialsService } from './storageCredentialsService';
import { MessageSheetsService } from './messageSheetsService';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableSocialCloud } from './storage/storageProviderUtils';
import { resolveSocialCloudContext } from './storage/storageFacade';

const ATTACHMENTS_FOLDER_NAME = ATTACHMENTS_DIR;

/** Relative blob key prefix or Google Drive folder id, plus provider. */
export interface MediaAttachmentRef {
  backend: StorageProviderId;
  backendFileId: string;
  accountId?: string;
}

export type MediaAttachmentLocation = MediaAttachmentRef & {
  /** @deprecated use backendFileId — present for Drive clients expecting folderId */
  folderId?: string;
};

export type MediaCopyInput = {
  /** Recipient pN → pre-encrypted envelope (UTF-8). When set, skip byte-copy from sender. */
  envelopeByPn?: Record<string, string>;
};

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

function attachmentsPrefix(): string {
  return messagesPath(ATTACHMENTS_DIR);
}

function attachmentRelativeKey(fileName: string): string {
  return messagesPath(ATTACHMENTS_DIR, fileName);
}

function resolveBlobKey(rootPrefix: string, backendFileId: string): string {
  return backendFileId.startsWith(rootPrefix)
    ? backendFileId
    : `${rootPrefix}${backendFileId}`;
}

export function normalizeMediaRef(
  mediaFileId?: string,
  mediaBackend?: string,
  accountId?: string
): MediaAttachmentRef | undefined {
  if (!mediaFileId) return undefined;
  return {
    backend: (mediaBackend as StorageProviderId) || 'google_drive',
    backendFileId: mediaFileId,
    accountId
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOwnerDriveContext(
  ownerPn: string,
  accountId?: string,
  /** Prefer a forwarded cloud access token (e.g. extractCloudAccessToken(req)). */
  accessTokenOverride?: string
): Promise<{
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

  const forwarded =
    (typeof accessTokenOverride === 'string' && accessTokenOverride.trim()) ||
    String(account.access_token || account.accessToken || '').trim();
  const accessToken =
    forwarded ||
    (await googleDriveProxyService.getAccessToken(pnIdentifier, resolvedAccountId));

  const token: GoogleDriveToken = {
    access_token: accessToken,
    refresh_token: account.refresh_token || account.refreshToken,
    expires_at: account.expires_at,
    expires_in: account.expires_in
  };

  const { readPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
  const index = readPnDriveIndex(credentials as Record<string, unknown>);
  if (!isPnDriveIndexComplete(index)) {
    throw new Error('Google Drive index not initialized');
  }
  const pnFolderId = index.pnFolderId;

  return { pnIdentifier, accessToken, token, accountId: resolvedAccountId, pnFolderId };
}

async function downloadAttachmentBytes(ownerPn: string, ref: MediaAttachmentRef): Promise<Buffer> {
  if (ref.backend === 'google_drive') {
    const blob = await googleDriveProxyService.downloadFile(
      normalizePn(ownerPn),
      ref.backendFileId,
      ref.accountId
    );
    return Buffer.from(await blob.arrayBuffer());
  }

  const ctx = await resolveSocialCloudContext(normalizePn(ownerPn), ref.accountId);
  if (!ctx.blobStore) {
    throw new Error('Blob store unavailable for attachment download');
  }
  const fullKey = resolveBlobKey(ctx.rootPrefix, ref.backendFileId);
  const data = await ctx.blobStore.get(fullKey);
  if (!data) {
    throw new Error('Attachment blob not found');
  }
  return Buffer.from(data);
}

async function uploadAttachmentBytes(
  ownerPn: string,
  body: Buffer,
  fileName: string,
  refAccountId?: string
): Promise<MediaAttachmentRef> {
  const pnIdentifier = normalizePn(ownerPn);

  if (await isPortableSocialCloud(pnIdentifier)) {
    const ctx = await resolveSocialCloudContext(pnIdentifier, refAccountId);
    if (!ctx.blobStore) {
      throw new Error('Blob store unavailable for attachment upload');
    }
    const relativeKey = attachmentRelativeKey(fileName);
    const fullKey = resolveBlobKey(ctx.rootPrefix, relativeKey);
    await ctx.blobStore.put(fullKey, body, { contentType: 'application/octet-stream' });
    return {
      backend: ctx.provider,
      backendFileId: relativeKey,
      accountId: ctx.accountId
    };
  }

  const ctx = await getOwnerDriveContext(pnIdentifier, refAccountId);
  const folderId = await ensureMessagesAttachmentsFolderDrive(ctx);
  const uploaded = await googleDriveProxyService.uploadFile(
    pnIdentifier,
    body,
    fileName,
    'application/octet-stream',
    [folderId]
  );
  if (!uploaded?.id) {
    throw new Error(`Failed to upload attachment for ${pnIdentifier}`);
  }
  return {
    backend: 'google_drive',
    backendFileId: uploaded.id,
    accountId: ctx.accountId
  };
}

async function ensureMessagesAttachmentsFolderDrive(ctx: {
  token: GoogleDriveToken;
  pnFolderId: string;
  pnIdentifier: string;
  accountId: string;
  accessToken: string;
}): Promise<string> {
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
 * Resolve where messaging attachments live for the owner (Drive folder id or blob prefix).
 */
export async function ensureMessagesAttachmentsFolder(
  ownerPn: string,
  accountId?: string,
  /** Forwarded X-PN-Cloud-Access-Token (required under device cloud custody). */
  accessToken?: string
): Promise<MediaAttachmentLocation> {
  const pnIdentifier = normalizePn(ownerPn);

  if (await isPortableSocialCloud(pnIdentifier)) {
    const ctx = await resolveSocialCloudContext(pnIdentifier, accountId);
    const prefix = attachmentsPrefix();
    return {
      backend: ctx.provider,
      backendFileId: prefix,
      folderId: prefix,
      accountId: ctx.accountId
    };
  }

  const ctx = await getOwnerDriveContext(pnIdentifier, accountId, accessToken);
  const folderId = await ensureMessagesAttachmentsFolderDrive(ctx);
  return {
    backend: 'google_drive',
    backendFileId: folderId,
    folderId,
    accountId: ctx.accountId
  };
}

/**
 * Dual-write attachment into each recipient's own attachments folder.
 * Returns map of pnIdentifier → ref for that silo (includes sender unchanged).
 * No peer Drive ACLs.
 */
export async function dualWriteAttachmentToRecipients(
  senderPn: string,
  senderRef: MediaAttachmentRef | string,
  recipientPnIdentifiers: string[],
  senderAccountId?: string,
  opts?: MediaCopyInput & { jitterMs?: number; senderMediaBackend?: StorageProviderId }
): Promise<Record<string, MediaAttachmentRef>> {
  const senderNorm = normalizePn(senderPn);
  const resolvedSenderRef: MediaAttachmentRef =
    typeof senderRef === 'string'
      ? {
          backend: opts?.senderMediaBackend || 'google_drive',
          backendFileId: senderRef,
          accountId: senderAccountId
        }
      : senderRef;

  const result: Record<string, MediaAttachmentRef> = {
    [senderNorm]: resolvedSenderRef
  };

  const uniqueRecipients = [
    ...new Set(recipientPnIdentifiers.map(normalizePn).filter((pn) => pn !== senderNorm))
  ];
  if (uniqueRecipients.length === 0) {
    return result;
  }

  let senderBytes: Buffer | undefined;
  const needCopy = uniqueRecipients.some((pn) => !opts?.envelopeByPn?.[pn]);
  if (needCopy) {
    senderBytes = await downloadAttachmentBytes(senderNorm, resolvedSenderRef);
  }

  for (let i = 0; i < uniqueRecipients.length; i++) {
    const recipientPn = uniqueRecipients[i];
    if (opts?.jitterMs && opts.jitterMs > 0 && i > 0) {
      const jitter = Math.floor(Math.random() * opts.jitterMs);
      await sleep(jitter);
    }

    const fileName = genericAttachmentFileName();
    const envelope = opts?.envelopeByPn?.[recipientPn];
    const body = envelope ? Buffer.from(envelope, 'utf8') : senderBytes!;
    const uploaded = await uploadAttachmentBytes(recipientPn, body, fileName);
    result[recipientPn] = uploaded;
  }

  return result;
}

/**
 * @deprecated Peer ACLs removed — use dualWriteAttachmentToRecipients.
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
