/**
 * Promote sender outbox → own cloud Sheets (via apply-inbound) + ensure peer fanout.
 * Sheets is the only conversation SoT. Never mark materialized without a successful own-sheet apply.
 */

import type { SealSession } from './types.js';
import {
  loadLocalOutbox,
  upsertLocalOutboxRecord,
  type OutboxKind,
  type OutboxRecord
} from './outbox.js';
import {
  enqueueMailboxThroughway,
  lookupMailboxThroughway
} from './flushWorker.js';

export interface PromoteOutboxOptions {
  apiBaseUrl: string;
  authToken: string;
  identityId: string;
  session: SealSession;
  buildAuthHeaders?: (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<Record<string, string>> | Record<string, string>;
  getCloudAccessToken?: () => Promise<string | undefined> | string | undefined;
  /** Optional durable outbox backup (dashboard). Must not be used as chat SoT. */
  writeOutboxCloudBackup?: (record: OutboxRecord) => Promise<void>;
}

export interface PromoteOutboxResult {
  promoted: number;
  failed: number;
  errors: string[];
}

const SHEET_KINDS = new Set<OutboxKind>(['message_append', 'group_message_append']);

function applyPathFor(kind: OutboxKind): string | null {
  if (kind === 'message_append') return '/api/messages/apply-inbound';
  if (kind === 'group_message_append') return '/api/groups/apply-inbound';
  return null;
}

function stripGraph(payload: Record<string, unknown>): Record<string, unknown> {
  const {
    fromPnIdentifier: _f,
    toPnIdentifier: _t,
    ...rest
  } = payload;
  return rest;
}

async function postOwnSheetApply(
  opts: PromoteOutboxOptions,
  record: OutboxRecord
): Promise<void> {
  const path = applyPathFor(record.kind);
  if (!path) {
    throw new Error(`no apply-inbound path for outbox kind ${record.kind}`);
  }
  const base = opts.apiBaseUrl.replace(/\/$/, '');
  const body: Record<string, unknown> = {
    ...record.payload,
    userPnIdentifier: opts.identityId,
    jobType: record.kind,
    role: 'sender'
  };
  const cloudAccessToken = opts.getCloudAccessToken
    ? await opts.getCloudAccessToken()
    : undefined;
  const extra = opts.buildAuthHeaders
    ? await opts.buildAuthHeaders('POST', path, body)
    : {};
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.authToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(cloudAccessToken ? { 'X-PN-Cloud-Access-Token': cloudAccessToken } : {}),
      ...extra
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `own-sheet apply ${record.kind} HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`
    );
  }
}

async function ensureFanout(opts: PromoteOutboxOptions, record: OutboxRecord): Promise<void> {
  for (const target of record.fanout) {
    const routeKey = target.routeKey;
    if (!routeKey || !/^[a-f0-9]{64}$/i.test(routeKey)) continue;
    const messageId =
      typeof record.payload.messageId === 'string' ? record.payload.messageId : undefined;
    const commentId =
      typeof record.payload.commentId === 'string' ? record.payload.commentId : undefined;
    const fileId =
      typeof record.payload.fileId === 'string' ? record.payload.fileId : undefined;
    const lookup = await lookupMailboxThroughway({
      apiBaseUrl: opts.apiBaseUrl,
      authToken: opts.authToken,
      identityId: opts.identityId,
      routeKey,
      jobType: target.jobType,
      messageId,
      commentId,
      fileId
    }).catch(() => ({ found: false, pending: false }));
    if (lookup.pending) continue;

    const basePayload =
      target.jobType === 'message_append' || target.jobType === 'group_message_append'
        ? { ...record.payload, role: 'recipient', read: false }
        : target.jobType === 'notification_row'
          ? {
              type: record.payload.type || 'new_message',
              messageId: record.payload.messageId,
              threadId: record.payload.threadId,
              connectionId: record.payload.connectionId,
              groupId: record.payload.groupId,
              fileId: record.payload.fileId,
              commentId: record.payload.commentId
            }
          : { ...record.payload };

    await enqueueMailboxThroughway({
      apiBaseUrl: opts.apiBaseUrl,
      authToken: opts.authToken,
      identityId: opts.identityId,
      routeKey,
      jobType: target.jobType,
      payload: stripGraph(basePayload as Record<string, unknown>)
    });
  }
}

/**
 * Materialize every non-materialized local outbox record into the caller's Sheets
 * (message kinds) and rebuild peer throughway jobs. Fail closed — never mark
 * materialized after a JSONL or fanout-only success.
 */
export async function promoteLocalOutbox(
  opts: PromoteOutboxOptions
): Promise<PromoteOutboxResult> {
  const records = await loadLocalOutbox(opts.identityId, opts.session);
  let promoted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const record of records) {
    if (record.status === 'materialized') continue;
    try {
      if (opts.writeOutboxCloudBackup) {
        await opts.writeOutboxCloudBackup(record);
      }

      if (SHEET_KINDS.has(record.kind)) {
        await postOwnSheetApply(opts, record);
      }

      // Fanout is rebuildable throughway — own sheet write is the materialize gate.
      try {
        await ensureFanout(opts, record);
      } catch (fanoutErr) {
        errors.push(
          `${record.outboxId}:fanout ${fanoutErr instanceof Error ? fanoutErr.message : 'failed'}`
        );
      }

      if (SHEET_KINDS.has(record.kind) || record.fanout.length > 0) {
        await upsertLocalOutboxRecord(opts.identityId, opts.session, {
          ...record,
          status: 'materialized',
          updatedAt: new Date().toISOString()
        });
        promoted += 1;
      }
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : 'promote failed';
      errors.push(`${record.outboxId}: ${msg}`);
      await upsertLocalOutboxRecord(opts.identityId, opts.session, {
        ...record,
        status: 'failed',
        updatedAt: new Date().toISOString()
      }).catch(() => undefined);
    }
  }

  return { promoted, failed, errors };
}

/** Promote a single outbox record immediately after send (same rules as full scan). */
export async function promoteOutboxRecord(
  opts: PromoteOutboxOptions,
  record: OutboxRecord
): Promise<void> {
  if (record.status === 'materialized') return;
  if (opts.writeOutboxCloudBackup) {
    await opts.writeOutboxCloudBackup(record);
  }
  if (SHEET_KINDS.has(record.kind)) {
    await postOwnSheetApply(opts, record);
  }
  try {
    await ensureFanout(opts, record);
  } catch {
    /* throughway rebuildable; own sheet already committed */
  }
  await upsertLocalOutboxRecord(opts.identityId, opts.session, {
    ...record,
    status: 'materialized',
    updatedAt: new Date().toISOString()
  });
}
