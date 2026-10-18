/**
 * Widget sheet + respond/view rail. Sheets are created on the owner's device.
 */

import { createPollSpreadsheetOnDevice } from '@par-noir/device-cloud-credentials';
import { getCloudAccessTokenFromSession } from '@par-noir/device-cloud-credentials';
import {
  backendKindForGroup,
  encodeWidgetId,
  revealPolicyFromLayers,
  structureFromLayers,
  type PollCounts,
  type PollStructure,
  type PenSectionContent,
  type WidgetViewPayload
} from '@par-noir/pen-protocol';
import { apiFetch, ownerGet } from './penOwnerFetch';
import type { PenSession } from './penSession';

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'widget_request_failed');
  }
  return data;
}

export async function ensureWidgetSheet(input: {
  session: PenSession;
  docId: string;
  groupId: string;
  section: PenSectionContent;
  title?: string;
}): Promise<string> {
  const cloudToken = getCloudAccessTokenFromSession(input.session.pnIdentifier);
  if (!cloudToken) throw new Error('cloud_token_required');
  const structure = structureFromLayers(input.section, input.groupId);
  const spreadsheetId = await createPollSpreadsheetOnDevice(cloudToken, {
    title: input.title || `Poll ${input.docId.slice(0, 8)}`,
    structure
  });
  return spreadsheetId;
}

/** @deprecated use ensureWidgetSheet */
export const createPollSheet = ensureWidgetSheet;

export async function registerWidget(input: {
  session: PenSession;
  docId: string;
  groupId: string;
  section: PenSectionContent;
  spreadsheetId: string;
}): Promise<void> {
  const structure = structureFromLayers(input.section, input.groupId);
  const revealPolicy = revealPolicyFromLayers(input.section.layers || [], input.groupId);
  const kind = backendKindForGroup(input.section, input.groupId);
  if (!kind) return;
  const widgetId = encodeWidgetId(input.docId, input.groupId);
  const res = await apiFetch(
    'POST',
    '/api/pen/widgets/register',
    {
      userPnIdentifier: input.session.pnIdentifier,
      widgetId,
      docId: input.docId,
      kind,
      structure,
      revealPolicy,
      closesAt: structure.closesAt,
      spreadsheetId: input.spreadsheetId
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
  await readJson(res);
}

/** @deprecated use registerWidget */
export async function putPollStructure(input: {
  session: PenSession;
  docId: string;
  spreadsheetId: string;
  structure: PollStructure;
  groupId: string;
  section: PenSectionContent;
}): Promise<void> {
  await registerWidget({
    session: input.session,
    docId: input.docId,
    groupId: input.groupId,
    section: input.section,
    spreadsheetId: input.spreadsheetId
  });
}

export async function fetchWidgetView(input: {
  session: PenSession;
  widgetId: string;
}): Promise<WidgetViewPayload> {
  const res = await ownerGet(
    `/api/pen/widgets/${encodeURIComponent(input.widgetId)}/view?userPnIdentifier=${encodeURIComponent(input.session.pnIdentifier)}`,
    { pnIdentifier: input.session.pnIdentifier }
  );
  const data = await readJson(res);
  return data as WidgetViewPayload;
}

/** @deprecated use fetchWidgetView */
export const readPollCache = fetchWidgetView;

export async function respondWidget(input: {
  session: PenSession;
  ownerPnIdentifier: string;
  widgetId: string;
  respondKind: 'vote' | 'widget_row';
  responseId: string;
  optionId?: string;
  writeIn?: string;
  row?: Record<string, unknown>;
}): Promise<{ view: WidgetViewPayload; counts?: PollCounts }> {
  const res = await apiFetch(
    'POST',
    '/api/pen/widgets/respond',
    {
      userPnIdentifier: input.session.pnIdentifier,
      ownerPnIdentifier: input.ownerPnIdentifier,
      widgetId: input.widgetId,
      responseId: input.responseId,
      respondKind: input.respondKind,
      ...(input.optionId ? { optionId: input.optionId } : {}),
      ...(input.writeIn ? { writeIn: input.writeIn } : {}),
      ...(input.row ? { row: input.row } : {})
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
  const data = await readJson(res);
  return {
    view: data.view as WidgetViewPayload,
    counts: data.counts as PollCounts | undefined
  };
}

/** @deprecated use respondWidget */
export async function castPollVote(input: {
  session: PenSession;
  ownerPnIdentifier: string;
  docId: string;
  spreadsheetId: string;
  optionId: string;
  writeIn?: string;
  widgetId?: string;
  groupId?: string;
}): Promise<{ enqueued: boolean; counts: PollCounts }> {
  const widgetId =
    input.widgetId ||
    (input.groupId ? encodeWidgetId(input.docId, input.groupId) : '');
  if (!widgetId) throw new Error('widget_id_required');
  const voteId = crypto.randomUUID();
  const result = await respondWidget({
    session: input.session,
    ownerPnIdentifier: input.ownerPnIdentifier,
    widgetId,
    respondKind: 'vote',
    responseId: voteId,
    optionId: input.optionId,
    writeIn: input.writeIn
  });
  const counts = result.counts || { total: 0, byOption: {} };
  return { enqueued: true, counts };
}
