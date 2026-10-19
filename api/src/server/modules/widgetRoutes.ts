/**
 * Widget register / respond / view. Server enforces reveal policy and one response per actor.
 */

import crypto from 'crypto';
import type { Application, Request, Response } from 'express';
import {
  hashPnIdentifier,
  isSheetTrigger,
  normalizeWriteIn,
  parseWidgetId,
  POLL_WRITE_IN_MAX,
  structureRejectsVote,
  TAP_COLUMNS,
  TAP_WIDGET_GROUP,
  type PollStructure,
  type WidgetBackendKind,
  type WidgetRevealPolicy
} from '@par-noir/pen-protocol';
import {
  gateFirstPartyOwnerRoute,
  requireFirstPartyOAuthClient,
  DEVICE_CAPABILITIES
} from './deviceCapabilityService';
import { enqueueSocialJob } from './socialRail';
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  buildWidgetView,
  insertWidgetResponse,
  insertWidgetTap,
  pollCountsFromResponses,
  readWidgetStructure,
  upsertWidgetStructure
} from './widgetCache';

const MAX_ROW_CELLS = 64;
const MAX_CELL_CHARS = 2000;
const MAX_TAP_CELL_CHARS = 200;
const TAP_WINDOW_MS = 10 * 60 * 1000;
const TAP_LIMIT = 30;
const TAP_LIMIT_ALL_WIDGETS = 300;
const TAP_BUCKETS_MAX = 20000;
export const ANONYMOUS_TAP_ACTOR = 'anonymous';

/** Fixed windows per viewer (or IP when anonymous), per widget and overall. In memory, so they reset on deploy. */
const tapBuckets = new Map<string, { count: number; resetAt: number }>();

