/**
 * Materialize mailbox/outbox jobs into user-owned cloud using device-held credentials.
 * Never ack without a successful write.
 */

import type {
  AwsS3Account,
  AzureBlobAccount,
  DropboxAccount,
  GoogleDriveAccount,
  OnedriveAccount,
  StorageCredentialsEnvelope
} from '@par-noir/user-owned-storage';
import {
  conversationLogPath,
  outboxRecordPath,
  pnRootFolderName,
  resolveSocialCloudProvider,
  TABLE_PATHS
} from '@par-noir/user-owned-storage';
import type { MailboxJob } from './types.js';
import type { OutboxRecord } from './outbox.js';

export interface DeviceCloudWriter {
  getText(key: string): Promise<string | null>;
  putText(key: string, text: string, contentType?: string): Promise<void>;
}

function rootPrefix(pnIdentifier: string): string {
  return `${pnRootFolderName(pnIdentifier)}/`;
}

function accountAccessToken(
  account: { access_token?: string; accessToken?: string }
): string | null {
  const t = account.access_token || account.accessToken;
  return t && t.length > 0 ? t : null;
}

/** Build a minimal blob writer from sealed credentials (device custody). */
export async function createDeviceCloudWriter(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope
): Promise<DeviceCloudWriter> {
  const provider = resolveSocialCloudProvider(credentials);
  const prefix = rootPrefix(pnIdentifier);

  if (provider === 'dropbox') {
    const account = (credentials.dropboxAccounts ?? [])[0] as DropboxAccount | undefined;
    const token = account ? accountAccessToken(account) : null;
    if (!token) throw new Error('Dropbox access token missing — reconnect under App folder grant');
    return dropboxWriter(token, prefix);
  }

  if (provider === 'onedrive') {
    const account = (credentials.onedriveAccounts ?? [])[0] as OnedriveAccount | undefined;
    const token = account ? accountAccessToken(account) : null;
    if (!token) throw new Error('OneDrive access token missing — reconnect under AppFolder grant');
    return onedriveAppRootWriter(token, prefix);
  }

  if (provider === 'aws_s3') {
    const account = (credentials.awsS3Accounts ?? [])[0] as AwsS3Account | undefined;
    if (!account?.accessKeyId || !account.secretAccessKey || !account.bucket || !account.region) {
      throw new Error('S3 credentials incomplete');
    }
    if (!account.prefix) {
      throw new Error('S3 prefix required (par-noir-{pn}/)');
    }
    return s3Writer(account);
  }

  if (provider === 'azure_blob') {
    const account = (credentials.azureBlobAccounts ?? [])[0] as AzureBlobAccount | undefined;
    if (!account?.accountName || !account.container || !account.sasToken) {
      throw new Error('Azure SAS credentials required (connection strings are not accepted)');
    }
    if (!account.prefix) {
      throw new Error('Azure prefix required (par-noir-{pn}/)');
    }
    return azureWriter(account);
  }

  // google_drive (default / social)
  const g =
    (credentials.googleDriveAccounts ?? [])[0] ||
    (credentials as { googleDrive?: GoogleDriveAccount }).googleDrive;
  const token = g ? accountAccessToken(g as GoogleDriveAccount) : null;
  if (!token) throw new Error('Google Drive access token missing');
  return googleDriveWriter(token, pnIdentifier, credentials);
}

function dropboxWriter(accessToken: string, rootPrefix: string): DeviceCloudWriter {
  // App folder grant: API paths are relative to app sandbox root.
  const full = (key: string) => {
    const k = key.startsWith('/') ? key.slice(1) : key;
    return `/${rootPrefix}${k}`.replace(/\/+/g, '/');
  };
  return {
    async getText(key) {
      const res = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Dropbox-API-Arg': JSON.stringify({ path: full(key) })
        }
      });
      if (res.status === 409 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Dropbox get failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text, contentType = 'application/json') {
      void contentType;
      const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path: full(key), mode: 'overwrite' })
        },
        body: text
      });
      if (!res.ok) throw new Error(`Dropbox put failed: ${res.status}`);
    }
  };
}

