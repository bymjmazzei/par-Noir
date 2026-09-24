/**
 * Templates feed — public pen-templates from central index (CDN + engagement)
 * plus platform starters not yet published (IR preview, no engagement).
 */

import { useEffect, useMemo, useState } from 'react';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';
import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';
import { categoryIdForClass, getClass } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { fetchPublicPenTemplates } from '../services/penCentralIndex';
import { resolvePublicMediaSignedUrl } from '../services/penPublicFeedMedia';
import {
  buildClassFeedRailItems,
  contentClassFallbackLabel
} from '../services/classFeedRailItems';
import { listConsumerStarterTemplates } from '../services/penPlatformTemplates';
import { ClassFeedRail } from './ClassFeedRail';
import { SnapFeedShell } from './SnapFeedShell';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { TemplateEngagementRail } from './TemplateEngagementRail';
import { BrowseFeedTilePreview } from './BrowseFeedTilePreview';
import { templatePreviewBundle } from './TemplateGalleryThumb';

export type PublicTemplateFeedSelect =
  | { kind: 'cdn'; entry: CentralIndexEntry }
  | { kind: 'platform'; templateId: string };

type FeedItem =
  | { kind: 'cdn'; entry: CentralIndexEntry; classId: string }
  | { kind: 'platform'; templateId: string; classId: string };

function entryClassId(entry: CentralIndexEntry): string {
  const meta = entry.metadata as {
    penClassId?: string;
    contentClass?: string;
  };
  if (meta.penClassId && getClass(meta.penClassId)?.parentId) {
    return meta.penClassId;
  }
  return `cc:${meta.contentClass || 'other'}`;
}

function entryRailLabel(classKey: string): string {
  if (classKey.startsWith('cc:')) {
    return contentClassFallbackLabel(classKey.slice(3));
  }
  const form = getClass(classKey);
  return (form?.title || classKey).toUpperCase();
}

function entryIsSocial(entry: CentralIndexEntry): boolean {
  const meta = entry.metadata as { penClassId?: string; contentClass?: string };
  if (meta.penClassId && categoryIdForClass(meta.penClassId) === 'social') return true;
  return (
    meta.contentClass === 'note' ||
    meta.contentClass === 'media' ||
    meta.contentClass === 'collection'
  );
}

function mergeFeedItems(entries: CentralIndexEntry[]): FeedItem[] {
  const covered = new Set<string>();
  for (const e of entries) {
    const based = (e.metadata as { basedOnTemplateId?: string } | undefined)?.basedOnTemplateId;
    if (based) covered.add(based);
  }
  const cdn: FeedItem[] = entries.map((entry) => ({
    kind: 'cdn',
    entry,
    classId: entryClassId(entry)
  }));
  const platform: FeedItem[] = listConsumerStarterTemplates()
    .filter((t) => !covered.has(t.id))
    .map((t) => ({ kind: 'platform', templateId: t.id, classId: t.classId }));
  return [...platform, ...cdn];
}

