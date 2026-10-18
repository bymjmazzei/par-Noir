import { useEffect, useMemo, useState } from 'react';
import {
  FEED_CATEGORY_LIST,
  type PublishMetadataForm,
  validatePublishMetadata,
  indexingPermissionsFromToggles,
  type IndexingPermissionsInput
} from '@par-noir/aggregator-domain';
import { inferFeedContentClass, type PenDocManifest } from '@par-noir/pen-protocol';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import {
  activeHostedFeeds,
  feedContentClassLabel,
  listOwnerHostedFeeds,
  listThirdPartyIndexers,
  resolveShareFeedIds,
  type PublishFeed,
  type ThirdPartyIndexer
} from '../services/penFeedTargets';
import { defaultCloudRequest } from '../services/penPublicPublish';

export type ShareToFeedMode = 'share' | 'update' | 'new';

export type ShareToFeedSubmit = {
  mode: ShareToFeedMode;
  feedIds: string[];
  metadata: PublishMetadataForm;
  indexingPermissions?: IndexingPermissionsInput;
};

const EMPTY_FORM: PublishMetadataForm = {
  name: '',
  description: '',
  tags: '',
  genre: '',
  categories: [],
  isNSFW: false,
  locationName: '',
  locationAddress: '',
  license: 'all-rights-reserved',
  expiresAt: null
};

function formFromIndexMeta(
  meta: Record<string, unknown> | null | undefined,
  fallbackTitle: string
): PublishMetadataForm {
  if (!meta) {
    return { ...EMPTY_FORM, name: fallbackTitle };
  }
  const tags = Array.isArray(meta.tags)
    ? meta.tags.filter((t): t is string => typeof t === 'string').join(', ')
    : Array.isArray(meta.keywords)
      ? meta.keywords.filter((t): t is string => typeof t === 'string').join(', ')
      : '';
  const genre = Array.isArray(meta.genre)
    ? meta.genre.filter((g): g is string => typeof g === 'string').join(', ')
    : typeof meta.genre === 'string'
      ? meta.genre
      : '';
  const categories = Array.isArray(meta.feedCategories)
    ? meta.feedCategories.filter((c): c is string => typeof c === 'string')
    : Array.isArray(meta.subjects)
      ? meta.subjects.filter((c): c is string => typeof c === 'string')
      : [];
  return {
    name:
      (typeof meta.title === 'string' && meta.title) ||
      (typeof meta.name === 'string' && meta.name) ||
      fallbackTitle,
    description: typeof meta.description === 'string' ? meta.description : '',
    tags,
    genre,
    categories: categories as PublishMetadataForm['categories'],
    isNSFW: meta.isNSFW === true,
    locationName: '',
    locationAddress: '',
    license:
      typeof meta.license === 'string' ? meta.license : 'all-rights-reserved',
    expiresAt: typeof meta.expiresAt === 'string' ? meta.expiresAt : null
  };
}

function hostedCheckedFromMeta(
  meta: Record<string, unknown> | null | undefined,
  hosted: PublishFeed[]
): Record<string, boolean> {
  const feedIds = Array.isArray(meta?.feedIds)
    ? meta!.feedIds.filter((id): id is string => typeof id === 'string')
    : [];
  const hostedIds = new Set(hosted.map((f) => f.id));
  const next: Record<string, boolean> = {};
  for (const id of feedIds) {
    if (hostedIds.has(id)) next[id] = true;
  }
  return next;
}

