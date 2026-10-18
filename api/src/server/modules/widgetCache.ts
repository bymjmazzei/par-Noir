/**
 * Live widget responses and structures. Owner Drive catches up on unlock.
 */

import { getDatabasePool } from '../utils/database';
import type { PollCounts, PollOption, PollStructure } from '@par-noir/pen-protocol';
import {
  emptyPollCounts,
  hashPnIdentifier,
  pollIsClosed,
  pollResultsFromCounts,
  widgetViewPhase,
  type WidgetBackendKind,
  type WidgetRevealPolicy,
  type WidgetResultsPublic,
  type WidgetViewPayload
} from '@par-noir/pen-protocol';

export type WidgetStructureRow = {
  widgetId: string;
  docId: string;
  ownerPnHash: string;
  kind: WidgetBackendKind;
  structure: PollStructure;
  revealPolicy: WidgetRevealPolicy;
  closesAt: string | null;
  spreadsheetId: string;
};

export async function upsertWidgetStructure(input: {
  widgetId: string;
  docId: string;
  ownerPnHash: string;
  kind: WidgetBackendKind;
  structure: PollStructure;
  revealPolicy: WidgetRevealPolicy;
  closesAt: string | null;
  spreadsheetId: string;
}): Promise<void> {
  const db = getDatabasePool();
  await db.query(
    `INSERT INTO widget_structure_cache (
      widget_id, doc_id, owner_pn_hash, kind, structure_json, reveal_policy, closes_at, spreadsheet_id, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (widget_id) DO UPDATE SET
      doc_id = EXCLUDED.doc_id,
      owner_pn_hash = EXCLUDED.owner_pn_hash,
      kind = EXCLUDED.kind,
      structure_json = EXCLUDED.structure_json,
      reveal_policy = EXCLUDED.reveal_policy,
      closes_at = EXCLUDED.closes_at,
      spreadsheet_id = EXCLUDED.spreadsheet_id,
      updated_at = NOW()`,
    [
      input.widgetId,
      input.docId,
      input.ownerPnHash,
      input.kind,
      JSON.stringify(input.structure),
      input.revealPolicy,
      input.closesAt,
      input.spreadsheetId
    ]
  );
}

