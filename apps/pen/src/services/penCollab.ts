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
  penFontUpsertFanout,
  penPollVoteFanout,
  penWidgetActionFanout,
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
  PEN_FONT_UPSERT_KIND,
  PEN_POLL_VOTE_KIND,
  PEN_WIDGET_ACTION_KIND,
  type PenDocComment,
  type PenPromoteLink,
  type PenSuggestion,
  type PenRole,
  type PenRoleAssignment,
  canPenRole,
  resolvePenRole,
  hashPnIdentifier
} from '@par-noir/pen-protocol';
import {
  generateChatKey,
  wrapChatKeyForOwner,
  openSocialEnvelope,
  sealSocialEnvelope
} from '@par-noir/dm-crypto';
import {
  deriveKeyClaimSecret,
  isPenLiveSealedSnapshot,
  verifyRekey,
  type PenLiveRekey,
  type PenLiveRolesUpdate,
  type PenLiveTrustAnchor
} from '@par-noir/pen-live';
import { loadDocKey, saveDocKey } from './penDocCrypto';
import {
  PEN_LIVE_REKEY_EVENT,
  PEN_LIVE_SNAPSHOT_EVENT,
  mergeLiveSnapshotIntoLocal,
  saveLiveClaimSecret,
  saveLiveRolesUpdate
} from './penLiveStore';
import { loadLocalDoc, saveLocalDoc } from './penLocalStore';
import { API_ENDPOINT } from '../config/api';
import { appendDeviceGroupRow, listDeviceGroups } from '@par-noir/device-cloud-credentials';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import { penSessionDrive } from './penDriveLibrary';
import type { PenSession } from './penSession';

export function sealSessionFromPen(session: PenSession): SealSession | null {
  if (!session.mlKemSecretKey) return null;
  // Same convention as aggregator-browser outbox seal (pn + ML-KEM secret).
  return {
    sessionId: session.pnIdentifier,
    key1: session.pnIdentifier,
    key2: session.mlKemSecretKey
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
  const drive = await penSessionDrive(params.ownerPnIdentifier);
  const sheetId = drive.index.sheetIds.groups;
  if (!sheetId) throw new Error('cloud_on_device');
  const createdAt = new Date().toISOString();
  for (const member of params.members) {
    await appendDeviceGroupRow(drive.accessToken, sheetId, {
      groupId: params.groupId,
      ownerPnIdentifier: params.ownerPnIdentifier,
      title: params.title,
      createdAt,
      memberPnIdentifier: member.memberPnIdentifier,
      accessRole: member.accessRole,
      wrappedChatKey: member.wrappedChatKey,
    });
  }
  const res = await ownerFetch(
    'POST',
    '/api/groups',
    {
      ownerPnIdentifier: params.ownerPnIdentifier,
      title: params.title,
      groupId: params.groupId,
      members: params.members,
      deviceCloudResult: { spreadsheetId: sheetId },
    },
    { pnIdentifier: params.ownerPnIdentifier }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'group_create_failed');
  }
}

/**
 * Solo-doc custody: register the doc group with an owner-wrapped docKey so
 * hydrate can recover the key after sessionStorage wipe (lock / new tab).
 */
