import { useEffect, useState } from 'react';
import { defaultLicensingRoot, type PenLicensingRoot } from '@par-noir/pen-protocol';
import { LicensingSettingsPanel } from './LicensingSettingsPanel';
import {
  activeContentFeeds,
  listOwnerHostedFeeds,
  resolvePublishFeedIds,
  type PublishFeed
} from '../services/penFeedTargets';

export type PublishMenuPanelProps = {
  projectEnabled: boolean;
  correspondenceEnabled?: boolean;
  canPublishPublicTemplate?: boolean;
  hasPublishedPost?: boolean;
  widgetTemplatesOnly?: boolean;
  pnIdentifier?: string;
  onPublishLive: () => void;
  onShareToAggregators: (feedIds: string[]) => void;
  isSocial?: boolean;
  onToggleSocial?: () => void;
  feedEnabled?: boolean;
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
  /** Hide social toggle row (toolbar globe is the only control). */
  hideSocialToggle?: boolean;
  showHeading?: boolean;
  onRequestClose?: () => void;
};

/** Publish live, feeds, templates, download, library paths. */
export function PublishMenuPanel({
  projectEnabled,
  correspondenceEnabled,
  canPublishPublicTemplate,
  hasPublishedPost,
  widgetTemplatesOnly,
  pnIdentifier,
  onPublishLive,
  onShareToAggregators,
  isSocial = false,
  onToggleSocial,
  feedEnabled,
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
  onLicensingChange,
  hideSocialToggle = false,
  showHeading = true,
  onRequestClose
}: PublishMenuPanelProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [feedMode, setFeedMode] = useState<'all' | 'selected'>('all');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [feeds, setFeeds] = useState<PublishFeed[]>([]);
  const [templateLicense, setTemplateLicense] = useState<PenLicensingRoot>(() =>
    defaultLicensingRoot(ownerPnHash, { membership: membership === true })
  );
  const templateOk =
    canPublishPublicTemplate === true &&
    (hasPublishedPost === true || widgetTemplatesOnly === true);
  const showLicensing = membership === true;
  const socialActive = isSocial || feedEnabled === true;

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

  function close() {
    onRequestClose?.();
  }

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
    close();
  }

  function submitTemplate() {
    if (!templateOk || !onPublishTemplate) return;
    onPublishTemplate(templateLicense);
    setTemplateOpen(false);
    close();
  }

  return (
    <div>
      {showHeading && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
          Publish
        </p>
      )}
      {!hideSocialToggle && onToggleSocial && (
        <div className="mb-2 flex items-center justify-between border-b border-stone-100 pb-2 text-[12px] text-stone-800">
          <span>Social post</span>
          <button
            type="button"
            role="switch"
            aria-checked={socialActive}
            className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              socialActive ? 'bg-black' : 'bg-stone-300'
            }`}
            onClick={onToggleSocial}
            title={socialActive ? 'Turn off social post' : 'Make social post'}
          >
            <span
              className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                socialActive ? 'translate-x-3' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}
      <button
        type="button"
        title="Update the live current/ version for collaborators"
        className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
        onClick={() => {
          onPublishLive();
          close();
        }}
      >
        Publish live
      </button>
      <button
        type="button"
        title="Publish this post to your cloud and choose which feeds aggregate it"
        className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
        onClick={() => {
          if (!socialActive && onToggleSocial) {
            onToggleSocial();
          }
          setShareOpen((v) => !v);
          setTemplateOpen(false);
        }}
      >
        Connect to feed…
      </button>
      {shareOpen && (
        <div className="mt-2 border-t border-stone-100 bg-stone-50 px-2 py-2">
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
            Make public sends this post to every active feed. Check individual feeds to publish only
            those.
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
          className={`block w-full px-0 py-1.5 text-left text-[12px] ${
            templateOk ? 'text-stone-800 hover:opacity-70' : 'text-stone-400'
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
        <div className="mt-2 border-t border-stone-100 bg-stone-50 px-2 py-2">
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
          className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
          onClick={() => {
            onSendCorrespondence();
            close();
          }}
        >
          Send
        </button>
      )}
      {onDownload && (
        <button
          type="button"
          title="Download a flattened image, video, or document. Buttons and fields stay in the browser."
          className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
          onClick={() => {
            onDownload();
            close();
          }}
        >
          Download
        </button>
      )}
      <button
        type="button"
        className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
        onClick={() => {
          onTemplatePrivate();
          close();
        }}
      >
        Save as private template
      </button>
      {projectEnabled && (
        <>
          <button
            type="button"
            title="Save as a reusable Library (Book/Article) template under Yours"
            className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
            onClick={() => {
              onLibraryTemplate();
              close();
            }}
          >
            As Library template
          </button>
          <button
            type="button"
            title="Create a finished Library document (durable; not a social feed tile)"
            className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
            onClick={() => {
              onFinishedWork();
              close();
            }}
          >
            As finished work
          </button>
        </>
      )}
    </div>
  );
}
