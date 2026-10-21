/**
 * AI agent Pen drafts. The agent seals its PenAgentBuild to the owner's published ML-KEM
 * key before sending; this only enqueues that ciphertext on the owner's mailbox route,
 * where Pen opens it and the owner accepts or discards it. The server never sees a build.
 */

import { createHash } from 'crypto';
import {
  PEN_AGENT_DRAFT_KIND,
  PEN_AGENT_DRAFT_TTL_HOURS,
  PEN_AGENT_DRAFTS_PER_DAY,
  penAgentDraftContextId,
  type PenAgentDraftSubmission
} from '@par-noir/pen-protocol';
import { getDatabasePool } from '../utils/database';
import {
  enqueueSocialMailboxJob,
  getMailboxRouteKeyForOwner,
  lookupMailboxJob
} from './socialMailboxService';

export type SubmitAgentPenDraftResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: 'owner_inbox_unavailable' | 'draft_rate_limited' };

export async function getOwnerMlKemPublicKey(rootPnIdentifier: string): Promise<string | null> {
  const result = await getDatabasePool().query(
    `SELECT ml_kem_public_key FROM user_profiles WHERE pn_identifier = $1`,
    [rootPnIdentifier]
  );
  const key = result.rows[0]?.ml_kem_public_key;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function agentQuotaHash(agentPnIdentifier: string): string {
  return createHash('sha256')
    .update(`parnoir-agent-pen-draft-quota-v1:${agentPnIdentifier}`, 'utf8')
    .digest('hex');
}

/** One atomic increment that refuses past the daily cap, so parallel calls cannot overshoot. */
export async function consumeAgentDraftQuota(agentPnIdentifier: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    `INSERT INTO agent_pen_draft_quota (agent_hash, day, count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (agent_hash, day) DO UPDATE
       SET count = agent_pen_draft_quota.count + 1
       WHERE agent_pen_draft_quota.count < $2
     RETURNING count`,
    [agentQuotaHash(agentPnIdentifier), PEN_AGENT_DRAFTS_PER_DAY]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Idempotent on (agent, draftId): a retry of a pending draft neither re-enqueues nor spends quota. */
export async function submitAgentPenDraft(params: {
  agentPnIdentifier: string;
  rootPnIdentifier: string;
  submission: PenAgentDraftSubmission;
}): Promise<SubmitAgentPenDraftResult> {
  const routeKey = await getMailboxRouteKeyForOwner(params.rootPnIdentifier);
  if (!routeKey) return { ok: false, reason: 'owner_inbox_unavailable' };

  const { draftId, envelope } = params.submission;
  const callerKey = `${params.agentPnIdentifier}:${draftId}`;
  const existing = await lookupMailboxJob({ routeKey, jobType: PEN_AGENT_DRAFT_KIND, callerKey });
  if (existing) return { ok: true, created: false };

  if (!(await consumeAgentDraftQuota(params.agentPnIdentifier))) {
    return { ok: false, reason: 'draft_rate_limited' };
  }
  const job = await enqueueSocialMailboxJob({
    routeKey,
    jobType: PEN_AGENT_DRAFT_KIND,
    callerKey,
    payload: { envelope, envelopeContext: penAgentDraftContextId(draftId) },
    ttlHours: PEN_AGENT_DRAFT_TTL_HOURS
  });
  return { ok: true, created: job.created };
}
