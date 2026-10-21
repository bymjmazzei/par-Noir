/**
 * AI drafts inbox: PenAgentBuild proposals the owner's AI agent sealed to them on the
 * mailbox. Opened here with the owner's ML-KEM secret; nothing reaches Drive until Accept,
 * which goes through the same createDocFromAgentBuild spine as any agent build.
 */

import { isSocialEnvelope, openSocialEnvelope } from '@par-noir/dm-crypto';
import {
  PEN_AGENT_DRAFT_KIND,
  draftIdFromContextId,
  previewPenAgentBuild,
  validatePenAgentBuild,
  type PenAgentBuild,
  type PenAgentDraftPreview
} from '@par-noir/pen-protocol';
import { createDocFromAgentBuild } from './createDocFromAgentBuild';
import { resolvePenMailboxRouteKey } from './penCollab';
import type { LocalDocBundle } from './penLocalStore';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import type { PenSession } from './penSession';

const INBOX_LIMIT = 50;

interface DraftRef {
  jobId: string;
  routeKey: string;
  expiresAt: string;
}

/** A draft that could not be opened or is not a valid build can only be discarded. */
export type PenAgentDraft =
  | (DraftRef & { valid: true; draftId: string; build: PenAgentBuild; preview: PenAgentDraftPreview })
  | (DraftRef & { valid: false });

interface PendingJob {
  id: string;
  payload?: Record<string, unknown>;
  expiresAt?: string;
}

async function openDraft(job: PendingJob, routeKey: string, secretKey: string): Promise<PenAgentDraft> {
  const ref: DraftRef = { jobId: job.id, routeKey, expiresAt: job.expiresAt || '' };
  const contextId = job.payload?.envelopeContext;
  const draftId = draftIdFromContextId(contextId);
  const envelope = job.payload?.envelope;
  if (!draftId || !isSocialEnvelope(envelope)) return { ...ref, valid: false };
  let build: unknown;
  try {
    build = await openSocialEnvelope<unknown>(envelope, secretKey, contextId as string);
  } catch {
    return { ...ref, valid: false };
  }
  if (!validatePenAgentBuild(build).ok) return { ...ref, valid: false };
  const valid = build as PenAgentBuild;
  return { ...ref, valid: true, draftId, build: valid, preview: previewPenAgentBuild(valid) };
}

export async function listAgentDrafts(session: PenSession): Promise<PenAgentDraft[]> {
  if (!session.mlKemSecretKey) return [];
  const routeKey = await resolvePenMailboxRouteKey(session);
  if (!routeKey) return [];
  const qs = new URLSearchParams({
    pnIdentifier: session.pnIdentifier,
    routeKey,
    jobType: PEN_AGENT_DRAFT_KIND,
    limit: String(INBOX_LIMIT)
  });
  const res = await ownerGet(`/api/mailbox/pending?${qs}`, { pnIdentifier: session.pnIdentifier }).catch(
    () => null
  );
  if (!res?.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { jobs?: PendingJob[] };
  const drafts: PenAgentDraft[] = [];
  for (const job of data.jobs || []) {
    drafts.push(await openDraft(job, routeKey, session.mlKemSecretKey));
  }
  return drafts;
}

async function ackDraft(session: PenSession, draft: PenAgentDraft): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/mailbox/ack',
    { pnIdentifier: session.pnIdentifier, routeKey: draft.routeKey, jobIds: [draft.jobId] },
    { pnIdentifier: session.pnIdentifier }
  );
  if (!res.ok) throw new Error(`agent_draft_ack_failed:${res.status}`);
}

/** Creates the doc first, then clears the draft, so a failed ack never loses the owner's work. */
export async function acceptAgentDraft(session: PenSession, draft: PenAgentDraft): Promise<LocalDocBundle> {
  if (!draft.valid) throw new Error('pen_agent_build_invalid:draft could not be opened');
  const bundle = await createDocFromAgentBuild({ session, build: draft.build });
  await ackDraft(session, draft);
  return bundle;
}

export async function discardAgentDraft(session: PenSession, draft: PenAgentDraft): Promise<void> {
  await ackDraft(session, draft);
}
