/**
 * My Library feed — personal docs only (galleryPreviewRef via cloud/local).
 * Never uses CDN / public-media.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PenSession } from '../services/penSession';
import {
  loadLocalDoc,
  type LocalDocSummary
} from '../services/penLocalStore';
import {
  buildClassFeedRailItems,
  resolveSummaryClassId
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';
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
    <div className="pen-doc-feed">
      <div className="pen-doc-feed-rail-sticky">
        <ClassFeedRail
          items={railItems}
          activeId={activeClassId}
          onSelect={onActiveClassId}
        />
      </div>
      <div className="pen-doc-feed-scroll">
        {filtered.length === 0 ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">No documents in this class.</p>
          </div>
        ) : (
          filtered.map((d) => (
            <DocFeedSlide
              key={d.docId}
              pn={pn}
              docId={d.docId}
              session={session}
              onOpen={() => onOpenDoc(d.docId)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DocFeedSlide({
  pn,
  docId,
  session,
  onOpen
}: {
  pn: string;
  docId: string;
  session: PenSession;
  onOpen: () => void;
}) {
  const [bundle, setBundle] = useState(() => loadLocalDoc(pn, docId));

  useEffect(() => {
    setBundle(loadLocalDoc(pn, docId));
  }, [pn, docId]);

  if (!bundle) {
    return (
      <div className="pen-doc-feed-slide">
        <div className="pen-doc-feed-empty">
          <p className="text-sm text-neutral-500">Document unavailable.</p>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="pen-doc-feed-slide" onClick={onOpen}>
      <BrowseFeedTilePreview
        manifest={bundle.manifest}
        sections={bundle.sections}
        bare
        session={session}
      />
    </button>
  );
}
