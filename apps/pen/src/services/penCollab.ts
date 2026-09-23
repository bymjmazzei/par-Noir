/**
 * Pen collab: group-per-doc + browse-style group create + durable outbox fanout.
 */

import {
  createOutboxRecord,
  promoteLocalOutbox,
  upsertLocalOutboxRecord,
  penCommentFanout,
  penSectionPromoteFanout,
  penSuggestionFanout,
  penDraftUpsertFanout,
  penPublishFanout,
  penDocBootstrapFanout,
  createApiSocialApplier,
  ensureMailboxRouteKey,
  type OutboxKind,
  type SealSession
} from '@par-noir/device-cloud-credentials';
import {
  PEN_COMMENT_KIND,
  PEN_SECTION_PROMOTE_KIND,
  PEN_SUGGESTION_KIND,
  PEN_DRAFT_UPSERT_KIND,
  PEN_PUBLISH_KIND,
  PEN_DOC_BOOTSTRAP_KIND,
  type PenDocComment,
  type PenPromoteLink,
  type PenSuggestion,
  type PenRole,
  canPenRole,
  resolvePenRole,
  hashPnIdentifier
} from '@par-noir/pen-protocol';
import {
  generateChatKey,
  wrapChatKeyForOwner,
  sealSocialEnvelope
} from '@par-noir/dm-crypto';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import type { PenSession } from './penSession';

function sealSessionFromPen(session: PenSession): SealSession | null {
  if (!session.mlKemSecretKey) return null;
  // Same convention as aggregator-browser outbox seal (pn + ML-KEM secret).
  return {
    sessionId: session.pnIdentifier,
    pnName: session.pnIdentifier,
    passcode: session.mlKemSecretKey
  };
}

export async function createPenGroup(params: {
  ownerPnIdentifier: string;
  groupId: string;
  title: string;
  members: Array<{
    memberPnIdentifier: string;
    wrappedChatKey: string;
    accessRole: 'readWrite' | 'readOnly';
  }>;
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/groups',
    {
      ownerPnIdentifier: params.ownerPnIdentifier,
      title: params.title,
      groupId: params.groupId,
      members: params.members
    },
    { pnIdentifier: params.ownerPnIdentifier }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'group_create_failed');
  }
}

/** Invite peer via browse-style POST /api/groups + role on doc. */
export async function invitePenCollaborator(params: {
  session: PenSession;
  docId: string;
  groupId: string;
  title: string;
  peerPnIdentifier: string;
  role: PenRole;
  peerMlKemPublicKey: string;
}): Promise<void> {
  if (!params.session.mlKemSecretKey) {
    throw new Error('messaging_keys_required');
  }
  if (params.role === 'owner') {
    throw new Error('cannot_invite_as_owner');
  }

  let docKey = sessionStorage.getItem(`pen_doc_key:${params.docId}`);
  if (!docKey) {
    docKey = generateChatKey();
    sessionStorage.setItem(`pen_doc_key:${params.docId}`, docKey);
  }

  const ownerWrapped = await wrapChatKeyForOwner(
    docKey,
    params.session.mlKemSecretKey,
    params.groupId
  );
  const peerEnv = await sealSocialEnvelope(params.peerMlKemPublicKey, params.groupId, {
    docKey,
    docId: params.docId,
    role: params.role
  });
  const peerWrapped = JSON.stringify(peerEnv);

  const accessRole =
    params.role === 'viewer' || params.role === 'commentor' ? 'readOnly' : 'readWrite';

  await createPenGroup({
    ownerPnIdentifier: params.session.pnIdentifier,
    groupId: params.groupId,
    title: params.title,
    members: [
      {
        memberPnIdentifier: params.session.pnIdentifier,
        wrappedChatKey: ownerWrapped,
        accessRole: 'readWrite'
      },
      {
        memberPnIdentifier: params.peerPnIdentifier,
        wrappedChatKey: peerWrapped,
        accessRole
      }
    ]
  });

  const prev = listPendingInvites(params.docId);
  if (!prev.includes(params.peerPnIdentifier)) {
    prev.push(params.peerPnIdentifier);
    sessionStorage.setItem(`pen_invites:${params.docId}`, JSON.stringify(prev));
  }
  sessionStorage.setItem(
    `pen_share:${params.docId}:${params.peerPnIdentifier}`,
    JSON.stringify({ docId: params.docId, role: params.role, accessRole })
  );
}