export function TemplatesCdnFeedScroller({
  session,
  activeClassId,
  onActiveClassId,
  onSelect
}: {
  session: PenSession | null;
  activeClassId: string;
  onActiveClassId: (id: string) => void;
  onSelect: (sel: PublicTemplateFeedSelect) => void;
}) {
  const [entries, setEntries] = useState<CentralIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPublicPenTemplates({ limit: 100 })
      .then((files) => {
        if (!cancelled) {
          setEntries(files);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load templates');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => mergeFeedItems(entries), [entries]);

  const railItems = useMemo(() => {
    const formIds = new Set<string>();
    const fallbackKeys = new Set<string>();
    for (const item of items) {
      const key = item.classId;
      if (key.startsWith('cc:')) fallbackKeys.add(key);
      else formIds.add(key);
    }
    const fromForms = buildClassFeedRailItems(formIds);
    const extras = [...fallbackKeys]
      .map((id) => ({ id, label: entryRailLabel(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [...fromForms, ...extras];
  }, [items]);

  const filtered = useMemo(() => {
    if (activeClassId === 'all') return items;
    return items.filter((i) => i.classId === activeClassId);
  }, [items, activeClassId]);

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
      count={loading ? 0 : filtered.length}
      loading={
        loading ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">Loading public templates…</p>
          </div>
        ) : undefined
      }
      empty={
        error && filtered.length === 0 ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">No public templates in this class.</p>
          </div>
        )
      }
      renderSlide={(index) => {
        const item = filtered[index];
        if (!item) return null;
        if (item.kind === 'platform') {
          return (
            <PlatformTemplateSlide
              templateId={item.templateId}
              session={session}
              onOpen={() => onSelect({ kind: 'platform', templateId: item.templateId })}
            />
          );
        }
        return (
          <CdnTemplateSlide
            entry={item.entry}
            session={session}
            onOpen={() => onSelect({ kind: 'cdn', entry: item.entry })}
          />
        );
      }}
    />
  );
}

function PlatformTemplateSlide({
  templateId,
  session,
  onOpen
}: {
  templateId: string;
  session: PenSession | null;
  onOpen: () => void;
}) {
  const preview = templatePreviewBundle(undefined, templateId);
  if (!preview) {
    return (
      <div className="pen-doc-feed-empty">
        <p className="text-sm text-neutral-500">Template unavailable.</p>
      </div>
    );
  }
  const social = categoryIdForClass(preview.manifest.classId || '') === 'social';
  const tile = (
    <BrowseFeedTilePreview
      manifest={preview.manifest}
      sections={preview.sections}
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
      {/* No engagement — platform IR has no IndexedFile fileId until published */}
    </div>
  );
}

function CdnTemplateSlide({
  entry,
  session,
  onOpen
}: {
  entry: CentralIndexEntry;
  session: PenSession | null;
  onOpen: () => void;
}) {
  const meta = entry.metadata as {
    title?: string;
    name?: string;
    description?: string;
    contentClass?: string;
    fileType?: string;
    penClassId?: string;
  };
  const title = meta.title || meta.name || 'Template';
  const social = entryIsSocial(entry);
  const [model, setModel] = useState<FeedTileViewModel>(() => ({
    title,
    caption: meta.description || title,
    fileId: entry.fileId,
    contentClass: String(meta.contentClass || 'note'),
    pages: [
      {
        title,
        backgroundColor: '#000000',
        textColor: '#FFFFFF'
      }
    ]
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const isVideo =
          String(meta.fileType || '').toLowerCase().includes('video') ||
          meta.contentClass === 'media';
        const poster = await resolvePublicMediaSignedUrl(
          entry.fileId,
          'poster',
          session?.accessToken
        ).catch(() => null);
        let mediaSrc = poster || undefined;
        let mediaKind: 'image' | 'video' = 'image';
        if (isVideo) {
          const sd = await resolvePublicMediaSignedUrl(
            entry.fileId,
            'sd',
            session?.accessToken
          ).catch(() => null);
          if (sd) {
            mediaSrc = sd;
            mediaKind = 'video';
          }
        }
        if (cancelled) return;
        setModel({
          title,
          caption: meta.description || title,
          fileId: entry.fileId,
          posterUrl: poster || undefined,
          contentClass: String(meta.contentClass || 'note'),
          pages: [
            {
              title,
              mediaSrc,
              mediaKind,
              backgroundColor: '#000000',
              textColor: '#FFFFFF'
            }
          ]
        });
      } catch {
        /* keep empty tile */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    entry.fileId,
    session?.accessToken,
    title,
    meta.contentClass,
    meta.description,
    meta.fileType
  ]);

  const tile = (
    <FeedTileSurface
      model={model}
      mode="preview"
      compact
      hideEngagementRail
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
      <TemplateEngagementRail
        fileId={entry.fileId}
        userPnIdentifier={session?.pnIdentifier}
        unlocked={Boolean(session?.pnIdentifier)}
      />
    </div>
  );
}
