import { buildCorrespondenceHandoffHash, type PenActionEffect } from '@par-noir/pen-protocol';
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
}): Promise<void> {
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
      if (!userPnIdentifier || !effect.spreadsheetId || !penDocId || !creatorPnIdentifier) return;
      await ownerFetch(
        'POST',
        '/api/pen/polls/vote',
        {
          userPnIdentifier,
          ownerPnIdentifier: creatorPnIdentifier,
          pollId: effect.spreadsheetId,
          optionId: effect.optionId,
          voteId: crypto.randomUUID(),
          docId: penDocId,
          createdAt: new Date().toISOString()
        },
        { pnIdentifier: userPnIdentifier }
      );
      return;
    }
    case 'widget_row': {
      if (!userPnIdentifier || !effect.spreadsheetId || !penDocId || !creatorPnIdentifier) return;
      await ownerFetch(
        'POST',
        '/api/pen/widgets/action',
        {
          userPnIdentifier,
          ownerPnIdentifier: creatorPnIdentifier,
          spreadsheetId: effect.spreadsheetId,
          docId: penDocId,
          row: effect.row
        },
        { pnIdentifier: userPnIdentifier }
      );
      return;
    }
    default:
      return;
  }
}