export async function readWidgetStructure(widgetId: string): Promise<WidgetStructureRow | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT widget_id, doc_id, owner_pn_hash, kind, structure_json, reveal_policy, closes_at, spreadsheet_id
     FROM widget_structure_cache WHERE widget_id = $1`,
    [widgetId]
  );
  const row = result.rows[0];
  if (!row) return null;
  let structure: PollStructure = { question: '', options: [], closesAt: null };
  try {
    structure = JSON.parse(String(row.structure_json || '{}')) as PollStructure;
  } catch {
    structure = { question: '', options: [], closesAt: null };
  }
  return {
    widgetId: String(row.widget_id),
    docId: String(row.doc_id),
    ownerPnHash: String(row.owner_pn_hash),
    kind: String(row.kind) as WidgetBackendKind,
    structure,
    revealPolicy: String(row.reveal_policy || 'after_response') as WidgetRevealPolicy,
    closesAt: row.closes_at ? String(row.closes_at) : null,
    spreadsheetId: String(row.spreadsheet_id || '')
  };
}

export async function insertWidgetResponse(input: {
  widgetId: string;
  actorHash: string;
  responseId: string;
  payload: Record<string, unknown>;
}): Promise<{ inserted: boolean }> {
  const db = getDatabasePool();
  const result = await db.query(
    `INSERT INTO widget_response_cache (response_id, widget_id, actor_hash, payload_json)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (widget_id, actor_hash) DO NOTHING
     RETURNING response_id`,
    [input.responseId, input.widgetId, input.actorHash, JSON.stringify(input.payload)]
  );
  return { inserted: result.rows.length > 0 };
}

export async function readWidgetResponse(
  widgetId: string,
  actorHash: string
): Promise<Record<string, unknown> | null> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT payload_json FROM widget_response_cache WHERE widget_id = $1 AND actor_hash = $2`,
    [widgetId, actorHash]
  );
  const row = result.rows[0];
  if (!row) return null;
  try {
    return JSON.parse(String(row.payload_json || '{}')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function pollCountsFromResponses(widgetId: string): Promise<PollCounts> {
  const db = getDatabasePool();
  const result = await db.query(
    `SELECT payload_json FROM widget_response_cache WHERE widget_id = $1`,
    [widgetId]
  );
  const counts = emptyPollCounts();
  for (const row of result.rows) {
    try {
      const payload = JSON.parse(String(row.payload_json || '{}')) as { optionId?: string };
      const optionId = String(payload.optionId || '').trim();
      if (!optionId) continue;
      counts.byOption[optionId] = (counts.byOption[optionId] || 0) + 1;
      counts.total += 1;
    } catch {
      /* skip */
    }
  }
  return counts;
}

function toggleAggregate(rows: Array<Record<string, unknown>>): WidgetResultsPublic {
  let onCount = 0;
  for (const payload of rows) {
    if (payload.present === true) onCount += 1;
  }
  return { kind: 'toggle', onCount, total: rows.length };
}

function stampAggregate(rows: Array<Record<string, unknown>>): WidgetResultsPublic {
  return { kind: 'stamp', count: rows.length };
}

async function allResponsePayloads(widgetId: string): Promise<Array<Record<string, unknown>>> {
  const db = getDatabasePool();
  const result = await db.query(`SELECT payload_json FROM widget_response_cache WHERE widget_id = $1`, [
    widgetId
  ]);
  const out: Array<Record<string, unknown>> = [];
  for (const row of result.rows) {
    try {
      out.push(JSON.parse(String(row.payload_json || '{}')) as Record<string, unknown>);
    } catch {
      /* skip */
    }
  }
  return out;
}

export async function aggregateWidgetResults(
  row: WidgetStructureRow
): Promise<{ public: WidgetResultsPublic; ownerDetails?: Record<string, unknown> }> {
  const payloads = await allResponsePayloads(row.widgetId);
  if (row.kind === 'poll') {
    const counts = await pollCountsFromResponses(row.widgetId);
    const publicResults = pollResultsFromCounts(row.structure, counts);
    const writeIns = payloads
      .filter((p) => typeof p.writeIn === 'string' && p.writeIn)
      .map((p) => ({ optionId: p.optionId, writeIn: p.writeIn }));
    return {
      public: publicResults,
      ...(writeIns.length ? { ownerDetails: { writeIns } } : {})
    };
  }
  if (row.kind === 'toggle') return { public: toggleAggregate(payloads) };
  if (row.kind === 'stamp') return { public: stampAggregate(payloads) };
  if (row.kind === 'submit') {
    return {
      public: { kind: 'submit', message: 'Sent' },
      ownerDetails: { rows: payloads }
    };
  }
  return { public: { kind: 'stamp', count: payloads.length } };
}

export async function buildWidgetView(input: {
  widgetId: string;
  viewerPn?: string | null;
  unlocked: boolean;
  now?: number;
}): Promise<WidgetViewPayload | null> {
  const row = await readWidgetStructure(input.widgetId);
  if (!row) return null;
  const viewerHash = input.viewerPn ? hashPnIdentifier(input.viewerPn) : null;
  const myResponse = viewerHash ? await readWidgetResponse(input.widgetId, viewerHash) : null;
  const hasResponded = Boolean(myResponse);
  const phase = widgetViewPhase({
    unlocked: input.unlocked,
    viewerActorHash: viewerHash,
    ownerPnHash: row.ownerPnHash,
    revealPolicy: row.revealPolicy,
    closesAt: row.closesAt,
    hasResponded,
    now: input.now
  });
  const base: WidgetViewPayload = {
    widgetId: row.widgetId,
    phase,
    revealPolicy: row.revealPolicy,
    closesAt: row.closesAt,
    ...(row.kind === 'poll' ? { structure: row.structure } : {}),
    ...(myResponse ? { myResponse } : {})
  };
  if (phase === 'results' || phase === 'owner') {
    const agg = await aggregateWidgetResults(row);
    base.results = agg.public;
    if (phase === 'owner' && agg.ownerDetails) base.ownerDetails = agg.ownerDetails;
  }
  return base;
}

export type { PollOption };
