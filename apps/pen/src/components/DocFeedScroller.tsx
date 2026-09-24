/**
 * My Library feed — personal docs only (galleryPreviewRef via cloud/local).
 * Never uses CDN / public-media / live engagement.
 */

import { useEffect, useMemo, useState } from 'react';
import { categoryIdForClass } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { loadLocalDoc, type LocalDocSummary } from '../services/penLocalStore';
import {
  buildClassFeedRailItems,
  resolveSummaryClassId
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';
import { SnapFeedShell } from './SnapFeedShell';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';

export function DocFeedScroller({
  pn,
  docs,
  session,
  onOpenDoc,
  activeClassId,
  onActiveClassId
}: {
  pn: string;
  docs: LocalDocSummary[];
  session: PenSession;
  onOpenDoc: (docId: string) => void;
  activeClassId: string;
  onActiveClassId: (id: string) => void;
}) {
  const railItems = useMemo(() => {
    const ids = docs
      .map((d) => resolveSummaryClassId(d))
      .filter((id): id is string => Boolean(id));
    return buildClassFeedRailItems(ids);
  }, [docs]);

  const filtered = useMemo(() => {
    if (activeClassId === 'all') return docs;
    return docs.filter((d) => resolveSummaryClassId(d) === activeClassId);
  }, [docs, activeClassId]);

  useEffect(() => {
    if (activeClassId === 'all') return;
    if (!railItems.some((i) => i.id === activeClassId)) {
      onActiveClassId('all');
    }
  }, [railItems, activeClassId, onActiveClassId]);

  return (
    <SnapFeedShell
      rail={
        <ClassFeedRail
          items={railItems}
          activeId={activeClassId}
          onSelect={onActiveClassId}
        />
      }
      count={filtered.length}
      empty={
        <div className="pen-doc-feed-empty">
          <p className="text-sm text-neutral-500">No documents in this class.</p>
        </div>
      }
      renderSlide={(index) => {
        const d = filtered[index];
        if (!d) return null;
        return (
          <DocFeedSlide
            pn={pn}
            docId={d.docId}
            classId={resolveSummaryClassId(d)}
            session={session}
            onOpen={() => onOpenDoc(d.docId)}
          />
        );
      }}
    />
  );
}

function DocFeedSlide({
  pn,
  docId,
  classId,
  session,
  onOpen
}: {
  pn: string;
  docId: string;
  classId?: string;
  session: PenSession;
  onOpen: () => void;
}) {
  const [bundle, setBundle] = useState(() => loadLocalDoc(pn, docId));

  useEffect(() => {
    setBundle(loadLocalDoc(pn, docId));
  }, [pn, docId]);

  if (!bundle) {
    return (
      <div className="pen-doc-feed-empty">
        <p className="text-sm text-neutral-500">Document unavailable.</p>
      </div>
    );
  }

  const social = categoryIdForClass(classId || bundle.manifest.classId || '') === 'social';
  const tile = (
    <BrowseFeedTilePreview
      manifest={bundle.manifest}
      sections={bundle.sections}
      bare
      compact
      session={session}
    />
  );

  return (
    <div className="pen-doc-feed-slide-stage">
      <button type="button" className="pen-doc-feed-slide-hit" onClick={onOpen}>
        {social ? (
          <SocialPhoneFrame large>{tile}</SocialPhoneFrame>
        ) : (
          <div className="pen-feed-tile-slot">{tile}</div>
        )}
      </button>
    </div>
  );
}
