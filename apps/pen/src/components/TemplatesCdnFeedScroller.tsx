/**
 * Templates feed — public pen-templates from central index, CDN media only.
 * Live engagement only for social public IndexedFile entries.
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
import { ClassFeedRail } from './ClassFeedRail';
import { SnapFeedShell } from './SnapFeedShell';
import { SocialPhoneFrame } from './SocialPhoneFrame';
import { TemplateEngagementRail } from './TemplateEngagementRail';

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
  // Aggregator contentClass note/media/collection are social browse atoms.
  return (
    meta.contentClass === 'note' ||
    meta.contentClass === 'media' ||
    meta.contentClass === 'collection'
  );
}

export function TemplatesCdnFeedScroller({
  session,
  activeClassId,
  onActiveClassId,
  onSelectEntry
}: {
  session: PenSession | null;
  activeClassId: string;
  onActiveClassId: (id: string) => void;
  onSelectEntry: (entry: CentralIndexEntry) => void;
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

  const railItems = useMemo(() => {
    const formIds = new Set<string>();
    const fallbackKeys = new Set<string>();
    for (const e of entries) {
      const key = entryClassId(e);
      if (key.startsWith('cc:')) fallbackKeys.add(key);
      else formIds.add(key);
    }
    const fromForms = buildClassFeedRailItems(formIds);
    const extras = [...fallbackKeys]
      .map((id) => ({ id, label: entryRailLabel(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [...fromForms, ...extras];
  }, [entries]);

  const filtered = useMemo(() => {
    if (activeClassId === 'all') return entries;
    return entries.filter((e) => entryClassId(e) === activeClassId);
  }, [entries, activeClassId]);

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
      count={loading || error ? 0 : filtered.length}
      loading={
        loading ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">Loading public templates…</p>
          </div>
        ) : undefined
      }
      empty={
        error ? (
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
        const entry = filtered[index];
        if (!entry) return null;
        return (
          <CdnTemplateSlide
            entry={entry}
            session={session}
            onOpen={() => onSelectEntry(entry)}
          />
        );
      }}
    />
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
      hideEngagementRail={social}
    />
  );

  return (
    <button type="button" className="pen-doc-feed-slide-hit" onClick={onOpen}>
      <div className={`pen-doc-feed-slide-stage${social ? ' is-social' : ''}`}>
        {social ? (
          <>
            <SocialPhoneFrame large>{tile}</SocialPhoneFrame>
            <TemplateEngagementRail
              fileId={entry.fileId}
              userPnIdentifier={session?.pnIdentifier}
              unlocked={Boolean(session?.pnIdentifier)}
            />
          </>
        ) : (
          tile
        )}
      </div>
    </button>
  );
}
