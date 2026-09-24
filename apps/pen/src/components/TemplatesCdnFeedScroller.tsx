/**
 * Templates feed — public pen-templates from central index, CDN media only.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';
import { FeedTileSurface, type FeedTileViewModel } from '@par-noir/feed-tile';
import { getClass } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import { fetchPublicPenTemplates } from '../services/penCentralIndex';
import { resolvePublicMediaSignedUrl } from '../services/penPublicFeedMedia';
import {
  buildClassFeedRailItems,
  contentClassFallbackLabel
} from '../services/classFeedRailItems';
import { ClassFeedRail } from './ClassFeedRail';

function entryClassId(entry: CentralIndexEntry): string {
  const meta = entry.metadata as {
    penClassId?: string;
    contentClass?: string;
  };
  if (meta.penClassId && getClass(meta.penClassId)?.parentId) {
    return meta.penClassId;
  }
  // Synthetic bucket when penClassId missing — use contentClass as rail id.
  return `cc:${meta.contentClass || 'other'}`;
}

function entryRailLabel(classKey: string): string {
  if (classKey.startsWith('cc:')) {
    return contentClassFallbackLabel(classKey.slice(3));
  }
  const form = getClass(classKey);
  return (form?.title || classKey).toUpperCase();
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
    // buildClassFeedRailItems already has ALL; append contentClass buckets.
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
    <div className="pen-doc-feed">
      <div className="pen-doc-feed-rail-sticky">
        <ClassFeedRail
          items={railItems}
          activeId={activeClassId}
          onSelect={onActiveClassId}
        />
      </div>
      <div className="pen-doc-feed-scroll">
        {loading ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">Loading public templates…</p>
          </div>
        ) : error ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="pen-doc-feed-empty">
            <p className="text-sm text-neutral-500">No public templates in this class.</p>
          </div>
        ) : (
          filtered.map((entry) => (
            <CdnTemplateSlide
              key={entry.fileId}
              entry={entry}
              accessToken={session?.accessToken}
              onOpen={() => onSelectEntry(entry)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CdnTemplateSlide({
  entry,
  accessToken,
  onOpen
}: {
  entry: CentralIndexEntry;
  accessToken?: string | null;
  onOpen: () => void;
}) {
  const meta = entry.metadata as {
    title?: string;
    name?: string;
    description?: string;
    contentClass?: string;
    fileType?: string;
  };
  const title = meta.title || meta.name || 'Template';
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
          accessToken
        ).catch(() => null);
        let mediaSrc = poster || undefined;
        let mediaKind: 'image' | 'video' = 'image';
        if (isVideo) {
          const sd = await resolvePublicMediaSignedUrl(
            entry.fileId,
            'sd',
            accessToken
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
  }, [entry.fileId, accessToken, title, meta.contentClass, meta.description, meta.fileType]);

  return (
    <button type="button" className="pen-doc-feed-slide" onClick={onOpen}>
      <FeedTileSurface model={model} mode="preview" compact />
    </button>
  );
}
