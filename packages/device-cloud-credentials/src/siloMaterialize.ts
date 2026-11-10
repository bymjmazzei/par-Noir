/**
 * Materialize mailbox/outbox jobs into user-owned cloud using device-held credentials.
 * Never ack without a successful write.
 */

import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { MESSAGES_DIR, outboxRecordPath, resolveSocialCloudProvider, TABLE_PATHS } from '@par-noir/user-owned-storage';
import { createDeviceBlobStore } from './deviceBlobStore.js';
import { deviceDriveCall } from './deviceDriveCall.js';
import { ensureDriveChildFolder, findDriveChild, upsertDriveChildFile } from './driveChild.js';
import { freshAccessTokenFromEnvelope } from './driveTokenResolver.js';
import type { MailboxJob } from './types.js';
import type { OutboxRecord } from './outbox.js';

export interface DeviceCloudWriter {
  getText(key: string): Promise<string | null>;
  putText(key: string, text: string, contentType?: string): Promise<void>;
}

/** Build a minimal text writer from sealed credentials (device custody). */
export async function createDeviceCloudWriter(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope
): Promise<DeviceCloudWriter> {
  const provider = resolveSocialCloudProvider(credentials);

  if (provider !== 'google_drive') {
    const store = createDeviceBlobStore(pnIdentifier, credentials, { provider, layoutRoot: '' });
    return {
      async getText(key) {
        const bytes = await store.get(key);
        return bytes ? new TextDecoder().decode(bytes) : null;
      },
      async putText(key, text, contentType = 'application/json') {
        await store.put(key, text, { contentType });
      },
    };
  }

  // Freshness comes from the shared resolver: writing with an expired token
  // fails at Google, and a raw read cannot tell a live token from a dead one.
  const token = freshAccessTokenFromEnvelope(credentials);
  if (!token) throw new Error('Google Drive access token missing or expired');
  return googleDriveWriter(token, credentials);
}

/** Google Drive: store as app-created files under drive.file (JSONL / JSON). */
function googleDriveWriter(accessToken: string, credentials: StorageCredentialsEnvelope): DeviceCloudWriter {
  const folderId =
    credentials.driveFolderId ||
    credentials.cachedLayout?.nodeIds?.pnFolderId ||
    null;

  /** `par-noir-messages/<sub>/<name>` key → parent folder id and file name. */
  async function resolveKey(key: string): Promise<{ parent: string; name: string }> {
    if (!folderId) {
      throw new Error('Google Drive folder id missing in layout — reconnect Drive');
    }
    const messagesId = await ensureDriveChildFolder(accessToken, folderId, MESSAGES_DIR);
    const parts = key.replace(/^par-noir-messages\//, '').split('/');
    const parent =
      parts.length > 1 ? await ensureDriveChildFolder(accessToken, messagesId, parts[0]!) : messagesId;
    return { parent, name: parts[parts.length - 1]! };
  }

  return {
    async getText(key) {
      const { parent, name } = await resolveKey(key);
      const id = await findDriveChild(accessToken, parent, name, { strict: true });
      if (!id) return null;
      const res = await deviceDriveCall(
        'GET',
        `/api/drive/files/${encodeURIComponent(id)}?download=true`,
        undefined,
        { accessToken }
      );
      if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
      return res.text();
    },
    async putText(key, text) {
      const { parent, name } = await resolveKey(key);
      await upsertDriveChildFile(accessToken, parent, name, text, 'text/plain');
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

export const SOCIAL_JOB_TYPES_APPLIED_VIA_API: ReadonlySet<string> = new Set([
  'connection_request',
  'connection_accept',
  'connection_reject',
  'connection_delete',
  'follower_add',
  'follower_remove',
  'group_message_append',
  'group_inbox_update',
  'message_request',
  /** DM chat SoT is Sheets via apply-inbound — never JSONL. */
  'message_append',
  'pen.section_promote',
  'pen.comment',
  'pen.suggestion',
  'pen.draft_upsert',
  'pen.publish',
  'pen.doc_bootstrap',
  'pen.doc_delete',
  'pen.doc_meta',
  'pen.font_upsert',
  'pen.poll_vote',
  'pen.widget_action'
]);

/**
 * Non-Sheets mailbox leftovers (notifications). Chat and social graph jobs
 * must go through createApiSocialApplier → apply-inbound (Sheets).
 */
export async function materializeMailboxJob(
  identityId: string,
  job: MailboxJob,
  credentials: StorageCredentialsEnvelope
): Promise<boolean> {
  void identityId;
  const writer = await createDeviceCloudWriter(identityId, credentials);
  const p = job.payload || {};

  if (job.jobType === 'message_attachment') {
    await appendNotificationLine(writer, {
      type: 'message_attachment',
      ...p
    });
    return true;
  }

  if (job.jobType === 'notification_row') {
    await appendNotificationLine(writer, p);
    return true;
  }

  if (job.jobType === 'engagement_like' || job.jobType === 'engagement_comment') {
    return true;
  }

  // Chat + social graph: API apply-inbound only (Sheets). Returning false keeps
  // the job pending until a client uses createApiSocialApplier.
  if (SOCIAL_JOB_TYPES_APPLIED_VIA_API.has(job.jobType)) {
    return false;
  }

  throw new Error(`Unknown mailbox job type: ${job.jobType}`);
}
