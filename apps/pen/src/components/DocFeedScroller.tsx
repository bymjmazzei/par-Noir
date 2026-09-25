/**
 * My Library feed — personal docs with the same Social rail + slide chrome as Templates.
 * Live engagement when manifest.publishedFileId is set; otherwise aside is display-only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { PenSession } from '../services/penSession';
import { loadLocalDoc, type LocalDocSummary } from '../services/penLocalStore';
import {
  buildSocialTemplateRailItems,
  libraryDocMatchesRailSelection,
  resolveSummaryClassId
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';
import { SnapFeedShell } from './SnapFeedShell';
import { PenFeedSlideStage } from './PenFeedSlideStage';

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
  const railItems = useMemo(() => buildSocialTemplateRailItems(), []);

  const filtered = useMemo(() => {
    return docs.filter((d) =>
      libraryDocMatchesRailSelection(resolveSummaryClassId(d), activeClassId)
    );
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
      slideKeys={filtered.map((d) => d.docId)}
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

  return (
    <PenFeedSlideStage
      classId={classId || bundle.manifest.classId}
      manifest={bundle.manifest}
      sections={bundle.sections}
      session={session}
      templateId={
        bundle.manifest.templateId ||
        bundle.manifest.basedOnTemplateId ||
        bundle.manifest.docId
      }
      fileId={bundle.manifest.publishedFileId || null}
      authorLabel="You"
      onOpen={onOpen}
    />
  );
}
