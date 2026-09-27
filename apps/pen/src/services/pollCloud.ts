/**
 * Poll sheet + vote rail. Create and structure write the owner's Drive.
 * A vote commits the voter's outbox, caches the tally, and waits for the owner unlock to append sheet 1.
 */

import { ensureMailboxRouteKey } from '@par-noir/device-cloud-credentials';
import {
  PEN_POLL_CREATE_KIND,
  PEN_POLL_STRUCTURE_KIND,
  PEN_POLL_VOTE_KIND,
  type PollCounts,
  type PollStructure
} from '@par-noir/pen-protocol';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import { queuePenOutbox, sealSessionFromPen } from './penCollab';
import type { PenSession } from './penSession';
import { API_ENDPOINT } from '../config/api';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'poll_request_failed');
  }
  return data;
}

export async function createPollSheet(input: {
  session: PenSession;
  docId: string;
  groupId: string;
  structure: PollStructure;
}): Promise<string> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: input.session.pnIdentifier,
      jobType: PEN_POLL_CREATE_KIND,
      docId: input.docId,
      groupId: input.groupId,
      structure: input.structure
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
  const data = await readJson(res);
  const spreadsheetId = String(data.spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('poll_create_failed');
  return spreadsheetId;
}

export async function putPollStructure(input: {
  session: PenSession;
  docId: string;
  spreadsheetId: string;
  structure: PollStructure;
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: input.session.pnIdentifier,
      jobType: PEN_POLL_STRUCTURE_KIND,
      docId: input.docId,
      spreadsheetId: input.spreadsheetId,
      structure: input.structure
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
  await readJson(res);
}

export async function readPollCache(input: {
  session: PenSession;
  pollId: string;
}): Promise<{ structure: PollStructure; counts: PollCounts }> {
  const res = await ownerGet(`/api/pen/polls/${encodeURIComponent(input.pollId)}`, {
    pnIdentifier: input.session.pnIdentifier
  });
  const data = await readJson(res);
  const counts = (data.counts || { total: 0, byOption: {} }) as PollCounts;
  return {
    structure: {
      question: String(data.question || ''),
      options: Array.isArray(data.options) ? (data.options as PollStructure['options']) : [],
      closesAt: data.closesAt ? String(data.closesAt) : null
    },
    counts
  };
}

export async function castPollVote(input: {
  session: PenSession;
  ownerPnIdentifier: string;
  docId: string;
  spreadsheetId: string;
  optionId: string;
}): Promise<{ enqueued: boolean; counts: PollCounts }> {
  const voteId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const seal = sealSessionFromPen(input.session);
  let routeKey = '';
  if (seal) {
    try {
      routeKey = await ensureMailboxRouteKey(input.ownerPnIdentifier, seal, {
        apiBaseUrl: API_ENDPOINT,
        authToken: input.session.accessToken,
        pnIdentifier: input.session.pnIdentifier
      });
    } catch {
      routeKey = '';
    }
  }
  await queuePenOutbox({
    session: input.session,
    kind: PEN_POLL_VOTE_KIND,
    outboxId: voteId,
    payload: {
      requestId: voteId,
      voteId,
      optionId: input.optionId,
      spreadsheetId: input.spreadsheetId,
      docId: input.docId,
      createdAt
    },
    peerRouteKeys: routeKey ? [routeKey] : [],
    ownCloudApplied: true
  });
  const res = await ownerFetch(
    'POST',
    '/api/pen/polls/vote',
    {
      userPnIdentifier: input.session.pnIdentifier,
      ownerPnIdentifier: input.ownerPnIdentifier,
      pollId: input.spreadsheetId,
      docId: input.docId,
      optionId: input.optionId,
      voteId
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
  const data = await readJson(res);
  return {
    enqueued: data.enqueued === true,
    counts: (data.counts || { total: 0, byOption: {} }) as PollCounts
  };
}
