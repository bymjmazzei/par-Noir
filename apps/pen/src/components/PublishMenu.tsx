import { useEffect, useRef, useState } from 'react';
import { defaultLicensingRoot, type PenLicensingRoot } from '@par-noir/pen-protocol';
import { IconChevron, IconPublish } from './icons/PenIcons';
import { LicensingSettingsPanel } from './LicensingSettingsPanel';
import {
  activeContentFeeds,
  listOwnerHostedFeeds,
  resolvePublishFeedIds,
  type PublishFeed
} from '../services/penFeedTargets';

export type PenAggregatorTarget = string;

/**
 * Publish live / share to aggregators / private template / project library paths.
 * Browse/networks: all unlocked users. Public templates + licensing: verified only.
 */
export function PublishMenu({
  projectEnabled,
  correspondenceEnabled,
  canPublishPublicTemplate,
  hasPublishedPost,
  pnIdentifier,
  onPublishLive,
  onShareToAggregators,
  onPublishTemplate,
  onSendCorrespondence,
  onTemplatePrivate,
  onLibraryTemplate,
  onFinishedWork,
  onDownload,
  licensing,
  ownerPnHash,
  membership,
  connectReady,
  musicAsset,
  onLicensingChange
}: {
  projectEnabled: boolean;
  correspondenceEnabled?: boolean;
  /** Verified author — public pen-templates share + licensing panel. */
  canPublishPublicTemplate?: boolean;
  /** Post already written to the owner cloud — required before template reuse. */
  hasPublishedPost?: boolean;
  pnIdentifier?: string;
  onPublishLive: () => void;
  onShareToAggregators: (feedIds: string[]) => void;
  onPublishTemplate?: (licensing: PenLicensingRoot) => void;
  onSendCorrespondence?: () => void;
  onTemplatePrivate: () => void;
  onLibraryTemplate: () => void;
  onFinishedWork: () => void;
  onDownload?: () => void;
  licensing?: PenLicensingRoot;
  ownerPnHash?: string | null;
  membership?: boolean;
  connectReady?: boolean;
  musicAsset?: boolean;
  onLicensingChange?: (next: PenLicensingRoot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [feedMode, setFeedMode] = useState<'all' | 'selected'>('all');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [feeds, setFeeds] = useState<PublishFeed[]>([]);
  const [templateLicense, setTemplateLicense] = useState<PenLicensingRoot>(() =>
    defaultLicensingRoot(ownerPnHash, { membership: membership === true })
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const templateOk = canPublishPublicTemplate === true && hasPublishedPost === true;
  const showLicensing = membership === true;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!shareOpen || !pnIdentifier) return;
    let cancelled = false;
    void listOwnerHostedFeeds(pnIdentifier).then((hosted) => {
      if (!cancelled) setFeeds(activeContentFeeds(hosted));
    });
    return () => {
      cancelled = true;
    };
  }, [shareOpen, pnIdentifier]);

  useEffect(() => {
    if (!templateOpen) return;
    setTemplateLicense(defaultLicensingRoot(ownerPnHash, { membership: membership === true }));
  }, [templateOpen, ownerPnHash, membership]);

  function toggleFeed(id: string) {
    const active = feeds.length ? feeds : activeContentFeeds([]);
    setChecked((current) => {
      const base: Record<string, boolean> =
        feedMode === 'all'
          ? Object.fromEntries(active.map((feed) => [feed.id, true]))
          : { ...current };
      base[id] = !base[id];
      return base;
    });
    setFeedMode('selected');
  }

  function submitShare() {
    const active = feeds.length ? feeds : activeContentFeeds([]);
    const selected = resolvePublishFeedIds(
      feedMode,
      Object.entries(checked)
        .filter(([, on]) => on)
        .map(([id]) => id),
      active
    );
    if (!selected.length) return;
    onShareToAggregators(selected);
    setShareOpen(false);
    setOpen(false);
  }

  function submitTemplate() {
    if (!templateOk || !onPublishTemplate) return;
    onPublishTemplate(templateLicense);
    setTemplateOpen(false);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-neutral-600 hover:bg-stone-200 hover:text-black"
        aria-expanded={open}
        aria-label="Publish"
        title="Publish"
        onClick={() => setOpen((v) => !v)}
      >
        <IconPublish />
        <IconChevron />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[15rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            title="Update the live current/ version for collaborators"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              onPublishLive();
              setOpen(false);
            }}
          >
            Publish live
          </button>
          <button
            type="button"
            title="Publish this post to your cloud and choose which feeds aggregate it"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              setShareOpen((v) => !v);
              setTemplateOpen(false);
            }}
          >
            Connect to feed…
          </button>
          {shareOpen && (
            <div className="border-t border-stone-100 bg-stone-50 px-3 py-2">
              {showLicensing && licensing && onLicensingChange && (
                <div className="mb-2 border-b border-stone-200 pb-2">
                  <LicensingSettingsPanel
                    value={licensing}
                    ownerPnHash={ownerPnHash}
                    membership={membership === true}
                    connectReady={connectReady === true}
                    musicAsset={musicAsset}
                    onChange={onLicensingChange}
                  />
                </div>
              )}
              <label className="block text-[11px] text-stone-600">Aggregate to</label>
              <select
                className="mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-[12px]"
                aria-label="Where this post is aggregated"
                value={feedMode}
                onChange={(e) => setFeedMode(e.target.value === 'selected' ? 'selected' : 'all')}
              >
                <option value="all">Make public</option>
                <option value="selected">Selected feeds</option>
              </select>
              <div className="mt-2 max-h-40 overflow-auto">
                {(feeds.length ? feeds : activeContentFeeds([])).map((feed) => (
                  <label key={feed.id} className="mt-1 flex items-center gap-2 text-[11px] text-stone-700">
                    <input
                      type="checkbox"
                      checked={feedMode === 'all' ? true : !!checked[feed.id]}
                      onChange={() => toggleFeed(feed.id)}
                    />
                    {feed.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-stone-500">
                Make public sends this post to every active feed. Check individual feeds to publish
                only those.
              </p>
              <button
                type="button"
                className="mt-2 text-[11px] font-bold text-black hover:opacity-60"
                onClick={submitShare}
              >
                Share
              </button>
            </div>
          )}
          {onPublishTemplate && (
            <button
              type="button"
              title={
                templateOk
                  ? 'Publish this post’s cloud doc as a reusable template'
                  : 'Publish the post first. Verification is required to publish a template.'
              }
              disabled={!templateOk}
              className={`block w-full px-3 py-1.5 text-left text-[12px] ${
                templateOk ? 'text-stone-800 hover:bg-stone-50' : 'text-stone-400'
              }`}
              onClick={() => {
                if (!templateOk) return;
                setTemplateOpen((v) => !v);
                setShareOpen(false);
              }}
            >
              Publish template…
            </button>
          )}
          {templateOpen && templateOk && (
            <div className="border-t border-stone-100 bg-stone-50 px-3 py-2">
              <p className="mb-2 text-[10px] text-stone-500">
                Reuse license for this template. It is separate from the post’s license.
              </p>
              <LicensingSettingsPanel
                value={templateLicense}
                ownerPnHash={ownerPnHash}
                membership={membership === true}
                connectReady={connectReady === true}
                musicAsset={musicAsset}
                onChange={setTemplateLicense}
              />
              <button
                type="button"
                className="mt-2 text-[11px] font-bold text-black hover:opacity-60"
                onClick={submitTemplate}
              >
                Publish template
              </button>
            </div>
          )}
          {correspondenceEnabled && onSendCorrespondence && (
            <button
              type="button"
              title="Open Messaging with this letter/note as a draft"
              className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
              onClick={() => {
                onSendCorrespondence();
                setOpen(false);
              }}
            >
              Send
            </button>
          )}
          <div className="my-1 border-t border-stone-100" />
          {onDownload && (
            <button
              type="button"
              title="Download a flattened image, video, or document. Buttons and fields stay in the browser."
              className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
              onClick={() => {
                onDownload();
                setOpen(false);
              }}
            >
              Download
            </button>
          )}
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              onTemplatePrivate();
              setOpen(false);
            }}
          >
            Save as private template
          </button>
          {projectEnabled && (
            <>
              <div className="my-1 border-t border-stone-100" />
              <button
                type="button"
                title="Save as a reusable Library (Book/Article) template under Yours"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
                onClick={() => {
                  onLibraryTemplate();
                  setOpen(false);
                }}
              >
                As Library template
              </button>
              <button
                type="button"
                title="Create a finished Library document (durable; not a social feed tile)"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
                onClick={() => {
                  onFinishedWork();
                  setOpen(false);
                }}
              >
                As finished work
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
