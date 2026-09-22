/**
 * Pen collab: group-per-doc + invite + outbox promote / comment / suggestion fanout.
 * Uses first-party Bearer; Drive writes go through /api/pen/apply-inbound (owner token gate).
 */

import { createOutboxRecord } from '@par-noir/device-cloud-credentials';
import {
  PEN_COMMENT_KIND,
  PEN_SECTION_PROMOTE_KIND,
  PEN_SUGGESTION_KIND,
  penCommentFanout,
  penSectionPromoteFanout,
  penSuggestionFanout,
  type PenDocComment,
  type PenPromoteLink,
  type PenSuggestion
} from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';

export async function createPenGroup(params: {
  accessToken: string;
  ownerPnIdentifier: string;
  groupId: string;
  title: string;
  members: Array<{
    memberPnIdentifier: string;
    wrappedChatKey: string;
    accessRole: 'readWrite' | 'readOnly';
  }>;
}): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/groups`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ownerPnIdentifier: params.ownerPnIdentifier,
      title: params.title,
      groupId: params.groupId,
      members: params.members
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'group_create_failed');
  }
}

export async function fetchGroupRoster(params: {
  accessToken: string;
  groupId: string;
  ownerPnIdentifier: string;
}): Promise<Array<{ memberPnIdentifier: string; routeKey?: string }>> {
  const q = new URLSearchParams({ ownerPnIdentifier: params.ownerPnIdentifier });
  const res = await fetch(
    `${API_ENDPOINT}/api/groups/${encodeURIComponent(params.groupId)}/roster?${q}`,
    { headers: { Authorization: `Bearer ${params.accessToken}` } }
  );
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.members || data.roster || []) as Array<{
    memberPnIdentifier: string;
    routeKey?: string;
  }>;
}

export async function applyPenPromoteInbound(params: {
  accessToken: string;
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
  return fetch(`${API_ENDPOINT}/api/pen/apply-inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
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
    })
  });
}

export async function applyPenCommentInbound(params: {
  accessToken: string;
  userPnIdentifier: string;
  docId: string;
  groupId?: string;
  comment: PenDocComment;
}): Promise<Response> {
  return fetch(`${API_ENDPOINT}/api/pen/apply-inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_COMMENT_KIND,
      docId: params.docId,
      groupId: params.groupId,
      comment: params.comment
    })
  });
}

export async function applyPenSuggestionInbound(params: {
  accessToken: string;
  userPnIdentifier: string;
  docId: string;
  groupId?: string;
  suggestion: PenSuggestion;
  acceptPromote?: Record<string, unknown>;
}): Promise<Response> {
  return fetch(`${API_ENDPOINT}/api/pen/apply-inbound`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_SUGGESTION_KIND,
      docId: params.docId,
      groupId: params.groupId,
      suggestion: params.suggestion,
      acceptPromote: params.acceptPromote
    })
  });
}

/** Queue local outbox record with peer route fanout (when route keys known). */
export function queuePenSectionPromote(params: {
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  const record = createOutboxRecord({
    outboxId: params.outboxId,
    kind: PEN_SECTION_PROMOTE_KIND,
    payload: params.payload,
    fanout: penSectionPromoteFanout(params.peerRouteKeys)
  });
  sessionStorage.setItem(`pen_last_promote:${String(params.payload.docId || '')}`, JSON.stringify(record));
}

export function queuePenComment(params: {
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  const record = createOutboxRecord({
    outboxId: params.outboxId,
    kind: PEN_COMMENT_KIND,
    payload: params.payload,
    fanout: penCommentFanout(params.peerRouteKeys)
  });
  sessionStorage.setItem(`pen_last_comment:${String(params.payload.docId || '')}`, JSON.stringify(record));
}

export function queuePenSuggestion(params: {
  outboxId: string;
  payload: Record<string, unknown>;
  peerRouteKeys: string[];
}): void {
  const record = createOutboxRecord({
    outboxId: params.outboxId,
    kind: PEN_SUGGESTION_KIND,
    payload: params.payload,
    fanout: penSuggestionFanout(params.peerRouteKeys)
  });
  sessionStorage.setItem(
    `pen_last_suggestion:${String(params.payload.docId || '')}`,
    JSON.stringify(record)
  );
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
  sessionStorage.setItem(
    `pen_share:${docId}:${peerPn}`,
    JSON.stringify({ docId, accessRole: 'readWrite' })
  );
}
