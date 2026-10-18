import {
  canPenRole,
  resolvePenRole,
  type PenAclAction,
  type PenLiveBatch,
  type PenRoleAssignment
} from '@par-noir/pen-protocol';
import { openBytes, verifyBatchSignature } from './crypto.js';

export type PenLiveRejectReason =
  | 'wrong_doc'
  | 'wrong_epoch'
  | 'not_member'
  | 'role_denied'
  | 'no_signing_key'
  | 'bad_signature'
  | 'replay'
  | 'decrypt_failed';

const REPLAY_WINDOW = 1024;

/**
 * Sliding-window replay check per (author, clientId), session-scoped.
 * Chunked batches can complete after later small ones, so order is not required;
 * duplicates and anything older than the window are refused.
 */
export class PenLiveReplayGuard {
  private state = new Map<string, { max: number; seen: Set<number> }>();

  accept(authorPnHash: string, clientId: number, seq: number): boolean {
    if (!Number.isSafeInteger(seq) || seq < 1) return false;
    const key = `${authorPnHash}:${clientId}`;
    let entry = this.state.get(key);
    if (!entry) {
      entry = { max: 0, seen: new Set() };
      this.state.set(key, entry);
    }
    if (seq <= entry.max - REPLAY_WINDOW || entry.seen.has(seq)) return false;
    entry.seen.add(seq);
    if (seq > entry.max) {
      entry.max = seq;
      for (const s of entry.seen) if (s <= entry.max - REPLAY_WINDOW) entry.seen.delete(s);
    }
    return true;
  }
}

export interface PenLiveVerifyContext {
  docId: string;
  keyEpoch: number;
  docKey: string;
  roles: PenRoleAssignment[] | undefined;
  ownerPnHash: string | undefined;
  replay: PenLiveReplayGuard;
}

export type PenLiveOpened =
  | { ok: true; batch: PenLiveBatch; payload: Uint8Array }
  | { ok: false; reason: PenLiveRejectReason };

function requiredAction(type: PenLiveBatch['type']): PenAclAction {
  return type === 'sync1' ? 'read' : 'live_edit';
}

/** Verify doc, epoch, membership, role, signature and replay, then decrypt. */
export async function openPenLiveBatch(
  batch: PenLiveBatch,
  ctx: PenLiveVerifyContext
): Promise<PenLiveOpened> {
  if (batch.docId !== ctx.docId) return { ok: false, reason: 'wrong_doc' };
  if (batch.keyEpoch !== ctx.keyEpoch) return { ok: false, reason: 'wrong_epoch' };
  const role = resolvePenRole(ctx.roles, batch.authorPnHash, ctx.ownerPnHash);
  if (!role) return { ok: false, reason: 'not_member' };
  if (!canPenRole(role, requiredAction(batch.type))) return { ok: false, reason: 'role_denied' };
  const key = (ctx.roles || []).find((r) => r.pnHash === batch.authorPnHash)?.mlDsaPublicKey;
  if (!key) return { ok: false, reason: 'no_signing_key' };
  if (!verifyBatchSignature(batch, key)) return { ok: false, reason: 'bad_signature' };
  if (!ctx.replay.accept(batch.authorPnHash, batch.clientId, batch.seq)) {
    return { ok: false, reason: 'replay' };
  }
  try {
    return { ok: true, batch, payload: await openBytes(batch.ciphertext, ctx.docKey) };
  } catch {
    return { ok: false, reason: 'decrypt_failed' };
  }
}
