/**
 * L5 community feed viewport — first-party browse origin embed filtered to one OAuth client_id.
 * Integrators iframe this page; they do not call engagement/connections REST with their Bearer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PN_FEED_EMBED_HANDSHAKE,
  PN_FEED_EMBED_READY,
  type FeedEmbedPostMessage
} from '@par-noir/oauth-ui';
import { LockButtonWithContext } from '../components/LockButtonWithContext';
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
      const [media, thoughts, collections] = await Promise.all([
        service.loadContentTypeIndex('media', { indexerId: clientId, limit: 40, offset: 0 }, true),
        service.loadContentTypeIndex('thoughts', { indexerId: clientId, limit: 40, offset: 0 }, true),
        service.loadContentTypeIndex('collections', { indexerId: clientId, limit: 40, offset: 0 }, true)
      ]);
      const merged = [...media.files, ...thoughts.files, ...collections.files];
      const seen = new Set<string>();
      setFiles(
        merged.filter((f) => {
          const id = f.metadata.fileId;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
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
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {!clientId && (
          <p className="text-sm text-red-400">Add <code className="text-xs">?client_id=your-oauth-client</code> to the embed URL.</p>
        )}
        {clientId && !userState.isUnlocked && (
          <p className="text-sm text-neutral-400">
            Unlock your pN (padlock) to engage with this community feed ({feedLabel}). Public posts may still load below.
          </p>
        )}
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && files.length === 0 && clientId && (
          <p className="text-sm text-neutral-500">No public posts indexed for this community yet.</p>
        )}
        {files.map((file) => {
          const name = file.metadata.name || file.metadata.title || file.metadata.fileId;
          const desc = file.metadata.description;
          return (
            <article
              key={file.metadata.fileId}
              className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-3"
            >
              <h3 className="text-sm font-medium text-white truncate">{name}</h3>
              {desc ? <p className="mt-1 text-xs text-neutral-400 line-clamp-3">{desc}</p> : null}
              <p className="mt-2 text-[10px] text-neutral-500 font-mono truncate">{file.metadata.fileId}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
