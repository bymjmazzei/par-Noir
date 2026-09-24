import { useEffect, useRef, useState } from 'react';
import type { PenLicensingRoot } from '@par-noir/pen-protocol';
import { IconChevron, IconPublish } from './icons/PenIcons';
import { LicensingSettingsPanel } from './LicensingSettingsPanel';
import { sanitizeAggregatorTargets } from '../services/penPublishGates';

export type PenAggregatorTarget = 'browse' | 'pen-templates' | string;

/**
 * Publish live / share to aggregators / private template / project library paths.
 * Browse/networks: all unlocked users. Public templates + licensing: verified only.
 */
export function PublishMenu({
  projectEnabled,
  correspondenceEnabled,
  canPublishPublicTemplate,
  onPublishLive,
  onShareToAggregators,
  onSendCorrespondence,
  onTemplatePrivate,
  onLibraryTemplate,
  onFinishedWork,
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
  onPublishLive: () => void;
  onShareToAggregators: (targets: PenAggregatorTarget[]) => void;
  onSendCorrespondence?: () => void;
  onTemplatePrivate: () => void;
  onLibraryTemplate: () => void;
  onFinishedWork: () => void;
  licensing?: PenLicensingRoot;
  ownerPnHash?: string | null;
  membership?: boolean;
  connectReady?: boolean;
  musicAsset?: boolean;
  onLicensingChange?: (next: PenLicensingRoot) => void;
}) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [targets, setTargets] = useState<Record<string, boolean>>({
    browse: true,
    'pen-templates': false
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const templateOk = canPublishPublicTemplate === true;
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
    if (templateOk) return;
    setTargets((t) => (t['pen-templates'] ? { ...t, 'pen-templates': false } : t));
  }, [templateOk]);

  function toggleTarget(id: string) {
    if (id === 'pen-templates' && !templateOk) return;
    setTargets((t) => ({ ...t, [id]: !t[id] }));
  }

  function submitShare() {
    const selected = sanitizeAggregatorTargets(
      Object.entries(targets)
        .filter(([, on]) => on)
        .map(([id]) => id),
      templateOk
    );
    if (!selected.length) return;
    onShareToAggregators(selected);
    setShareOpen(false);
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
            title="Share to aggregators (browse, pen templates, …)"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => setShareOpen((v) => !v)}
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
              <label className="flex items-center gap-2 text-[11px] text-stone-700">
                <input
                  type="checkbox"
                  checked={!!targets.browse}
                  onChange={() => toggleTarget('browse')}
                />
                Browse (your networks)
              </label>
              <label
                className={`mt-1 flex items-center gap-2 text-[11px] ${
                  templateOk ? 'text-stone-700' : 'text-stone-500'
                }`}
                title={
                  templateOk
                    ? undefined
                    : 'Verification required to publish a public template'
                }
              >
                <input
                  type="checkbox"
                  checked={!!targets['pen-templates']}
                  disabled={!templateOk}
                  onChange={() => toggleTarget('pen-templates')}
                />
                Pen templates
              </label>
              {!templateOk && (
                <p className="mt-1 text-[10px] text-stone-500">
                  Verification required to publish a public template.
                </p>
              )}
              <label className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                <input type="checkbox" disabled checked={false} readOnly />
                Third party (soon)
              </label>
              <p className="mt-1 text-[10px] text-stone-500">
                Templates never appear in user feeds — only the templates feed / Discover
                Templates.
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
