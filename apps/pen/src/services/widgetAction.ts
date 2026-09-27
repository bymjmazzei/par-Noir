/** Queue a non-vote widget trigger. This path does not cast a poll vote. */

import { ensureMailboxRouteKey } from '@par-noir/device-cloud-credentials';
import { PEN_WIDGET_ACTION_KIND, type WidgetActionRow } from '@par-noir/pen-protocol';
import { API_ENDPOINT } from '../config/api';
import { ownerFetch } from './penOwnerFetch';
import { queuePenOutbox, sealSessionFromPen } from './penCollab';
import type { PenSession } from './penSession';

export async function queueWidgetAction(input: {
  session: PenSession;
  docId: string;
  spreadsheetId: string;
  row: WidgetActionRow;
}): Promise<void> {
  const seal = sealSessionFromPen(input.session);
  let routeKey = '';
  if (seal) {
    try {
      routeKey = await ensureMailboxRouteKey(input.session.pnIdentifier, seal, {
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
    kind: PEN_WIDGET_ACTION_KIND,
    outboxId: input.row.actionId,
    payload: {
      requestId: input.row.actionId,
      docId: input.docId,
      ...input.row
    },
    peerRouteKeys: routeKey ? [routeKey] : [],
    ownCloudApplied: true
  });
  await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: input.session.pnIdentifier,
      jobType: PEN_WIDGET_ACTION_KIND,
      docId: input.docId,
      trigger: input.row.trigger,
      actionId: input.row.actionId,
      actorId: input.row.actorId,
      spreadsheetId: input.spreadsheetId,
      createdAt: input.row.createdAt,
      fields: input.row.fields,
      present: input.row.present,
      headers: input.row.headers,
      cells: input.row.cells,
      order: input.row.order,
      split: input.row.split
    },
    { pnIdentifier: input.session.pnIdentifier }
  );
}
