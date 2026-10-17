import { useState } from 'react';
import { defaultLicensingRoot, type PenLicensingRoot } from '@par-noir/pen-protocol';
import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import { LicensingSettingsPanel } from './LicensingSettingsPanel';
import { ShareToFeedDialog, type ShareToFeedSubmit } from './ShareToFeedDialog';

export type PublishMenuPanelProps = {
  projectEnabled: boolean;
  correspondenceEnabled?: boolean;
  canPublishPublicTemplate?: boolean;
  hasPublishedPost?: boolean;
  widgetTemplatesOnly?: boolean;
  pnIdentifier?: string;
  manifest?: PenDocManifest;
  sections?: PenSectionContent[];
  onShareToAggregators: (payload: ShareToFeedSubmit) => void;
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
  hideSocialToggle?: boolean;
  showHeading?: boolean;
  onRequestClose?: () => void;
};

/** Feeds, templates, download, library paths. Doc version: Save → Commit. */
export function PublishMenuPanel({
  projectEnabled,
  correspondenceEnabled,
  canPublishPublicTemplate,
  hasPublishedPost,
  widgetTemplatesOnly,
  pnIdentifier,
  manifest,
  sections,
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
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateLicense, setTemplateLicense] = useState<PenLicensingRoot>(() =>
    defaultLicensingRoot(ownerPnHash, { membership: membership === true })
  );
  const templateOk =
    canPublishPublicTemplate === true &&
    (hasPublishedPost === true || widgetTemplatesOnly === true);
  const showLicensing = membership === true;
  const socialActive = isSocial || feedEnabled === true;

  function close() {
    onRequestClose?.();
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
        title="Share this post to feeds and aggregators"
        className="block w-full px-0 py-1.5 text-left text-[12px] text-stone-800 hover:opacity-70"
        onClick={() => {
          if (!socialActive && onToggleSocial) {
            onToggleSocial();
          }
          setShareDialogOpen(true);
          setTemplateOpen(false);
        }}
      >
        Share to feed…
      </button>
      {manifest && sections && (
        <ShareToFeedDialog
          open={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          manifest={manifest}
          sections={sections}
          pnIdentifier={pnIdentifier}
          onSubmit={(payload) => {
            onShareToAggregators(payload);
            close();
          }}
        />
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
            setShareDialogOpen(false);
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
