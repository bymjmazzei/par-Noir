/**
 * Sender-owned outbox — durable commit (SoT). Railway mailbox is a rebuildable throughway.
 */

import type { SealedEnvelope, SealSession } from './types.js';
import { sealCredentials, unsealCredentials } from './seal.js';

export type OutboxKind =
  | 'message_append'
  | 'message_attachment'
  | 'notification_row';

export type OutboxStatus = 'pending' | 'enqueued' | 'materialized' | 'failed';

export interface OutboxFanoutTarget {
  /** Opaque mailbox route for recipient inbox (preferred). */
  routeKey: string;
  /** @deprecated Prefer routeKey; kept for legacy reconcile only. */
  recipientIdentityId?: string;
  jobType: OutboxKind;
}

export interface OutboxRecord {
  outboxId: string;
  kind: OutboxKind;
  status: OutboxStatus;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  fanout: OutboxFanoutTarget[];
}

const LOCAL_KEY_PREFIX = 'pn_sender_outbox_v1:';

function storageKey(identityId: string): string {
  return `${LOCAL_KEY_PREFIX}${identityId}`;
}

export function createOutboxRecord(input: {
  outboxId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  fanout: OutboxFanoutTarget[];
  status?: OutboxStatus;
}): OutboxRecord {
  const now = new Date().toISOString();
  return {
    outboxId: input.outboxId,
    kind: input.kind,
    status: input.status ?? 'pending',
    createdAt: now,
    updatedAt: now,
    payload: input.payload,
    fanout: input.fanout
  };
}

export function messageSendFanout(
  routeKey: string,
  hasMedia: boolean,
  recipientIdentityId?: string
): OutboxFanoutTarget[] {
  const base = {
    routeKey,
    ...(recipientIdentityId ? { recipientIdentityId } : {})
  };
  const targets: OutboxFanoutTarget[] = [
    { ...base, jobType: 'message_append' },
    { ...base, jobType: 'notification_row' }
  ];
  if (hasMedia) {
    targets.push({ ...base, jobType: 'message_attachment' });
  }
  return targets;
}

/** Sealed bag of outbox records stored on device (browser / web dashboard). */
export interface LocalOutboxBag {
  records: OutboxRecord[];
}

export async function loadLocalOutbox(
  identityId: string,
  session: SealSession
): Promise<OutboxRecord[]> {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(storageKey(identityId));
  if (!raw) return [];
  try {
    const envelope = JSON.parse(raw) as SealedEnvelope;
    const bag = await unsealCredentials<LocalOutboxBag>(envelope, session);
    return Array.isArray(bag?.records) ? bag.records : [];
  } catch {
    return [];
  }
}

export async function saveLocalOutbox(
  identityId: string,
  session: SealSession,
  records: OutboxRecord[]
): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const envelope = await sealCredentials({ records } satisfies LocalOutboxBag, session, null);
  localStorage.setItem(storageKey(identityId), JSON.stringify(envelope));
}

export async function upsertLocalOutboxRecord(
  identityId: string,
  session: SealSession,
  record: OutboxRecord
): Promise<OutboxRecord[]> {
  const existing = await loadLocalOutbox(identityId, session);
  const idx = existing.findIndex((r) => r.outboxId === record.outboxId);
  const next = [...existing];
  if (idx >= 0) next[idx] = { ...record, updatedAt: new Date().toISOString() };
  else next.push(record);
  await saveLocalOutbox(identityId, session, next);
  return next;
}

export async function clearLocalOutbox(identityId: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(storageKey(identityId));
}

/** Bridge key for browser → dashboard promote (same-origin / stash handoff). */
export const OUTBOX_BRIDGE_STORAGE_KEY = 'pn_sender_outbox_bridge_v1';

export function stashOutboxBridge(identityId: string, sealedEnvelope: SealedEnvelope): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    OUTBOX_BRIDGE_STORAGE_KEY,
    JSON.stringify({ identityId, envelope: sealedEnvelope, updatedAt: Date.now() })
  );
}

export function takeOutboxBridge(
  identityId: string
): SealedEnvelope | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(OUTBOX_BRIDGE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      identityId?: string;
      envelope?: SealedEnvelope;
    };
    if (parsed.identityId !== identityId || !parsed.envelope) return null;
    localStorage.removeItem(OUTBOX_BRIDGE_STORAGE_KEY);
    return parsed.envelope;
  } catch {
    return null;
  }
}
