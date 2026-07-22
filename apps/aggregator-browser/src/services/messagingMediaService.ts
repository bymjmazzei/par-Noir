/**
 * Prepare, upload, and send E2E messaging media attachments.
 */

import {
  deriveMessageKey,
  encryptMediaBytes,
  decryptMediaBytes,
  bytesToBase64,
  genericAttachmentFileName
} from '@par-noir/dm-crypto';
import type { MediaPickItem } from '@par-noir/messaging-ui';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';
import { ensureMessageRootKey } from './dmCryptoClient';
import { getGroupChatKey, sendGroupMessage, type GroupRecord } from './groupService';
import { sendMessage } from './messageService';
import { EncryptionManager } from '../utils/encryptionManager';
import { decryptWithToken, type ShareToken } from '../utils/tokenDecryption';

export type DmThreadContext = {
  threadType: 'dm';
  fromPnIdentifier: string;
  toPnIdentifier: string;
  connectionId: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
};

export type GroupThreadContext = {
  threadType: 'group';
  fromPnIdentifier: string;
  groupId: string;
  groupRecord: GroupRecord;
};

export type MessagingThreadContext = DmThreadContext | GroupThreadContext;

interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata?: {
    originalName?: string;
    originalMimeType?: string;
    originalSize?: number;
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

async function getAuthToken(): Promise<string> {
  const token = await PNOAuthService.getValidAccessToken();
  if (!token) {
    throw new Error('Please unlock your pN to send media');
  }
  return token;
}

async function resolveAttachmentKeyB64(ctx: MessagingThreadContext): Promise<string> {
  if (ctx.threadType === 'group') {
    const chatKey = await getGroupChatKey(ctx.fromPnIdentifier, ctx.groupRecord);
    return chatKey;
  }
  const root = await ensureMessageRootKey(ctx.connectionId, {
    kemCiphertext: ctx.kemCiphertext,
    wrappedMessageRootKey: ctx.wrappedMessageRootKey,
  });
  const messageKey = deriveMessageKey(root, ctx.connectionId);
  return bytesToBase64(messageKey);
}

async function resolveSessionIdentity(): Promise<{ did: string; publicKey: string }> {
  const session = PNOAuthService.loadSession();
  if (!session?.did) {
    throw new Error('Unlock your pN to decrypt media');
  }
  let publicKey = session.publicKey;
  if (!publicKey && session.accessToken) {
    const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
    if (userInfo.public_key) {
      publicKey = userInfo.public_key;
    }
  }
  if (!publicKey && session.did.startsWith('did:key:')) {
    publicKey = session.did.substring(8);
  }
  if (!publicKey) {
    throw new Error('Missing identity public key');
  }
  return { did: session.did, publicKey };
}

async function downloadDriveBlob(
  fileId: string,
  accountId?: string,
  ownerPnIdentifier?: string
): Promise<{ blob: Blob; mimeType: string }> {
  const token = await getAuthToken();
  const params = new URLSearchParams({ download: 'true' });
  if (accountId) {
    params.set('accountId', accountId);
  }
  if (ownerPnIdentifier) {
    params.set('ownerPnIdentifier', ownerPnIdentifier);
  }
  const res = await fetch(`${API_ENDPOINT}/api/drive/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error('Failed to download file from Drive');
  }
  const blob = await res.blob();
  return { blob, mimeType: blob.type || 'application/octet-stream' };
}

async function decryptSourceToBytes(
  pick: MediaPickItem,
  blob: Blob,
  mimeType: string
): Promise<{ bytes: Uint8Array; mimeType: string; displayName?: string }> {
  if (pick.deviceFile) {
    const buf = await pick.deviceFile.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mimeType: pick.deviceFile.type || mimeType,
      displayName: pick.deviceFile.name
    };
  }

  const text = await blob.text();
  let asPackage: EncryptedFilePackage | null = null;
  try {
    asPackage = JSON.parse(text) as EncryptedFilePackage;
    if (!asPackage?.encrypted || !asPackage?.iv || !asPackage?.salt) {
      asPackage = null;
    }
  } catch {
    asPackage = null;
  }

  if (pick.publicToken) {
    const token: ShareToken =
      typeof pick.publicToken === 'string' ? JSON.parse(pick.publicToken) : pick.publicToken;
    const decryptedBlob = await decryptWithToken(token);
    const buf = await decryptedBlob.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mimeType: decryptedBlob.type || pick.mimeType || mimeType,
      displayName: pick.displayName
    };
  }

  if (asPackage) {
    const { did, publicKey } = await resolveSessionIdentity();
    const encryptionManager = new EncryptionManager();
    const bytes = await encryptionManager.decrypt(
      asPackage.encrypted,
      asPackage.iv,
      asPackage.salt,
      did,
      publicKey
    );
    return {
      bytes,
      mimeType: asPackage.metadata?.originalMimeType || pick.mimeType || mimeType,
      displayName: pick.displayName || asPackage.metadata?.originalName
    };
  }

  const buf = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    mimeType: pick.mimeType || mimeType,
    displayName: pick.displayName
  };
}

export async function downloadSourceBlob(pick: MediaPickItem): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  displayName?: string;
}> {
  if (pick.deviceFile) {
    const buf = await pick.deviceFile.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mimeType: pick.deviceFile.type || 'application/octet-stream',
      displayName: pick.deviceFile.name
    };
  }

  if (pick.publicToken) {
    try {
      const token: ShareToken =
        typeof pick.publicToken === 'string' ? JSON.parse(pick.publicToken) : pick.publicToken;
      const decryptedBlob = await decryptWithToken(token);
      const buf = await decryptedBlob.arrayBuffer();
      return {
        bytes: new Uint8Array(buf),
        mimeType: decryptedBlob.type || pick.mimeType || 'application/octet-stream',
        displayName: pick.displayName
      };
    } catch {
      /* fall through to Drive download */
    }
  }

  const driveId = pick.driveFileId;
  if (!driveId) {
    throw new Error('No file selected');
  }

  const { blob, mimeType } = await downloadDriveBlob(
    driveId,
    pick.accountId,
    pick.ownerPnIdentifier
  );
  return decryptSourceToBytes(pick, blob, mimeType);
}

export async function prepareMessageAttachment(
  pick: MediaPickItem,
  ctx: MessagingThreadContext,
  accountId?: string
): Promise<{
  mediaFileId: string;
  mimeType: string;
  displayName?: string;
  /** Per-recipient envelopes (UTF-8 ciphertext) for dual-write without bit-identical blobs. */
  mediaEnvelopesByPn: Record<string, string>;
}> {
  const { bytes, mimeType, displayName } = await downloadSourceBlob(pick);
  const keyB64 = await resolveAttachmentKeyB64(ctx);

  // Distinct AES-GCM envelopes (new IV each call) so dual-written blobs are not bit-identical.
  const senderEnvelope = await encryptMediaBytes(bytes, keyB64);

  const mediaEnvelopesByPn: Record<string, string> = {};
  if (ctx.threadType === 'dm') {
    mediaEnvelopesByPn[ctx.toPnIdentifier] = await encryptMediaBytes(bytes, keyB64);
  } else {
    const ownerPn = ctx.groupRecord.ownerPnIdentifier;
    if (ownerPn && ownerPn !== ctx.fromPnIdentifier) {
      mediaEnvelopesByPn[ownerPn] = await encryptMediaBytes(bytes, keyB64);
    }
  }

  const token = await getAuthToken();
  const folderRes = await fetch(
    `${API_ENDPOINT}/api/messages/attachments-folder${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!folderRes.ok) {
    throw new Error('Failed to resolve messaging attachments folder');
  }
  const { folderId } = (await folderRes.json()) as { folderId: string };

  const envelopeBytes = new TextEncoder().encode(senderEnvelope);
  const envelopeBlob = new Blob([envelopeBytes], { type: 'application/octet-stream' });
  const fileData = await blobToBase64(envelopeBlob);
  const fileName = genericAttachmentFileName();

  const uploadRes = await fetch(`${API_ENDPOINT}/api/drive/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileData,
      fileName,
      mimeType: 'application/octet-stream',
      parents: [folderId],
      accountId,
      encrypt: false
    })
  });
  if (!uploadRes.ok) {
    throw new Error('Failed to upload messaging attachment');
  }
  const uploadData = await uploadRes.json();
  const mediaFileId = uploadData.file?.id;
  if (!mediaFileId) {
    throw new Error('Upload succeeded but no file id returned');
  }
  return { mediaFileId, mimeType, displayName, mediaEnvelopesByPn };
}

export async function sendMessageWithMedia(
  ctx: MessagingThreadContext,
  pick: MediaPickItem,
  caption: string,
  accountId?: string
): Promise<void> {
  const { mediaFileId, mimeType, mediaEnvelopesByPn } = await prepareMessageAttachment(
    pick,
    ctx,
    accountId
  );
  const text = caption.trim() || '📎 Media';

  if (ctx.threadType === 'group') {
    await sendGroupMessage(
      ctx.fromPnIdentifier,
      ctx.groupId,
      ctx.groupRecord,
      text,
      mediaFileId,
      mimeType,
      mediaEnvelopesByPn
    );
    return;
  }

  await sendMessage(
    ctx.fromPnIdentifier,
    ctx.toPnIdentifier,
    text,
    mediaFileId,
    ctx.connectionId,
    ctx.kemCiphertext,
    mimeType,
    ctx.wrappedMessageRootKey,
    mediaEnvelopesByPn
  );
}

export async function decryptAttachmentBlob(
  encryptedEnvelope: string,
  ctx: MessagingThreadContext
): Promise<{ bytes: Uint8Array }> {
  const keyB64 = await resolveAttachmentKeyB64(ctx);
  const bytes = await decryptMediaBytes(encryptedEnvelope, keyB64);
  return { bytes };
}

export async function fetchAndDecryptAttachment(
  mediaFileId: string,
  ctx: MessagingThreadContext,
  accountId?: string,
  mimeTypeHint?: string
): Promise<{ blob: Blob; mimeType: string }> {
  const token = await getAuthToken();
  const params = new URLSearchParams({ download: 'true' });
  if (accountId) {
    params.set('accountId', accountId);
  }
  const res = await fetch(`${API_ENDPOINT}/api/drive/files/${mediaFileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error('Failed to download attachment');
  }
  const rawBlob = await res.blob();
  const envelope = await rawBlob.text();
  const { bytes } = await decryptAttachmentBlob(envelope, ctx);
  return {
    blob: new Blob([bytes as BlobPart]),
    mimeType: mimeTypeHint || rawBlob.type || 'application/octet-stream'
  };
}

export function isMediaMimeType(mimeType?: string): boolean {
  if (!mimeType) {
    return true;
  }
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType === 'application/octet-stream'
  );
}

export type { MediaPickItem };