function onedriveAppRootWriter(accessToken: string, rootPrefix: string): DeviceCloudWriter {
  const itemPath = (key: string) => {
    const k = key.startsWith('/') ? key.slice(1) : key;
    const full = `${rootPrefix}${k}`.replace(/\/+/g, '/');
    return `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${full}`;
  };
  return {
    async getText(key) {
      const res = await fetch(`${itemPath(key)}:/content`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`OneDrive get failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text, contentType = 'application/json') {
      const res = await fetch(`${itemPath(key)}:/content`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType
        },
        body: text
      });
      if (!res.ok) throw new Error(`OneDrive put failed: ${res.status}`);
    }
  };
}

function s3Writer(account: AwsS3Account): DeviceCloudWriter {
  const prefix = account.prefix!.endsWith('/') ? account.prefix! : `${account.prefix!}/`;
  // Minimal PUT/GET via AWS Signature V4 would be heavy; use fetch to S3 REST with
  // query-string-less path and rely on browser CORS being configured for the bucket.
  // For dashboard (often Electron/native or same tooling), use AWS SDK-free signed URL alternative:
  // store via temporary signed approach — here we use fetch with AWS4 from subtle crypto is complex.
  // Practical path: use fetch to a path-style URL with Authorization from a tiny signer.
  return createAwsS3RestWriter(account, prefix);
}

function azureWriter(account: AzureBlobAccount): DeviceCloudWriter {
  const prefix = account.prefix!.endsWith('/') ? account.prefix! : `${account.prefix!}/`;
  const sas = account.sasToken!.replace(/^\?/, '');
  const base = `https://${account.accountName}.blob.core.windows.net/${account.container}`;
  return {
    async getText(key) {
      const res = await fetch(`${base}/${prefix}${key}?${sas}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Azure get failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text, contentType = 'application/json') {
      const res = await fetch(`${base}/${prefix}${key}?${sas}`, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'Content-Type': contentType
        },
        body: text
      });
      if (!res.ok) throw new Error(`Azure put failed: ${res.status}`);
    }
  };
}

/** Google Drive: store as app-created files under drive.file (JSONL / JSON). */
function googleDriveWriter(
  accessToken: string,
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope
): DeviceCloudWriter {
  const folderId =
    credentials.driveFolderId ||
    credentials.cachedLayout?.nodeIds?.pnFolderId ||
    null;

  async function ensureMessagesFolder(): Promise<string> {
    if (!folderId) {
      throw new Error('Google Drive folder id missing in layout — reconnect Drive');
    }
    const q = encodeURIComponent(
      `name='par-noir-messages' and '${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    );
    const list = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!list.ok) throw new Error(`Drive list failed: ${list.status}`);
    const body = (await list.json()) as { files?: Array<{ id: string }> };
    if (body.files?.[0]?.id) return body.files[0].id;
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'par-noir-messages',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId]
      })
    });
    if (!create.ok) throw new Error(`Drive mkdir failed: ${create.status}`);
    const created = (await create.json()) as { id: string };
    return created.id;
  }

  async function findOrCreateFile(parentId: string, name: string): Promise<string> {
    const q = encodeURIComponent(
      `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
    );
    const list = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!list.ok) throw new Error(`Drive find failed: ${list.status}`);
    const body = (await list.json()) as { files?: Array<{ id: string }> };
    if (body.files?.[0]?.id) return body.files[0].id;
    const meta = new Blob(
      [
        JSON.stringify({
          name,
          parents: [parentId]
        })
      ],
      { type: 'application/json' }
    );
    const form = new FormData();
    form.append('metadata', meta);
    form.append('file', new Blob([''], { type: 'text/plain' }));
    const create = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      }
    );
    if (!create.ok) throw new Error(`Drive create file failed: ${create.status}`);
    const created = (await create.json()) as { id: string };
    return created.id;
  }

  void pnIdentifier;

  return {
    async getText(key) {
      const messagesId = await ensureMessagesFolder();
      // keys are like par-noir-messages/foo — strip dir, use basename under messages folder / _outbox
      const parts = key.replace(/^par-noir-messages\//, '').split('/');
      let parent = messagesId;
      if (parts.length > 1) {
        // ensure subfolder (e.g. _outbox)
        const sub = parts[0];
        const q = encodeURIComponent(
          `name='${sub}' and '${messagesId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        );
        const list = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!list.ok) throw new Error(`Drive subfolder list failed: ${list.status}`);
        const body = (await list.json()) as { files?: Array<{ id: string }> };
        if (body.files?.[0]?.id) {
          parent = body.files[0].id;
        } else {
          const create = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: sub,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [messagesId]
            })
          });
          if (!create.ok) throw new Error(`Drive subfolder create failed: ${create.status}`);
          parent = ((await create.json()) as { id: string }).id;
        }
      }
      const name = parts[parts.length - 1];
      const q = encodeURIComponent(
        `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`
      );
      const list = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!list.ok) throw new Error(`Drive get list failed: ${list.status}`);
      const body = (await list.json()) as { files?: Array<{ id: string }> };
      const id = body.files?.[0]?.id;
      if (!id) return null;
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text, contentType = 'application/json') {
      void contentType;
      const messagesId = await ensureMessagesFolder();
      const parts = key.replace(/^par-noir-messages\//, '').split('/');
      let parent = messagesId;
      if (parts.length > 1) {
        const sub = parts[0];
        const q = encodeURIComponent(
          `name='${sub}' and '${messagesId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
        );
        const list = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!list.ok) throw new Error(`Drive put list failed: ${list.status}`);
        const body = (await list.json()) as { files?: Array<{ id: string }> };
        if (body.files?.[0]?.id) {
          parent = body.files[0].id;
        } else {
          const create = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: sub,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [messagesId]
            })
          });
          if (!create.ok) throw new Error(`Drive put mkdir failed: ${create.status}`);
          parent = ((await create.json()) as { id: string }).id;
        }
      }
      const name = parts[parts.length - 1];
      const fileId = await findOrCreateFile(parent, name);
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/plain'
          },
          body: text
        }
      );
      if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
    }
  };
}

/**
 * Minimal S3 REST writer using AWS Signature Version 4 (browser-safe WebCrypto).
 */
function createAwsS3RestWriter(account: AwsS3Account, prefix: string): DeviceCloudWriter {
  const encoder = new TextEncoder();

  async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key instanceof ArrayBuffer ? key : key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
  }

  async function sha256Hex(data: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function sign(
    method: string,
    objectKey: string,
    body: string,
    contentType: string
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const service = 's3';
    const region = account.region;
    const host = `${account.bucket}.s3.${region}.amazonaws.com`;
    const path = `/${prefix}${objectKey}`.replace(/\/+/g, '/');
    const now = new Date();
    const amzDate =
      now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = await sha256Hex(body);
    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      path,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      await sha256Hex(canonicalRequest)
    ].join('\n');
    const kDate = await hmac(encoder.encode(`AWS4${account.secretAccessKey}`), dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, 'aws4_request');
    const signature = [...new Uint8Array(await hmac(kSigning, stringToSign))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return {
      url: `https://${host}${path}`,
      headers: {
        Authorization: `AWS4-HMAC-SHA256 Credential=${account.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'Content-Type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate
      }
    };
  }

  return {
    async getText(key) {
      const signed = await sign('GET', key, '', 'application/octet-stream');
      const res = await fetch(signed.url, { headers: signed.headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`S3 get failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text, contentType = 'application/json') {
      const signed = await sign('PUT', key, text, contentType);
      const res = await fetch(signed.url, {
        method: 'PUT',
        headers: signed.headers,
        body: text
      });
      if (!res.ok) throw new Error(`S3 put failed: ${res.status}`);
    }
  };
}

export async function writeOutboxToCloud(
  writer: DeviceCloudWriter,
  record: OutboxRecord
): Promise<void> {
  const key = outboxRecordPath(record.outboxId).replace(/^par-noir-messages\//, '');
  // outboxRecordPath is par-noir-messages/_outbox/id.json — writers expect keys under messages tree
  await writer.putText(
    `par-noir-messages/_outbox/${record.outboxId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`,
    JSON.stringify(record),
    'application/json'
  );
  void key;
}

export async function appendConversationLine(
  writer: DeviceCloudWriter,
  ownerPn: string,
  otherPn: string,
  message: Record<string, unknown>
): Promise<void> {
  void ownerPn;
  const key = conversationLogPath(otherPn);
  const existing = (await writer.getText(key)) || '';
  const messageId = String(message.messageId || '');
  if (messageId && existing.includes(`"messageId":"${messageId}"`)) {
    return; // idempotent
  }
  const line = JSON.stringify(message);
  const next = existing.trim() ? `${existing.trim()}\n${line}\n` : `${line}\n`;
  await writer.putText(key, next, 'application/x-ndjson');
}

export async function appendNotificationLine(
  writer: DeviceCloudWriter,
  row: Record<string, unknown>
): Promise<void> {
  const key = `${TABLE_PATHS.notifications}.jsonl`;
  const existing = (await writer.getText(key)) || '';
  const id = String(row.messageId || row.commentId || row.fileId || row.type || '');
  if (id && existing.includes(id) && existing.includes(String(row.type || ''))) {
    return;
  }
  const line = JSON.stringify({ ...row, storedAt: new Date().toISOString() });
  const next = existing.trim() ? `${existing.trim()}\n${line}\n` : `${line}\n`;
  await writer.putText(key, next, 'application/x-ndjson');
}

async function resolvePeerPn(
  writer: DeviceCloudWriter,
  identityId: string,
  p: Record<string, unknown>
): Promise<string | null> {
  const from = typeof p.fromPnIdentifier === 'string' ? p.fromPnIdentifier : '';
  const to = typeof p.toPnIdentifier === 'string' ? p.toPnIdentifier : '';
  const role = String(p.role || 'recipient');
  if (from || to) {
    const other = role === 'sender' ? to : from === identityId ? to : from;
    return other || (from === identityId ? to : from) || null;
  }
  const connectionId = typeof p.connectionId === 'string' ? p.connectionId.trim() : '';
  if (!connectionId) return null;

  const candidates = [
    `${TABLE_PATHS.connections}.json`,
    `${TABLE_PATHS.connections}.jsonl`,
    TABLE_PATHS.connections
  ];
  for (const key of candidates) {
    const raw = await writer.getText(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as
        | { connections?: Array<{ connectionId?: string; userPnIdentifier?: string }> }
        | Array<{ connectionId?: string; userPnIdentifier?: string }>;
      const rows = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.connections)
          ? parsed.connections
          : [];
      const hit = rows.find((c) => c.connectionId === connectionId);
      if (hit?.userPnIdentifier) return hit.userPnIdentifier;
    } catch {
      for (const line of raw.split('\n')) {
        if (!line.trim() || !line.includes(connectionId)) continue;
        try {
          const row = JSON.parse(line) as {
            connectionId?: string;
            userPnIdentifier?: string;
          };
          if (row.connectionId === connectionId && row.userPnIdentifier) {
            return row.userPnIdentifier;
          }
        } catch {
          /* next line */
        }
      }
    }
  }
  return null;
}

/**
 * Apply a throughway mailbox job into the unlocked user's cloud.
 * Returns true only when materialization succeeded (safe to ack).
 * Peer identity is resolved locally (payload from/to or connectionId → connections silo).
 */
export async function materializeMailboxJob(
  identityId: string,
  job: MailboxJob,
  credentials: StorageCredentialsEnvelope
): Promise<boolean> {
  const writer = await createDeviceCloudWriter(identityId, credentials);
  const p = job.payload || {};

  if (job.jobType === 'message_append') {
    const peer = await resolvePeerPn(writer, identityId, p);
    if (!peer) {
      throw new Error('cannot resolve conversation peer (connectionId or from/to required)');
    }
    const role = String(p.role || 'recipient');
    await appendConversationLine(writer, identityId, peer, {
      ...p,
      fromPnIdentifier: p.fromPnIdentifier || (role === 'sender' ? identityId : peer),
      toPnIdentifier: p.toPnIdentifier || (role === 'sender' ? peer : identityId),
      content: '',
      read: role === 'sender' ? true : !!p.read
    });
    return true;
  }

  if (job.jobType === 'message_attachment') {
    const note = {
      type: 'message_attachment',
      ...p
    };
    await appendNotificationLine(writer, note);
    return true;
  }

  if (job.jobType === 'notification_row') {
    await appendNotificationLine(writer, p);
    return true;
  }

  // Engagement is public-aggregator only (no mailbox jobs). Ignore legacy rows if any remain.
  if (job.jobType === 'engagement_like' || job.jobType === 'engagement_comment') {
    return true;
  }

  throw new Error(`Unknown mailbox job type: ${job.jobType}`);
}
