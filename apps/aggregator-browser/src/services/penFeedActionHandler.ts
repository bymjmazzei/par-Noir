import type { PenActionMessage, PenFeedPagePayload } from '@par-noir/pen-protocol';
import type { FeedTileViewModel } from '@par-noir/feed-tile';
import { ownerFetch } from './ownerApiFetch';

function spreadsheetIdForLayer(
  penFeedPage: PenFeedPagePayload | undefined,
  layerId: string
): string | undefined {
  if (!penFeedPage) return undefined;
  const layer = penFeedPage.actionSection.layers.find((item) => item.id === layerId);
  if (!layer) return undefined;
  const own = layer.spreadsheetId?.trim();
  if (own) return own;
  if (!layer.parentGroupId) return undefined;
  const group = penFeedPage.actionSection.layers.find((item) => item.id === layer.parentGroupId);
  return group?.spreadsheetId?.trim() || undefined;
}

function penFeedPageForAction(
  model: FeedTileViewModel,
  layerId: string
): PenFeedPagePayload | undefined {
  for (const page of model.pages) {
    if (!page.penFeedPage) continue;
    if (page.penFeedPage.actionSection.layers.some((layer) => layer.id === layerId)) {
      return page.penFeedPage;
    }
  }
  return model.pages[0]?.penFeedPage;
}

/** Handle interactive overlay presses on published Pen feed tiles. */
export async function handleFeedPenAction(input: {
  message: PenActionMessage;
  model: FeedTileViewModel;
  penDocId?: string;
  creatorPnIdentifier?: string;
  userPnIdentifier: string;
}): Promise<void> {
  const { message, model, penDocId, creatorPnIdentifier, userPnIdentifier } = input;
  if (!message.behavior) return;
  if (message.behavior === 'link.open' && message.bindRowId) {
    const url = message.bindRowId.trim();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  if (message.behavior !== 'poll.vote') return;
  const penFeedPage = penFeedPageForAction(model, message.layerId);
  const spreadsheetId = spreadsheetIdForLayer(penFeedPage, message.layerId);
  if (!spreadsheetId || !penDocId || !creatorPnIdentifier) return;
  const optionId = message.bindRowId?.trim() || message.layerId;
  const voteId = crypto.randomUUID();
  await ownerFetch(
    'POST',
    '/api/pen/polls/vote',
    {
      userPnIdentifier,
      ownerPnIdentifier: creatorPnIdentifier,
      pollId: spreadsheetId,
      optionId,
      voteId,
      docId: penDocId,
      createdAt: new Date().toISOString()
    },
    { pnIdentifier: userPnIdentifier }
  );
}