export function ShareToFeedDialog({
  open,
  onClose,
  manifest,
  sections,
  pnIdentifier,
  mode = 'share',
  onSubmit
}: {
  open: boolean;
  onClose: () => void;
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  pnIdentifier?: string;
  mode?: ShareToFeedMode;
  onSubmit: (payload: ShareToFeedSubmit) => void;
}) {
  const contentClass = useMemo(
    () =>
      inferFeedContentClass({
        sections,
        classId: manifest.classId,
        isSocial: manifest.isSocial,
        toc: manifest.toc,
        templateId: manifest.templateId,
        title: manifest.title,
        pagePresentation: manifest.pagePresentation
      }),
    [
      sections,
      manifest.classId,
      manifest.isSocial,
      manifest.toc,
      manifest.templateId,
      manifest.title,
      manifest.pagePresentation
    ]
  );

  const [form, setForm] = useState<PublishMetadataForm>(() => ({
    ...EMPTY_FORM,
    name: manifest.title || ''
  }));
  const [expanded, setExpanded] = useState(false);
  const [hosted, setHosted] = useState<PublishFeed[]>([]);
  const [hostedChecked, setHostedChecked] = useState<Record<string, boolean>>({});
  const [indexers, setIndexers] = useState<ThirdPartyIndexer[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [prefillMeta, setPrefillMeta] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setExpanded(false);
    setPrefillMeta(null);
    if (mode !== 'update' || !manifest.publishedFileId) {
      setForm({ ...EMPTY_FORM, name: manifest.title || '' });
      setHostedChecked({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await defaultCloudRequest()(
          'GET',
          `/api/aggregator/metadata-index/${encodeURIComponent(manifest.publishedFileId!)}`
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setForm({ ...EMPTY_FORM, name: manifest.title || '' });
          return;
        }
        const data = (await res.json()) as { metadata?: Record<string, unknown> };
        if (cancelled) return;
        setForm(formFromIndexMeta(data.metadata, manifest.title || ''));
        setPrefillMeta(data.metadata || null);
      } catch {
        if (!cancelled) setForm({ ...EMPTY_FORM, name: manifest.title || '' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, manifest.publishedFileId, manifest.title]);

  useEffect(() => {
    if (!open || !pnIdentifier) return;
    let cancelled = false;
    void listOwnerHostedFeeds(pnIdentifier).then((list) => {
      if (cancelled) return;
      setHosted(activeHostedFeeds(list));
    });
    void listThirdPartyIndexers(pnIdentifier).then((list) => {
      if (cancelled) return;
      setIndexers(list);
      const toggles: Record<string, boolean> = {};
      for (const idx of list) toggles[idx.id] = true;
      setIndexerToggles(toggles);
    });
    return () => {
      cancelled = true;
    };
  }, [open, pnIdentifier]);

  useEffect(() => {
    if (!open || mode !== 'update' || !prefillMeta || hosted.length === 0) return;
    setHostedChecked(hostedCheckedFromMeta(prefillMeta, hosted));
  }, [open, mode, prefillMeta, hosted]);

  if (!open) return null;

  function toggleCategory(id: (typeof FEED_CATEGORY_LIST)[number]['id']) {
    setForm((prev) => {
      const cur = prev.categories || [];
      if (cur.includes(id)) {
        return { ...prev, categories: cur.filter((c) => c !== id) };
      }
      return { ...prev, categories: [...cur, id] };
    });
  }

  function handleSubmit() {
    const validation = validatePublishMetadata(form);
    if (validation) {
      setError(validation);
      return;
    }
    const selectedHosted = Object.entries(hostedChecked)
      .filter(([, on]) => on)
      .map(([id]) => id);
    let feedIds: string[];
    try {
      feedIds = resolveShareFeedIds({ contentClass, selectedHostedFeedIds: selectedHosted });
    } catch {
      setError('feed_required');
      return;
    }
    const indexingPermissions = indexingPermissionsFromToggles(
      indexers.map((i) => i.id),
      indexerToggles
    );
    onSubmit({ mode, feedIds, metadata: form, indexingPermissions });
    onClose();
  }

  const title =
    mode === 'update' ? 'Update shared post' : mode === 'new' ? 'Share as new post' : 'Share to feed';
  const submitLabel = mode === 'update' ? 'Update post' : 'Share';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-to-feed-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-stone-200 bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-to-feed-title" className="text-base font-semibold text-stone-900">
          {title}
        </h2>
        <p className="mt-1 text-[12px] text-stone-600">
          Post type: <span className="font-medium text-stone-800">{feedContentClassLabel(contentClass)}</span>
          <span className="text-stone-400"> — routed automatically</span>
        </p>
        {mode === 'new' && (
          <p className="mt-1 text-[12px] text-stone-600">
            Creates a separate copy of this doc, then publishes that copy. The existing post stays live.
          </p>
        )}
        {mode === 'update' && (
          <p className="mt-1 text-[12px] text-stone-600">
            Replaces the live view of the existing post. Likes, comments, and saves are kept.
          </p>
        )}

        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-stone-600">Title</label>
            <input
              className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-[13px]"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-stone-600">Caption</label>
            <textarea
              className="mt-0.5 w-full resize-none rounded border border-stone-300 px-2 py-1.5 text-[13px]"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <button
            type="button"
            className="text-[11px] font-medium text-stone-700 underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide' : 'More'} metadata
          </button>

          {expanded && (
            <div className="space-y-2 border-t border-stone-100 pt-2">
              <input
                className="w-full rounded border border-stone-300 px-2 py-1 text-[12px]"
                placeholder="Tags (comma-separated)"
                value={form.tags || ''}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
              <input
                className="w-full rounded border border-stone-300 px-2 py-1 text-[12px]"
                placeholder="Genre"
                value={form.genre || ''}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
              />
              <div className="flex flex-wrap gap-1">
                {FEED_CATEGORY_LIST.map((cat) => {
                  const on = form.categories?.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`rounded px-2 py-0.5 text-[10px] ${
                        on ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700'
                      }`}
                      onClick={() => toggleCategory(cat.id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-[12px] text-stone-700">
                <input
                  type="checkbox"
                  checked={form.isNSFW === true}
                  onChange={(e) => setForm({ ...form, isNSFW: e.target.checked })}
                />
                NSFW (18+)
              </label>
            </div>
          )}

          {hosted.length > 0 && (
            <div className="border-t border-stone-100 pt-2">
              <p className="text-[11px] font-medium text-stone-600">Your feeds</p>
              {hosted.map((feed) => (
                <label key={feed.id} className="mt-1 flex items-center gap-2 text-[12px] text-stone-800">
                  <input
                    type="checkbox"
                    checked={!!hostedChecked[feed.id]}
                    onChange={() =>
                      setHostedChecked((c) => ({ ...c, [feed.id]: !c[feed.id] }))
                    }
                  />
                  {feed.name}
                </label>
              ))}
            </div>
          )}

          {indexers.length > 0 && (
            <div className="border-t border-stone-100 pt-2">
              <p className="text-[11px] font-medium text-stone-600">Aggregate to apps</p>
              {indexers.map((idx) => (
                <label key={idx.id} className="mt-1 flex items-center gap-2 text-[12px] text-stone-800">
                  <input
                    type="checkbox"
                    checked={indexerToggles[idx.id] !== false}
                    onChange={() =>
                      setIndexerToggles((t) => ({ ...t, [idx.id]: !t[idx.id] }))
                    }
                  />
                  {idx.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-[12px] text-stone-600 hover:bg-stone-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800"
            onClick={handleSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