export async function ensureOwnerDocGroup(params: {
  ownerPnIdentifier: string;
  groupId: string;
  title: string;
  docKey: string;
  mlKemSecretKey: string;
}): Promise<void> {
  const ownerWrapped = await wrapChatKeyForOwner(
    params.docKey,
    params.mlKemSecretKey,
    params.groupId
  );
  await createPenGroup({
    ownerPnIdentifier: params.ownerPnIdentifier,
    groupId: params.groupId,
    title: params.title,
    members: [
      {
        memberPnIdentifier: params.ownerPnIdentifier,
        wrappedChatKey: ownerWrapped,
        accessRole: 'readWrite'
      }
    ]
  });
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
    role: params.role,
    liveClaimSecret: deriveKeyClaimSecret(
      params.session.mlKemSecretKey,
      params.docId,
      hashPnIdentifier(params.peerPnIdentifier)
    )
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

/** Peer ML-KEM public key from their profile (cached for the session). */
export async function resolvePeerKemPublicKey(session: PenSession, pn: string): Promise<string> {
  let peerPk = sessionStorage.getItem(`pen_peer_kem:${pn}`) || '';
  if (!peerPk) {
    const lookup = await ownerGet(`/api/profile/${encodeURIComponent(pn)}`, {
      pnIdentifier: session.pnIdentifier
    });
    if (!lookup.ok) {
      throw new Error(
        lookup.status === 404 ? 'peer_profile_not_found' : `peer_profile_lookup_failed_${lookup.status}`
      );
    }
    const data = (await lookup.json().catch(() => ({}))) as { mlKemPublicKey?: string | null };
    peerPk = (data.mlKemPublicKey || '').trim();
  }
  if (!peerPk) {
    throw new Error(
      'peer_messaging_key_unpublished — ask them to unlock browse or messaging once so their ML-KEM public key is on their profile'
    );
  }
  sessionStorage.setItem(`pen_peer_kem:${pn}`, peerPk);
  return peerPk;
}

/**
 * Owner removes members: mint a new docKey for `keyEpoch`, seal it to each
 * remaining member, and append group rows so cold opens find the new key.
 * Removed members get nothing. Returns the new key and per-member envelopes
 * (pnHash → sealed JSON) for the signed live/mailbox rekey notice.
 */
export async function rekeyPenDoc(params: {
  session: PenSession;
  docId: string;
  groupId: string;
  title: string;
  keyEpoch: number;
  roles: PenRoleAssignment[];
  /** pnHash → pn for members the owner knows by name (roster + pending invites). */
  knownPns: Record<string, string>;
}): Promise<{ docKey: string; keys: Record<string, string>; unreachable: string[] }> {
  const secret = params.session.mlKemSecretKey;
  if (!secret) throw new Error('messaging_keys_required');
  const ownerHash = hashPnIdentifier(params.session.pnIdentifier);
  const docKey = generateChatKey();
  const keys: Record<string, string> = {};
  const unreachable: string[] = [];
  const members: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: 'readWrite' | 'readOnly' }> = [
    {
      memberPnIdentifier: params.session.pnIdentifier,
      wrappedChatKey: await wrapChatKeyForOwner(docKey, secret, params.groupId),
      accessRole: 'readWrite'
    }
  ];
  for (const r of params.roles) {
    if (r.pnHash === ownerHash) continue;
    const pn = params.knownPns[r.pnHash];
    let peerPk = '';
    try {
      peerPk = pn ? await resolvePeerKemPublicKey(params.session, pn) : '';
    } catch {
      peerPk = '';
    }
    if (!pn || !peerPk) {
      unreachable.push(r.pnHash);
      continue;
    }
    const sealed = JSON.stringify(
      await sealSocialEnvelope(peerPk, params.groupId, {
        docKey,
        docId: params.docId,
        role: r.role,
        keyEpoch: params.keyEpoch,
        liveClaimSecret: deriveKeyClaimSecret(secret, params.docId, r.pnHash)
      })
    );
    keys[r.pnHash] = sealed;
    members.push({
      memberPnIdentifier: pn,
      wrappedChatKey: sealed,
      accessRole: r.role === 'viewer' || r.role === 'commentor' ? 'readOnly' : 'readWrite'
    });
  }
  await createPenGroup({
    ownerPnIdentifier: params.session.pnIdentifier,
    groupId: params.groupId,
    title: params.title,
    members
  });
  return { docKey, keys, unreachable };
}

/** pnHash → pn for every member named in the owner's group rows or pending invites. */
export async function knownMemberPns(params: {
  session: PenSession;
  docId: string;
  groupId: string;
}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const roster = await fetchGroupRoster({ groupId: params.groupId, ownerPnIdentifier: params.session.pnIdentifier });
  for (const pn of [...roster.map((r) => r.memberPnIdentifier), ...listPendingInvites(params.docId)]) {
    if (pn) out[hashPnIdentifier(pn)] = pn;
  }
  return out;
}

/**
 * Member side of an owner re-key: verify the owner's signature, open this
 * member's envelope, and store the new docKey and claim secret.
 * Null when the notice is forged, stale, or carries no key for this member.
 */
export async function applyPenLiveRekey(params: {
  session: PenSession;
  groupId: string;
  rekey: PenLiveRekey;
  anchor: PenLiveTrustAnchor;
  currentEpoch: number;
}): Promise<{ docKey: string; keyEpoch: number; roles: PenRoleAssignment[] } | null> {
  const { session, rekey, anchor } = params;
  if (!session.mlKemSecretKey || !verifyRekey(rekey, anchor)) return null;
  if (rekey.keyEpoch <= params.currentEpoch) return null;
  const mine = rekey.keys[hashPnIdentifier(session.pnIdentifier)];
  if (!mine) return null;
  let opened: { docKey?: string; liveClaimSecret?: string };
  try {
    opened = await openSocialEnvelope(JSON.parse(mine), session.mlKemSecretKey, params.groupId);
  } catch {
    return null;
  }
  if (!opened.docKey) return null;
  saveDocKey(rekey.docId, opened.docKey);
  if (opened.liveClaimSecret) saveLiveClaimSecret(rekey.docId, opened.liveClaimSecret);
  return { docKey: opened.docKey, keyEpoch: rekey.keyEpoch, roles: rekey.roles };
}

