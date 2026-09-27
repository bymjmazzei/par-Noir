/**
 * Live poll tallies. The owner's sheet catches up on unlock; the card reads this cache.
 */

import { getDatabasePool } from '../utils/database';
import type { PollCounts, PollOption, PollStructure } from '@par-noir/pen-protocol';
import { emptyPollCounts, pollIsClosed } from '@par-noir/pen-protocol';

export async function upsertPollStructureCache(input: {
  pollId: string;
  docId: string;
  structure: PollStructure;
}): Promise<void> {
  const db = getDatabasePool();
  await db.query(
    `INSERT INTO poll_structure_cache (poll_id, doc_id, question, options_json, closes_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (poll_id) DO UPDATE SET
       doc_id = EXCLUDED.doc_id,
       question = EXCLUDED.question,
       options_json = EXCLUDED.options_json,
       closes_at = EXCLUDED.closes_at,
       updated_at = NOW()`,
    [
      input.pollId,
      input.docId,
      input.structure.question,
      JSON.stringify(input.structure.options),
      input.structure.closesAt
    ]
  );
}

export async function readPollStructureCache(pollId: string): Promise<
  | (PollStructure & { docId: string })
  | null
> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT doc_id, question, options_json, closes_at FROM poll_structure_cache WHERE poll_id = $1`,
    [pollId]
  );
  const row = result.rows[0];
  if (!row) return null;
  let options: PollOption[] = [];
  try {
    const parsed = JSON.parse(String(row.options_json || '[]')) as PollOption[];
    if (Array.isArray(parsed)) options = parsed;
  } catch {
    options = [];
  }
  return {
    docId: String(row.doc_id || ''),
    question: String(row.question || ''),
    options,
    closesAt: row.closes_at ? String(row.closes_at) : null
  };
}

export async function insertPollVoteCache(input: {
  voteId: string;
  pollId: string;
  optionId: string;
}): Promise<{ inserted: boolean }> {
  const db = getDatabasePool();
  const result = await db.query(
    `INSERT INTO poll_vote_cache (vote_id, poll_id, option_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (vote_id) DO NOTHING
     RETURNING vote_id`,
    [input.voteId, input.pollId, input.optionId]
  );
  return { inserted: result.rows.length > 0 };
}

export async function pollCounts(pollId: string): Promise<PollCounts> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT option_id, COUNT(*)::int AS n FROM poll_vote_cache WHERE poll_id = $1 GROUP BY option_id`,
    [pollId]
  );
  const counts = emptyPollCounts();
  for (const row of result.rows) {
    const n = Number(row.n) || 0;
    counts.byOption[String(row.option_id)] = n;
    counts.total += n;
  }
  return counts;
}

export function structureRejectsVote(
  structure: PollStructure,
  optionId: string,
  now = Date.now()
): 'poll_closed' | 'unknown_option' | null {
  if (pollIsClosed(structure.closesAt, now)) return 'poll_closed';
  if (!structure.options.some((option) => option.id === optionId)) return 'unknown_option';
  return null;
}
