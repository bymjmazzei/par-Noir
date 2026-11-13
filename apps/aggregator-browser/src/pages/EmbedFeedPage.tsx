/**
 * L5 community feed viewport — first-party browse origin embed filtered to one OAuth client_id.
 * Integrators iframe this page; they do not call engagement/connections REST with their Bearer.
 * Each post plays as it does in the feed (see EmbedPostTile).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPenFeedPlaybackMetadata } from '@par-noir/feed-tile';
import {
  PN_FEED_EMBED_HANDSHAKE,
  PN_FEED_EMBED_READY,
  type FeedEmbedPostMessage
} from '@par-noir/oauth-ui';
import { EmbedPostTile } from '../components/EmbedPostTile';
import { LockButtonWithContext } from '../components/LockButtonWithContext';
import { getCreatorIdentifier } from '../utils/contentClass';
import { useUserState } from '../contexts/UserStateContext';
import { ContentTypeIndexService } from '../services/contentTypeIndexService';
import type { IndexedFile } from '../types/aggregator';
import { COMMUNITY_FEED_PREFIX } from '../utils/communityFeed';

function readEmbedClientId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('client_id') || '').trim();
  } catch {
    return '';
  }
}

function postToParent(msg: FeedEmbedPostMessage) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  } catch {
    /* ignore */
  }
}

export function EmbedFeedPage({ onLockUnlock }: { onLockUnlock: () => void }) {
  const clientId = useMemo(() => readEmbedClientId(), []);
  const { userState } = useUserState();
  const [files, setFiles] = useState<IndexedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    postToParent({ v: 1, type: PN_FEED_EMBED_HANDSHAKE, clientId });
    postToParent({ v: 1, type: PN_FEED_EMBED_READY, clientId });
  }, [clientId]);

  const load = useCallback(async () => {
    if (!clientId) {
      setError('Missing client_id query parameter.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const service = new ContentTypeIndexService();
      const [media, notes, collections] = await Promise.all([
        service.loadContentTypeIndex('media', { indexerId: clientId, limit: 40, offset: 0 }, true),
        service.loadContentTypeIndex('notes', { indexerId: clientId, limit: 40, offset: 0 }, true),
        service.loadContentTypeIndex('collections', { indexerId: clientId, limit: 40, offset: 0 }, true)
      ]);
      const merged = [...media.files, ...notes.files, ...collections.files];
      const seen = new Set<string>();
      setFiles(
        merged.filter((f) => {
          const id = f.metadata.fileId;
          if (seen.has(id)) return false;
          seen.add(id);
          return isPenFeedPlaybackMetadata(f.metadata as unknown as Record<string, unknown>);
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load community feed');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const feedLabel = `${COMMUNITY_FEED_PREFIX}${clientId || 'unknown'}`;

  return (
    <div className="h-screen w-full bg-neutral-900 flex flex-col" data-pn-embed-feed={clientId || undefined}>
      <div className="px-3 py-2 border-b border-neutral-700 flex items-center justify-between gap-2">
        <div className="text-xs text-neutral-400 truncate">
          Community feed · {clientId || 'missing client_id'}
        </div>
        <LockButtonWithContext onLockUnlock={onLockUnlock} currentContext={null} availableContexts={[]} />
      </div>
      {(!clientId || !userState.isUnlocked || loading || error || files.length === 0) && (
        <div className="px-3 py-2 space-y-1">
          {!clientId && (
            <p className="text-sm text-red-400">Add <code className="text-xs">?client_id=your-oauth-client</code> to the embed URL.</p>
          )}
          {clientId && !userState.isUnlocked && (
            <p className="text-xs text-neutral-400">
              Posts play here. Voting and other signed actions open on par Noir ({feedLabel}).
            </p>
          )}
          {loading && <p className="text-sm text-neutral-500">Loading…</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!loading && !error && files.length === 0 && clientId && (
            <p className="text-sm text-neutral-500">No public posts indexed for this community yet.</p>
          )}
        </div>
      )}
      <EmbedFeedScroller files={files} />
    </div>
  );
}

/** One post per screen; only the post on screen plays, and only it and its neighbors load media. */
function EmbedFeedScroller({ files }: { files: IndexedFile[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
          const index = Number((entry.target as HTMLElement).dataset.embedIndex);
          if (Number.isFinite(index)) setActiveIndex(index);
        }
      },
      { root, threshold: [0.6] }
    );
    root.querySelectorAll('[data-embed-index]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [files]);

  return (
    <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory">
      {files.map((file, index) => (
        <section
          key={file.metadata.fileId}
          data-embed-index={index}
          className="h-full w-full snap-start snap-always"
        >
          {Math.abs(index - activeIndex) <= 1 ? (
            <EmbedPostTile
              fileId={file.metadata.fileId}
              creator={getCreatorIdentifier(file) || undefined}
              active={index === activeIndex}
            />
          ) : (
            <div className="h-full w-full bg-black" />
          )}
        </section>
      ))}
    </div>
  );
}
