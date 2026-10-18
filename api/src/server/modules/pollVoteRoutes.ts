/**
 * Vote click: cache the tally and enqueue a sealed job for the owner.
 * Widget press (toggle, stamp, rank, allocate, collecting submit): enqueue a sealed
 * pen.widget_action row for the owner. Sheet writes happen later, when the owner
 * flushes apply-inbound.
 */

import type { Application, Request, Response } from 'express';
import { hashPnIdentifier, isSheetTrigger } from '@par-noir/pen-protocol';
import {
  gateFirstPartyOwnerRoute,
  requireFirstPartyOAuthClient,
  DEVICE_CAPABILITIES
} from './deviceCapabilityService';
import { enqueueSocialJob } from './socialRail';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  insertPollVoteCache,
  pollCounts,
  readPollStructureCache,
  structureRejectsVote
} from './pollVoteCache';

const MAX_ROW_CELLS = 64;
const MAX_CELL_CHARS = 2000;

function stringList(raw: unknown): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ROW_CELLS) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || item.length > MAX_CELL_CHARS) return null;
    out.push(item);
  }
  return out;
}

function stringRecord(raw: unknown): Record<string, string> | null {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_ROW_CELLS) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.length > MAX_CELL_CHARS || key.length > MAX_CELL_CHARS) {
      return null;
    }
    out[key] = value;
  }
  return out;
}

export function setupPollVoteRoutes(app: Application): void {
  app.post('/api/pen/widgets/action', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const viewerPn = String(req.body?.userPnIdentifier || '').trim();
      const ownerPn = String(req.body?.ownerPnIdentifier || '').trim();
      const spreadsheetId = String(req.body?.spreadsheetId || '').trim();
      const docId = String(req.body?.docId || '').trim();
      const row = (req.body?.row || {}) as Record<string, unknown>;
      const actionId = String(row.actionId || '').trim();
      const trigger = String(row.trigger || '').trim();
      if (!viewerPn || !ownerPn || !spreadsheetId || !docId || !actionId) {
        return res.status(400).json({ error: 'widget_action_fields_required' });
      }
      if (trigger !== 'widget.submit' && !isSheetTrigger(trigger)) {
        return res.status(400).json({ error: 'widget_trigger_invalid' });
      }
      const headers = stringList(row.headers);
      const cells = stringList(row.cells);
      const fields = stringRecord(row.fields);
      if (!headers || !cells || !fields) {
        return res.status(400).json({ error: 'widget_row_invalid' });
      }
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, viewerPn))) {
        return;
      }
      const createdAt = new Date().toISOString();
      const enqueued = await enqueueSocialJob({
        jobType: 'pen.widget_action',
        peerPn: ownerPn,
        requestId: actionId,
        sealed: {
          docId,
          spreadsheetId,
          actionId,
          trigger,
          actorId: hashPnIdentifier(viewerPn),
          createdAt,
          ...(typeof row.present === 'boolean' ? { present: row.present } : {}),
          ...(headers.length ? { headers } : {}),
          ...(cells.length ? { cells } : {}),
          ...(Object.keys(fields).length ? { fields } : {})
        }
      });
      if (!enqueued) {
        safeLogger.warn('[pen/widgets] action accepted but owner mailbox was not enqueued', {
          sheet: hashIdentifier(spreadsheetId),
          action: hashIdentifier(actionId)
        });
      }
      return res.json({ ok: true, enqueued });
    } catch (e) {
      safeLogger.warn('[pen/widgets] action failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'widget_action_failed' });
    }
  });

  app.get('/api/pen/polls/:pollId', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const pollId = String(req.params.pollId || '').trim();
      if (!pollId) return res.status(400).json({ error: 'poll_id_required' });
      const structure = await readPollStructureCache(pollId);
      if (!structure) return res.status(404).json({ error: 'poll_not_found' });
      const counts = await pollCounts(pollId);
      return res.json({
        question: structure.question,
        options: structure.options,
        closesAt: structure.closesAt,
        counts
      });
    } catch (e) {
      safeLogger.warn('[pen/polls] read failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'poll_read_failed' });
    }
  });

  app.post('/api/pen/polls/vote', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const voterPn = String(req.body?.userPnIdentifier || '').trim();
      const ownerPn = String(req.body?.ownerPnIdentifier || '').trim();
      const pollId = String(req.body?.pollId || '').trim();
      const docId = String(req.body?.docId || '').trim();
      const optionId = String(req.body?.optionId || '').trim();
      const voteId = String(req.body?.voteId || '').trim();
      if (!voterPn || !ownerPn || !pollId || !optionId || !voteId) {
        return res.status(400).json({ error: 'vote_fields_required' });
      }
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, voterPn))) {
        return;
      }
      const structure = await readPollStructureCache(pollId);
      if (!structure) return res.status(404).json({ error: 'poll_not_found' });
      const rejected = structureRejectsVote(structure, optionId);
      if (rejected) return res.status(409).json({ error: rejected });
      await insertPollVoteCache({ voteId, pollId, optionId });
      const createdAt = new Date().toISOString();
      const enqueued = await enqueueSocialJob({
        jobType: 'pen.poll_vote',
        peerPn: ownerPn,
        requestId: voteId,
        sealed: {
          voteId,
          optionId,
          spreadsheetId: pollId,
          docId: docId || structure.docId,
          createdAt
        }
      });
      if (!enqueued) {
        safeLogger.warn('[pen/polls] vote cached but owner mailbox was not enqueued', {
          poll: hashIdentifier(pollId),
          vote: hashIdentifier(voteId)
        });
      }
      const counts = await pollCounts(pollId);
      return res.json({ ok: true, enqueued, counts });
    } catch (e) {
      safeLogger.warn('[pen/polls] vote failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'poll_vote_failed' });
    }
  });
}
