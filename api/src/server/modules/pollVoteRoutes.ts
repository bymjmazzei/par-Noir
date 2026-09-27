/**
 * Vote click: cache the tally and enqueue a sealed job for the owner.
 * The sheet append happens later, when the owner flushes apply-inbound.
 */

import type { Application, Request, Response } from 'express';
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

export function setupPollVoteRoutes(app: Application): void {
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