export async function fetchGroupRoster(params: {
  groupId: string;
  ownerPnIdentifier: string;
}): Promise<Array<{ memberPnIdentifier: string; routeKey?: string }>> {
  try {
    const drive = await penSessionDrive(params.ownerPnIdentifier);
    const sheetId = drive.index.sheetIds.groups;
    if (!sheetId) return [];
    const rows = await listDeviceGroups(drive.accessToken, sheetId);
    return rows
      .filter((row) => row.groupId === params.groupId)
      .map((row) => ({ memberPnIdentifier: row.memberPnIdentifier }));
  } catch {
    return [];
  }
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
  if (kind === PEN_FONT_UPSERT_KIND) return penFontUpsertFanout(peerRouteKeys);
  if (kind === PEN_POLL_VOTE_KIND) return penPollVoteFanout(peerRouteKeys);
  if (kind === PEN_WIDGET_ACTION_KIND) return penWidgetActionFanout(peerRouteKeys);
  return [];
}

export async function queuePenOutbox(params: {
  session: PenSession;
  kind: OutboxKind;
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
  /** Owner already wrote Drive (e.g. pen.publish); promote only fanouts peers. */
  ownCloudApplied?: boolean;
}): Promise<void> {
  const seal = sealSessionFromPen(params.session);
  const record = createOutboxRecord({
    outboxId: params.outboxId,
    kind: params.kind,
    payload: params.payload,
    fanout: fanoutFor(params.kind, params.peerRouteKeys),
    ownCloudApplied: params.ownCloudApplied
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
  ownCloudApplied?: boolean;
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

async function applyPenDocInviteClaimFromMailbox(
  session: PenSession,
  job: { id: string; payload: Record<string, unknown> }
): Promise<boolean> {
  if (!session.mlKemSecretKey) return false;
  const envelope = job.payload?.envelope as
    | { kemCiphertext: string; ciphertext: string }
    | undefined;
  if (!envelope?.kemCiphertext) return false;
  const contextId = String(job.payload?.envelopeContext || `pen.doc_invite_claim:${job.id}`);
  const opened = await openSocialEnvelope<Record<string, unknown>>(
    envelope,
    session.mlKemSecretKey,
    contextId
  );
  const inviteePn = String(opened.inviteePn || '').trim();
  const inviteeMlKemPublicKey = String(opened.inviteeMlKemPublicKey || '').trim();
  const docId = String(opened.docId || '').trim();
  const groupId = String(opened.groupId || '').trim();
  const title = String(opened.title || 'Document');
  const role = String(opened.role || 'viewer') as PenRole;
  if (!inviteePn || !inviteeMlKemPublicKey || !docId || !groupId) return false;
  await invitePenCollaborator({
    session,
    docId,
    groupId,
    title,
    peerPnIdentifier: inviteePn.startsWith('pn-') ? inviteePn : `pn-${inviteePn}`,
    role,
    peerMlKemPublicKey: inviteeMlKemPublicKey
  });
  return true;
}

/**
 * pen.draft_upsert carrying live state: merge it into this member's local live
 * snapshot and tell an open editor. Applied on device; never sent to apply-inbound.
 */
async function applyPenLiveSnapshotFromMailbox(
  session: PenSession,
  job: { id: string; jobType: string; payload: Record<string, unknown> }
): Promise<boolean> {
  const payload: Record<string, unknown> = { ...(job.payload || {}) };
  const envelope = payload.envelope as { kemCiphertext: string; ciphertext: string } | undefined;
  if (envelope?.kemCiphertext) {
    if (!session.mlKemSecretKey) return false;
    const contextId = String(payload.envelopeContext || payload.requestId || job.jobType);
    Object.assign(
      payload,
      await openSocialEnvelope<Record<string, unknown>>(envelope, session.mlKemSecretKey, contextId)
    );
  }
  const sealed = payload.liveSnapshot;
  const rekey = payload.liveRekey as PenLiveRekey | undefined;
  if (!isPenLiveSealedSnapshot(sealed) && rekey?.t !== 'rekey') return false;
  const docId = String(payload.docId || '');
  const groupId = String(payload.groupId || '');
  if (!docId) return false;
  if (rekey?.t === 'rekey' && groupId) await applyMailboxRekey(session, docId, groupId, rekey);
  if (!isPenLiveSealedSnapshot(sealed)) return true;
  const { ensureDocKeyFromGroup } = await import('./penHydrate');
  const docKey =
    loadDocKey(docId) || (groupId ? await ensureDocKeyFromGroup({ session, docId, groupId }) : null);
  if (!docKey) return false;
  // A snapshot from an older key epoch simply does not merge; it is still consumed.
  await mergeLiveSnapshotIntoLocal({ pn: session.pnIdentifier, docId, incoming: sealed, docKey });
  if (payload.liveRoles && typeof payload.liveRoles === 'object') {
    saveLiveRolesUpdate(session.pnIdentifier, docId, payload.liveRoles as PenLiveRolesUpdate);
  }
  try {
    window.dispatchEvent(new CustomEvent(PEN_LIVE_SNAPSHOT_EVENT, { detail: { docId, sealed } }));
  } catch {
    /* non-browser */
  }
  return true;
}

/** Offline member catching up on a re-key: trust it only against the local copy's genesis key. */
async function applyMailboxRekey(
  session: PenSession,
  docId: string,
  groupId: string,
  rekey: PenLiveRekey
): Promise<void> {
  const local = loadLocalDoc(session.pnIdentifier, docId);
  const ownerPnHash = local?.manifest.ownerPnHash || local?.chain.genesis.authorPnHash || '';
  const ownerKey = local?.chain.genesis.publicKey || '';
  if (!local || !ownerPnHash || !ownerKey) return;
  const applied = await applyPenLiveRekey({
    session,
    groupId,
    rekey,
    anchor: { docId, ownerPnHash, ownerMlDsaPublicKey: ownerKey },
    currentEpoch: local.manifest.keyEpoch ?? 0
  });
  if (!applied) return;
  saveLocalDoc(session.pnIdentifier, {
    ...local,
    manifest: { ...local.manifest, keyEpoch: applied.keyEpoch, roles: applied.roles }
  });
  try {
    window.dispatchEvent(
      new CustomEvent(PEN_LIVE_REKEY_EVENT, {
        detail: { docId, keyEpoch: applied.keyEpoch, roles: applied.roles }
      })
    );
  } catch {
    /* non-browser */
  }
}

/** Drain mailbox and apply pen.* jobs into this user's Drive. */
const mailboxRouteByPn = new Map<string, string>();
const drainInFlight = new Map<string, Promise<number>>();

/** This owner's claimed inbox route, cached for the session. Null when locked or unreachable. */
export async function resolvePenMailboxRouteKey(session: PenSession): Promise<string | null> {
  const cached = mailboxRouteByPn.get(session.pnIdentifier);
  if (cached) return cached;
  const seal = sealSessionFromPen(session);
  if (!seal) return null;
  try {
    const routeKey = await ensureMailboxRouteKey(session.pnIdentifier, seal, {
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      pnIdentifier: session.pnIdentifier
    });
    mailboxRouteByPn.set(session.pnIdentifier, routeKey);
    return routeKey;
  } catch {
    return null;
  }
}

export async function drainPenMailbox(session: PenSession): Promise<number> {
  const existing = drainInFlight.get(session.pnIdentifier);
  if (existing) return existing;

  const run = (async () => {
    if (!session.mlKemSecretKey) return 0;

    const apply = createApiSocialApplier({
      apiBaseUrl: API_ENDPOINT,
      authToken: session.accessToken,
      identityId: session.pnIdentifier,
      openEnvelope: async (envelope, contextId) =>
        openSocialEnvelope<Record<string, unknown>>(envelope, session.mlKemSecretKey!, contextId)
    });

    const routeKey = await resolvePenMailboxRouteKey(session);
    if (!routeKey) return 0;

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
      if (job.jobType === 'pen.doc_invite_claim') {
        let ok = false;
        try {
          ok = await applyPenDocInviteClaimFromMailbox(session, job);
        } catch {
          ok = false;
        }
        if (ok) {
          applied += 1;
          await ownerFetch(
            'POST',
            '/api/mailbox/ack',
            { pnIdentifier: session.pnIdentifier, routeKey, jobIds: [job.id] },
            { pnIdentifier: session.pnIdentifier }
          ).catch(() => null);
        }
        continue;
      }
      if (!String(job.jobType || '').startsWith('pen.')) continue;
      if (job.jobType === PEN_DRAFT_UPSERT_KIND) {
        let handled = false;
        try {
          handled = await applyPenLiveSnapshotFromMailbox(session, job);
        } catch {
          handled = false;
        }
        if (handled) {
          applied += 1;
          await ownerFetch(
            'POST',
            '/api/mailbox/ack',
            { pnIdentifier: session.pnIdentifier, routeKey, jobIds: [job.id] },
            { pnIdentifier: session.pnIdentifier }
          ).catch(() => null);
          continue;
        }
      }
      let ok = false;
      try {
        ok = await apply({
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
      } catch {
        ok = false;
      }
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
