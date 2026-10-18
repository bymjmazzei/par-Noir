/**
 * Locator for a sealed preview. Opens only when this pN can unwrap the doc key.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedTileSurface } from '@par-noir/feed-tile';
import type { PenActionEffect } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { openMessagingWithCorrespondence } from '../services/penCorrespondenceHandoff';
import { queueWidgetAction } from '../services/widgetAction';
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

  async function onEffect(effect: PenActionEffect) {
    if (!bundle) return;
    if (effect.kind === 'open') {
      window.open(effect.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (effect.kind === 'mailto') {
      window.location.assign(effect.href);
      return;
    }
    if (effect.kind === 'messaging') {
      openMessagingWithCorrespondence({ title: effect.title, body: effect.body, docId });
      return;
    }
    if (effect.kind !== 'vote' && effect.kind !== 'widget_row') return;
    const spreadsheetId = effect.spreadsheetId || bundle.manifest.pollSpreadsheetId;
    if (!spreadsheetId) {
      setStatus('Save the widget before testing it.');
      return;
    }
    try {
      if (effect.kind === 'vote') {
        await castPollVote({
          session,
          ownerPnIdentifier: session.pnIdentifier,
          docId,
          spreadsheetId,
          optionId: effect.optionId,
          writeIn: effect.writeIn
        });
        setStatus('Vote counted.');
        return;
      }
      await queueWidgetAction({ session, docId, spreadsheetId, row: effect.row });
      setStatus('Recorded.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'widget_action_failed');
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
        <FeedTileSurface
          model={model}
          mode="live"
          actorId={session.pnIdentifier}
          onEffect={(effect) => void onEffect(effect)}
        />
      </div>
      {status ? <p className="px-4 pb-4 text-center text-xs text-neutral-400">{status}</p> : null}
    </div>
  );
}