export async function fetchGroupRoster(params: {
  groupId: string;
  ownerPnIdentifier: string;
}): Promise<Array<{ memberPnIdentifier: string; routeKey?: string }>> {
  const q = new URLSearchParams({
    ownerPnIdentifier: params.ownerPnIdentifier,
    userPnIdentifier: params.ownerPnIdentifier
  });
  const res = await ownerGet(
    `/api/groups/${encodeURIComponent(params.groupId)}/roster?${q}`,
    { pnIdentifier: params.ownerPnIdentifier }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.members || data.roster || []) as Array<{
    memberPnIdentifier: string;
    routeKey?: string;
  }>;
}

export async function applyPenPromoteInbound(params: {
  userPnIdentifier: string;
  docId: string;
  groupId?: string;
  sectionSlug: string;
  pastName: string;
  currentRelPath: string;
  pastRelPath: string;
  sectionCiphertextB64: string;
  contentHash: string;
  link: PenPromoteLink;
  role?: 'sender' | 'peer';
}): Promise<Response> {
  return ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_SECTION_PROMOTE_KIND,
      role: params.role || 'sender',
      docId: params.docId,
      groupId: params.groupId,
      sectionSlug: params.sectionSlug,
      pastName: params.pastName,
      currentRelPath: params.currentRelPath,
      pastRelPath: params.pastRelPath,
      sectionCiphertextB64: params.sectionCiphertextB64,
      contentHash: params.contentHash,
      link: params.link
    },
    { pnIdentifier: params.userPnIdentifier }
  );
}

export async function applyPenCommentInbound(params: {
  userPnIdentifier: string;
  docId: string;
  groupId?: string;
  comment: PenDocComment;
}): Promise<Response> {
  return ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_COMMENT_KIND,
      docId: params.docId,
      groupId: params.groupId,
      comment: params.comment
    },
    { pnIdentifier: params.userPnIdentifier }
  );
}

export async function applyPenSuggestionInbound(params: {
  userPnIdentifier: string;
  docId: string;
  groupId?: string;
  suggestion: PenSuggestion;
  acceptPromote?: Record<string, unknown>;
}): Promise<Response> {
  return ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_SUGGESTION_KIND,
      docId: params.docId,
      groupId: params.groupId,
      suggestion: params.suggestion,
      acceptPromote: params.acceptPromote
    },
    { pnIdentifier: params.userPnIdentifier }
  );
}

function fanoutFor(kind: OutboxKind, peerRouteKeys: string[]) {
  if (kind === PEN_SECTION_PROMOTE_KIND) return penSectionPromoteFanout(peerRouteKeys);
  if (kind === PEN_COMMENT_KIND) return penCommentFanout(peerRouteKeys);
  if (kind === PEN_SUGGESTION_KIND) return penSuggestionFanout(peerRouteKeys);
  if (kind === PEN_DRAFT_UPSERT_KIND) return penDraftUpsertFanout(peerRouteKeys);
  if (kind === PEN_PUBLISH_KIND) return penPublishFanout(peerRouteKeys);
  if (kind === PEN_DOC_BOOTSTRAP_KIND) return penDocBootstrapFanout(peerRouteKeys);
  return [];
}

