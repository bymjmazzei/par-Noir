/** One public Pen post as it plays in the feed, for iframes on other sites. */

import { useCallback, useState } from 'react';
import { FeedMuteButton } from '@par-noir/feed-tile';
import type { PenActionEffect } from '@par-noir/pen-protocol';
import { useUserState } from '../contexts/UserStateContext';
import { useEmbedPost } from '../hooks/useEmbedPost';
import { embedEffectNeedsSignIn, openPostInNewTab } from '../utils/embedActions';
import { browseBaseUrl } from '../utils/embedPost';
import { getCreatorIdentifier } from '../utils/contentClass';
import { postShareUrl } from '../utils/postLink';
import { PenFeedTilePlayer } from './PenFeedTilePlayer';

export function EmbedPostTile({
  fileId,
  creator,
  active = true
}: {
  fileId: string;
  creator?: string;
  /** On screen. Off-screen tiles in a feed embed stay paused. */
  active?: boolean;
}) {
  const state = useEmbedPost(fileId, creator);
  const { userState } = useUserState();
  const signedIn = Boolean(userState.isUnlocked && userState.pnIdentifier);
  const [muted, setMuted] = useState(true);
  const file = state.status === 'ready' ? state.file : null;
  const postUrl = file ? postShareUrl(file, browseBaseUrl()) : '';

  const interceptEffect = useCallback(
    (effect: PenActionEffect) => {
      if (!postUrl || !embedEffectNeedsSignIn(effect, signedIn)) return false;
      openPostInNewTab(postUrl);
      return true;
    },
    [postUrl, signedIn]
  );

  if (state.status === 'loading') {
    return <div className="h-full w-full bg-black" data-pn-embed-post="loading" />;
  }
  if (state.status === 'refused') {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-neutral-900 p-6 text-center text-sm text-neutral-400"
        data-pn-embed-post="refused"
      >
        This post can&apos;t be embedded.
      </div>
    );
  }

  const creatorId = creator || getCreatorIdentifier(state.file) || undefined;
  return (
    <div className="relative h-full w-full overflow-hidden bg-black" data-pn-embed-post={fileId}>
      <PenFeedTilePlayer
        model={state.model}
        aspectRatio={state.aspect}
        penDocId={state.model.penDocId}
        creatorPnIdentifier={creatorId}
        userPnIdentifier={signedIn ? userState.pnIdentifier : undefined}
        playback={{ active, paused: false, muted }}
        interceptEffect={interceptEffect}
        onPressBlocked={() => openPostInNewTab(postUrl)}
      />
      <FeedMuteButton muted={muted} onToggle={() => setMuted((m) => !m)} />
      <a
        href={postUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute left-2 top-2 z-30 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-black/80"
      >
        View on par Noir
      </a>
    </div>
  );
}