function tapAllowed(key: string, limit: number, now = Date.now()): boolean {
  const bucket = tapBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (tapBuckets.size >= TAP_BUCKETS_MAX) {
      for (const [k, b] of tapBuckets) if (b.resetAt <= now) tapBuckets.delete(k);
      if (tapBuckets.size >= TAP_BUCKETS_MAX) tapBuckets.clear();
    }
    tapBuckets.set(key, { count: 1, resetAt: now + TAP_WINDOW_MS });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetTapRateLimit(): void {
  tapBuckets.clear();
}

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

export function setupWidgetRoutes(app: Application): void {
  app.post('/api/pen/widgets/register', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const ownerPn = String(req.body?.userPnIdentifier || '').trim();
      const widgetId = String(req.body?.widgetId || '').trim();
      const docId = String(req.body?.docId || '').trim();
      const kind = String(req.body?.kind || '').trim() as WidgetBackendKind;
      const spreadsheetId = String(req.body?.spreadsheetId || '').trim();
      const revealPolicy = String(req.body?.revealPolicy || 'after_response').trim() as WidgetRevealPolicy;
      const structure = (req.body?.structure || {}) as PollStructure;
      const closesAt = req.body?.closesAt ? String(req.body.closesAt) : null;
      if (!ownerPn || !widgetId || !docId || !spreadsheetId || !kind) {
        return res.status(400).json({ error: 'widget_register_fields_required' });
      }
      if (!parseWidgetId(widgetId)) return res.status(400).json({ error: 'widget_id_invalid' });
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, ownerPn))) {
        return;
      }
      await upsertWidgetStructure({
        widgetId,
        docId,
        ownerPnHash: hashPnIdentifier(ownerPn),
        kind,
        structure,
        revealPolicy,
        closesAt,
        spreadsheetId
      });
      return res.json({ ok: true });
    } catch (e) {
      safeLogger.warn('[pen/widgets] register failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'widget_register_failed' });
    }
  });

  app.get('/api/pen/widgets/:widgetId/view', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const widgetId = String(req.params.widgetId || '').trim();
      if (!widgetId) return res.status(400).json({ error: 'widget_id_required' });
      const viewerPn = String(req.query.userPnIdentifier || '').trim();
      const unlocked = Boolean(viewerPn);
      const view = await buildWidgetView({ widgetId, viewerPn: viewerPn || null, unlocked });
      if (!view) return res.status(404).json({ error: 'widget_not_found' });
      return res.json(view);
    } catch (e) {
      safeLogger.warn('[pen/widgets] view failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'widget_view_failed' });
    }
  });

  app.post('/api/pen/widgets/respond', async (req: Request, res: Response) => {
    try {
      if (!requireFirstPartyOAuthClient(req, res)) return;
      const viewerPn = String(req.body?.userPnIdentifier || '').trim();
      const ownerPn = String(req.body?.ownerPnIdentifier || '').trim();
      const widgetId = String(req.body?.widgetId || '').trim();
      const responseId = String(req.body?.responseId || '').trim();
      const respondKind = String(req.body?.respondKind || '').trim();
      if (!viewerPn || !ownerPn || !widgetId || !responseId || !respondKind) {
        return res.status(400).json({ error: 'widget_respond_fields_required' });
      }
      if (!(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, viewerPn))) {
        return;
      }
      const row = await readWidgetStructure(widgetId);
      if (!row) return res.status(404).json({ error: 'widget_not_found' });
      if (hashPnIdentifier(viewerPn) === row.ownerPnHash) {
        return res.status(409).json({ error: 'owner_cannot_respond' });
      }
      const actorHash = hashPnIdentifier(viewerPn);

      if (respondKind === 'vote') {
        const optionId = String(req.body?.optionId || '').trim();
        if (!optionId) return res.status(400).json({ error: 'option_id_required' });
        const rejected = structureRejectsVote(row.structure, optionId);
        if (rejected) return res.status(409).json({ error: rejected });
        const rawWriteIn = req.body?.writeIn;
        if (rawWriteIn != null && (typeof rawWriteIn !== 'string' || rawWriteIn.length > POLL_WRITE_IN_MAX * 2)) {
          return res.status(400).json({ error: 'write_in_invalid' });
        }
        const writeIn = normalizeWriteIn(rawWriteIn);
        const writeInOption = row.structure.options.find((option) => option.id === optionId)?.writeIn === true;
        if (writeInOption && !writeIn) return res.status(400).json({ error: 'write_in_required' });
        if (!writeInOption && writeIn) return res.status(409).json({ error: 'write_in_not_allowed' });
        const inserted = await insertWidgetResponse({
          widgetId,
          actorHash,
          responseId,
          payload: { kind: 'vote', optionId, ...(writeIn ? { writeIn } : {}) }
        });
        if (!inserted.inserted) return res.status(409).json({ error: 'already_responded' });
        const createdAt = new Date().toISOString();
        const enqueued = await enqueueSocialJob({
          jobType: 'pen.poll_vote',
          peerPn: ownerPn,
          requestId: responseId,
          sealed: {
            voteId: responseId,
            optionId,
            ...(writeIn ? { writeIn } : {}),
            spreadsheetId: row.spreadsheetId,
            docId: row.docId,
            widgetId,
            createdAt
          }
        });
        if (!enqueued) {
          safeLogger.warn('[pen/widgets] vote cached but owner mailbox was not enqueued', {
            widget: hashIdentifier(widgetId),
            vote: hashIdentifier(responseId)
          });
        }
      } else if (respondKind === 'widget_row') {
        const actionRow = (req.body?.row || {}) as Record<string, unknown>;
        const trigger = String(actionRow.trigger || '').trim();
        const actionId = String(actionRow.actionId || responseId).trim();
        if (trigger === 'widget.tap' || (trigger !== 'widget.submit' && !isSheetTrigger(trigger))) {
          return res.status(400).json({ error: 'widget_trigger_invalid' });
        }
        const headers = stringList(actionRow.headers);
        const cells = stringList(actionRow.cells);
        const fields = stringRecord(actionRow.fields);
        if (!headers || !cells || !fields) {
          return res.status(400).json({ error: 'widget_row_invalid' });
        }
        const inserted = await insertWidgetResponse({
          widgetId,
          actorHash,
          responseId: actionId,
          payload: { kind: 'widget_row', trigger, ...actionRow }
        });
        if (!inserted.inserted) return res.status(409).json({ error: 'already_responded' });
        const createdAt = new Date().toISOString();
        const enqueued = await enqueueSocialJob({
          jobType: 'pen.widget_action',
          peerPn: ownerPn,
          requestId: actionId,
          sealed: {
            docId: row.docId,
            spreadsheetId: row.spreadsheetId,
            widgetId,
            actionId,
            trigger,
            actorId: actorHash,
            createdAt,
            ...(typeof actionRow.present === 'boolean' ? { present: actionRow.present } : {}),
            ...(headers.length ? { headers } : {}),
            ...(cells.length ? { cells } : {}),
            ...(Object.keys(fields).length ? { fields } : {})
          }
        });
        if (!enqueued) {
          safeLogger.warn('[pen/widgets] action accepted but owner mailbox was not enqueued', {
            widget: hashIdentifier(widgetId),
            action: hashIdentifier(actionId)
          });
        }
      } else {
        return res.status(400).json({ error: 'respond_kind_invalid' });
      }

      const view = await buildWidgetView({
        widgetId,
        viewerPn,
        unlocked: true
      });
      const counts = row.kind === 'poll' ? await pollCountsFromResponses(widgetId) : undefined;
      return res.json({ ok: true, view, ...(counts ? { counts } : {}) });
    } catch (e) {
      safeLogger.warn('[pen/widgets] respond failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'widget_respond_failed' });
    }
  });

  /**
   * Button taps (open, go to page, calendar). Without a viewer pn the tap is anonymous and needs
   * no bearer; with one, the usual first-party owner gate applies. Owner taps are dropped.
   */
  app.post('/api/pen/widgets/tap', async (req: Request, res: Response) => {
    try {
      const viewerPn = String(req.body?.userPnIdentifier || '').trim();
      const ownerPn = String(req.body?.ownerPnIdentifier || '').trim();
      const widgetId = String(req.body?.widgetId || '').trim();
      const tap = (req.body?.row || {}) as Record<string, unknown>;
      const parsed = parseWidgetId(widgetId);
      if (!ownerPn || !parsed || parsed.groupLayerId !== TAP_WIDGET_GROUP) {
        return res.status(400).json({ error: 'widget_tap_fields_required' });
      }
      const headers = stringList(tap.headers);
      const cells = stringList(tap.cells);
      if (
        !headers ||
        !cells ||
        headers.join('|') !== TAP_COLUMNS.join('|') ||
        cells.length !== TAP_COLUMNS.length ||
        cells.some((cell) => cell.length > MAX_TAP_CELL_CHARS)
      ) {
        return res.status(400).json({ error: 'widget_tap_row_invalid' });
      }
      const rawActionId = String(tap.actionId || '').trim();
      const actionId = /^[A-Za-z0-9-]{8,64}$/.test(rawActionId) ? rawActionId : crypto.randomUUID();

      if (viewerPn && !(await gateFirstPartyOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, viewerPn))) {
        return;
      }
      const row = await readWidgetStructure(widgetId);
      if (!row) return res.status(404).json({ error: 'widget_not_found' });
      if (hashPnIdentifier(ownerPn) !== row.ownerPnHash) {
        return res.status(403).json({ error: 'widget_owner_mismatch' });
      }
      const actorHash = viewerPn ? hashPnIdentifier(viewerPn) : ANONYMOUS_TAP_ACTOR;
      if (actorHash === row.ownerPnHash) return res.json({ ok: true, ignored: 'owner' });
      const who = viewerPn ? actorHash : `ip:${req.ip || 'unknown'}`;
      if (!tapAllowed(`${who}|${widgetId}`, TAP_LIMIT) || !tapAllowed(who, TAP_LIMIT_ALL_WIDGETS)) {
        return res.status(429).json({ error: 'widget_tap_rate_limited' });
      }

      const [button, action, target] = cells as [string, string, string];
      const inserted = await insertWidgetTap({ actionId, widgetId, actorHash, button, action, target });
      if (!inserted.inserted) return res.json({ ok: true, duplicate: true });
      const enqueued = await enqueueSocialJob({
        jobType: 'pen.widget_action',
        peerPn: ownerPn,
        requestId: actionId,
        sealed: {
          docId: row.docId,
          spreadsheetId: row.spreadsheetId,
          widgetId,
          actionId,
          trigger: 'widget.tap',
          actorId: actorHash,
          createdAt: new Date().toISOString(),
          headers,
          cells
        }
      });
      if (!enqueued) {
        safeLogger.warn('[pen/widgets] tap stored but owner mailbox was not enqueued', {
          widget: hashIdentifier(widgetId),
          action: hashIdentifier(actionId)
        });
      }
      return res.json({ ok: true });
    } catch (e) {
      safeLogger.warn('[pen/widgets] tap failed', {
        err: e instanceof Error ? e.message : 'unknown'
      });
      return res.status(500).json({ error: 'widget_tap_failed' });
    }
  });
}

/** @deprecated use setupWidgetRoutes */
export const setupPollVoteRoutes = setupWidgetRoutes;
