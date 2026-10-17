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

export type ShareToFeedSubmit = {
  feedIds: string[];
  metadata: PublishMetadataForm;
  indexingPermissions?: IndexingPermissionsInput;
};

export function ShareToFeedDialog({
  open,
  onClose,
  manifest,
  sections,
  pnIdentifier,
  onSubmit
}: {
  open: boolean;
  onClose: () => void;
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  pnIdentifier?: string;
  onSubmit: (payload: ShareToFeedSubmit) => void;
}) {
  const contentClass = useMemo(
    () =>
      inferFeedContentClass({
        sections,
        classId: manifest.classId,
        templateId: manifest.templateId,
        title: manifest.title,
        pagePresentation: manifest.pagePresentation
      }),
    [sections, manifest.classId, manifest.templateId, manifest.title, manifest.pagePresentation]
  );

  const [form, setForm] = useState<PublishMetadataForm>({
    name: manifest.title || '',
    description: '',
    tags: '',
    genre: '',
    categories: [],
    isNSFW: false,
    locationName: '',
    locationAddress: '',
    license: 'all-rights-reserved',
    expiresAt: null
  });
  const [expanded, setExpanded] = useState(false);
  const [hosted, setHosted] = useState<PublishFeed[]>([]);
  const [hostedChecked, setHostedChecked] = useState<Record<string, boolean>>({});
  const [indexers, setIndexers] = useState<ThirdPartyIndexer[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({
      ...prev,
      name: manifest.title || prev.name || ''
    }));
    setError(null);
  }, [open, manifest.title]);

  useEffect(() => {
    if (!open || !pnIdentifier) return;
    let cancelled = false;
    void listOwnerHostedFeeds(pnIdentifier).then((list) => {
      if (!cancelled) setHosted(activeHostedFeeds(list));
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
    onSubmit({ feedIds, metadata: form, indexingPermissions });
    onClose();
  }

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
          Share to feed
        </h2>
        <p className="mt-1 text-[12px] text-stone-600">
          Post type: <span className="font-medium text-stone-800">{feedContentClassLabel(contentClass)}</span>
          <span className="text-stone-400"> — routed automatically</span>
        </p>

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
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
