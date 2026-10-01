/**
 * Locator for a sealed preview. Opens only when this pN can unwrap the doc key.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedTileSurface } from '@par-noir/feed-tile';
import type { PenActionMessage, PenPageLayer } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { hydrateDocFromCloud } from '../services/penHydrate';
import { loadDocKey } from '../services/penDocCrypto';
import { loadLocalDoc, type LocalDocBundle } from '../services/penLocalStore';
import { bundleToFeedTileModel } from '../services/feedTileFromPen';
import { castPollVote } from '../services/pollCloud';

export function DocPreviewPage({
  session,
  docId
}: {
  session: PenSession;
  docId: string;
}) {
  const [bundle, setBundle] = useState<LocalDocBundle | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [status, setStatus] = useState('Opening preview…');

  useEffect(() => {
    let cancel = false;
    void (async () => {
      const local = loadLocalDoc(session.pnIdentifier, docId);
      const hydrated = await hydrateDocFromCloud({ session, docId }).catch(() => local);
      if (cancel) return;
      const doc = hydrated || local;
      if (!doc || !loadDocKey(docId)) {
        setBundle(null);
        setBlocked(true);
        return;
      }
      setBlocked(false);
      setBundle(doc);
      setStatus('');
    })();
    return () => {
      cancel = true;
    };
  }, [docId, session]);

  async function onAction(message: PenActionMessage) {
    if (!bundle || message.behavior !== 'poll.vote') return;
    let layer: PenPageLayer | undefined;
    let groupId: string | undefined;
    for (const section of bundle.sections) {
      const found = (section.layers || []).find((item) => item.id === message.layerId);
      if (found) {
        layer = found;
        groupId = found.parentGroupId || undefined;
        break;
      }
    }
    if (!layer) return;
    const group = groupId
      ? bundle.sections
          .flatMap((section) => section.layers || [])
          .find((item) => item.id === groupId)
      : undefined;
    const spreadsheetId = group?.spreadsheetId || bundle.manifest.pollSpreadsheetId;
    if (!spreadsheetId) {
      setStatus('Save the poll before voting.');
      return;
    }
    try {
      await castPollVote({
        session,
        ownerPnIdentifier: session.pnIdentifier,
        docId,
        spreadsheetId,
        optionId: layer.bindRowId || message.bindRowId || layer.id
      });
      setStatus('Vote counted.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'vote_failed');
    }
  }

  if (blocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-neutral-300">
        <p className="text-sm">This preview is sealed to another pN.</p>
        <Link to="/" className="text-xs text-white underline">
          Library
        </Link>
      </div>
    );
  }

  if (!bundle) {
    return (
      <div className="flex h-full items-center justify-center bg-neutral-950 text-sm text-neutral-400">
        {status}
      </div>
    );
  }

  const model = bundleToFeedTileModel({
    title: bundle.manifest.title || 'Untitled',
    sections: bundle.sections,
    pagePresentation: bundle.manifest.pagePresentation,
    contentClass: bundle.manifest.docType,
    pageSwipeAxis: bundle.manifest.pageSwipeAxis,
    pageView: bundle.manifest.pageView
  });

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
        <span>{bundle.manifest.title || 'Preview'}</span>
        <Link to={`/d/${docId}`} className="text-white underline">
          Open in Pen
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <FeedTileSurface model={model} mode="live" onAction={(message) => void onAction(message)} />
      </div>
      {status ? <p className="px-4 pb-4 text-center text-xs text-neutral-400">{status}</p> : null}
    </div>
  );
}
