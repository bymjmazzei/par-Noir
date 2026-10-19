import { saveIcsFile } from '@par-noir/feed-tile';
import {
  buildCorrespondenceHandoffHash,
  type PenActionEffect,
  type PenActionTrack,
  type WidgetViewPayload
} from '@par-noir/pen-protocol';
import { ownerFetch } from './ownerApiFetch';

const DEFAULT_MESSAGING_ORIGIN = 'https://messaging.parnoir.com';

function messagingOrigin(): string {
  const env = import.meta.env as ImportMetaEnv & { VITE_MESSAGING_ORIGIN?: string };
  return (env.VITE_MESSAGING_ORIGIN || DEFAULT_MESSAGING_ORIGIN).replace(/\/$/, '');
}

/**
 * Run the side effect of a press on a published Pen feed tile.
 * Open / email / Messaging need no unlock. Vote and sheet rows need the viewer's pn.
 */
export async function runFeedPenEffect(input: {
  effect: PenActionEffect;
  penDocId?: string;
  creatorPnIdentifier?: string;
  userPnIdentifier?: string;
}): Promise<WidgetViewPayload | void> {
  const { effect, penDocId, creatorPnIdentifier, userPnIdentifier } = input;
  switch (effect.kind) {
    case 'open':
      window.open(effect.url, '_blank', 'noopener,noreferrer');
      return;
    case 'mailto':
      window.location.assign(effect.href);
      return;
    case 'messaging': {
      const hash = buildCorrespondenceHandoffHash({
        title: effect.title,
        body: effect.body,
        ...(penDocId ? { docId: penDocId } : {})
      });
      window.open(`${messagingOrigin()}/${hash}`, '_blank', 'noopener,noreferrer');
      return;
    }
    case 'vote': {
      if (!userPnIdentifier || !effect.widgetId || !penDocId || !creatorPnIdentifier) return;
      const responseId = crypto.randomUUID();
      const res = await ownerFetch(
        'POST',
        '/api/pen/widgets/respond',
        {
          userPnIdentifier,
          ownerPnIdentifier: creatorPnIdentifier,
          widgetId: effect.widgetId,
          responseId,
          respondKind: 'vote',
          optionId: effect.optionId,
          ...(effect.writeIn ? { writeIn: effect.writeIn } : {})
        },
        { pnIdentifier: userPnIdentifier }
      );
      const data = (await res.json().catch(() => ({}))) as { view?: WidgetViewPayload };
      return data.view;
    }
    case 'calendar':
      saveIcsFile(effect);
      return;
    case 'widget_row': {
      if (!userPnIdentifier || !effect.widgetId || !penDocId || !creatorPnIdentifier) return;
      const responseId = effect.row.actionId || crypto.randomUUID();
      const res = await ownerFetch(
        'POST',
        '/api/pen/widgets/respond',
        {
          userPnIdentifier,
          ownerPnIdentifier: creatorPnIdentifier,
          widgetId: effect.widgetId,
          responseId,
          respondKind: 'widget_row',
          row: effect.row
        },
        { pnIdentifier: userPnIdentifier }
      );
      const data = (await res.json().catch(() => ({}))) as { view?: WidgetViewPayload };
      return data.view;
    }
    default:
      return;
  }
}

/** Log a button tap to the creator's Taps sheet. Locked viewers count too, as `anonymous`. */
export async function sendPenTap(input: {
  track: PenActionTrack;
  creatorPnIdentifier?: string;
  userPnIdentifier?: string;
}): Promise<void> {
  const { track, creatorPnIdentifier, userPnIdentifier } = input;
  if (!track.widgetId || !creatorPnIdentifier) return;
  await ownerFetch(
    'POST',
    '/api/pen/widgets/tap',
    {
      ...(userPnIdentifier ? { userPnIdentifier } : {}),
      ownerPnIdentifier: creatorPnIdentifier,
      widgetId: track.widgetId,
      row: track.row
    },
    userPnIdentifier ? { pnIdentifier: userPnIdentifier } : undefined
  ).catch(() => undefined);
}

export async function fetchPenWidgetView(input: {
  widgetId: string;
  userPnIdentifier?: string;
}): Promise<WidgetViewPayload | null> {
  const q = input.userPnIdentifier
    ? `?userPnIdentifier=${encodeURIComponent(input.userPnIdentifier)}`
    : '';
  const res = await ownerFetch(
    'GET',
    `/api/pen/widgets/${encodeURIComponent(input.widgetId)}/view${q}`,
    undefined,
    input.userPnIdentifier ? { pnIdentifier: input.userPnIdentifier } : undefined
  );
  if (!res.ok) return null;
  return (await res.json()) as WidgetViewPayload;
}