export async function queuePenOutbox(params: {
  session: PenSession;
  kind: OutboxKind;
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): Promise<void> {
  const seal = sealSessionFromPen(params.session);
  const record = createOutboxRecord({
    outboxId: params.outboxId,
    kind: params.kind,
    payload: params.payload,
    fanout: fanoutFor(params.kind, params.peerRouteKeys)
  });
  if (seal) {
    await upsertLocalOutboxRecord(params.session.pnIdentifier, seal, record);
    return;
  }
  const key = `pn_sender_outbox_plain_v1:${params.session.pnIdentifier}`;
  const raw = localStorage.getItem(key);
  const bag = raw ? (JSON.parse(raw) as { records: typeof record[] }) : { records: [] };
  bag.records = bag.records.filter((r) => r.outboxId !== params.outboxId);
  bag.records.push(record);
  localStorage.setItem(key, JSON.stringify(bag));
}

export function queuePenSectionPromote(params: {
  session: PenSession;
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  void queuePenOutbox({ ...params, kind: PEN_SECTION_PROMOTE_KIND });
}

export function queuePenComment(params: {
  session: PenSession;
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  void queuePenOutbox({ ...params, kind: PEN_COMMENT_KIND });
}

export function queuePenSuggestion(params: {
  session: PenSession;
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  void queuePenOutbox({ ...params, kind: PEN_SUGGESTION_KIND });
}

export async function promotePenOutboxAndFanout(session: PenSession): Promise<void> {
  const seal = sealSessionFromPen(session);
  if (!seal) return;
  await promoteLocalOutbox({
    apiBaseUrl: API_ENDPOINT,
    authToken: session.accessToken,
    identityId: session.pnIdentifier,
    session: seal
  });
}

/** Drain mailbox and apply pen.* jobs into this user's Drive. */
const mailboxRouteByPn = new Map<string, string>();
const drainInFlight = new Map<string, Promise<number>>();

export async function drainPenMailbox(session: PenSession): Promise<number> {
  const existing = drainInFlight.get(session.pnIdentifier);
  if (existing) return existing;

  const run = (async () => {
    const seal = sealSessionFromPen(session);
    if (!seal) return 0;

    const apply = createApiSocialApplier({
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      identityId: session.pnIdentifier
    });

    let routeKey = mailboxRouteByPn.get(session.pnIdentifier);
    if (!routeKey) {
      try {
        routeKey = await ensureMailboxRouteKey(session.pnIdentifier, seal, {
          apiBaseUrl: API_ENDPOINT,
          authToken: session.accessToken,
          pnIdentifier: session.pnIdentifier
        });
        mailboxRouteByPn.set(session.pnIdentifier, routeKey);
      } catch {
        return 0;
      }
    }

    const pendingQs = new URLSearchParams({
      pnIdentifier: session.pnIdentifier,
      routeKey,
      limit: '20'
    });
    const drain = await ownerGet(`/api/mailbox/pending?${pendingQs}`, {
      pnIdentifier: session.pnIdentifier
    }).catch(() => null);
    if (!drain?.ok) return 0;
    const data = (await drain.json().catch(() => ({}))) as {
      jobs?: Array<{ id: string; jobType: string; payload: Record<string, unknown> }>;
    };
    let applied = 0;
    for (const job of data.jobs || []) {
      if (!String(job.jobType || '').startsWith('pen.')) continue;
      const ok = await apply({
        id: job.id,
        jobType: job.jobType,
        payload: {
          ...job.payload,
          userPnIdentifier: session.pnIdentifier,
          docId: job.payload.docId
        },
        routeKey,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
      if (ok) {
        applied += 1;
        await ownerFetch(
          'POST',
          '/api/mailbox/ack',
          { pnIdentifier: session.pnIdentifier, routeKey, jobIds: [job.id] },
          { pnIdentifier: session.pnIdentifier }
        ).catch(() => null);
      }
    }
    return applied;
  })();

  drainInFlight.set(session.pnIdentifier, run);
  try {
    return await run;
  } finally {
    drainInFlight.delete(session.pnIdentifier);
  }
}

/** Drop session mailbox route cache (call on lock). */
export function clearPenMailboxSessionCache(pnIdentifier?: string): void {
  if (pnIdentifier) {
    mailboxRouteByPn.delete(pnIdentifier);
    drainInFlight.delete(pnIdentifier);
    return;
  }
  mailboxRouteByPn.clear();
  drainInFlight.clear();
}

export function actorCan(
  manifestRoles: { pnHash: string; role: PenRole }[] | undefined,
  ownerPnHash: string | undefined,
  actorPn: string,
  action: Parameters<typeof canPenRole>[1]
): boolean {
  const role = resolvePenRole(manifestRoles, hashPnIdentifier(actorPn), ownerPnHash);
  if (!role) return false;
  return canPenRole(role, action);
}

export function listPendingInvites(docId: string): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(`pen_invites:${docId}`) || '[]') as string[];
  } catch {
    return [];
  }
}

export function addPendingInvite(docId: string, peerPn: string): void {
  const prev = listPendingInvites(docId);
  if (!prev.includes(peerPn)) prev.push(peerPn);
  sessionStorage.setItem(`pen_invites:${docId}`, JSON.stringify(prev));
}
