import { useEffect, useRef, useState } from 'react';
import { IconShare } from './icons/PenIcons';
import { ShareMenuPanel, type ShareMenuPanelProps } from './ShareMenuPanel';
import { PublishMenuPanel, type PublishMenuPanelProps } from './PublishMenuPanel';

type DocShareHubMenuProps = ShareMenuPanelProps &
  PublishMenuPanelProps & {
    onOpenHistory: () => void;
  };

/** Collaborate, publish, and version history in one share menu. */
export function DocShareHubMenu({
  onOpenHistory,
  ...rest
}: DocShareHubMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const shareProps: ShareMenuPanelProps = {
    docId: rest.docId,
    invitePn: rest.invitePn,
    onInvitePnChange: rest.onInvitePnChange,
    onInvite: rest.onInvite,
    inviteRole: rest.inviteRole,
    onInviteRoleChange: rest.onInviteRoleChange,
    canInvite: rest.canInvite,
    connections: rest.connections,
    connectionsLoading: rest.connectionsLoading,
    selectedConnectionPns: rest.selectedConnectionPns,
    onToggleConnection: rest.onToggleConnection,
    onInviteConnections: rest.onInviteConnections,
    joinLink: rest.joinLink,
    joinLinkLoading: rest.joinLinkLoading,
    onCreateJoinLink: rest.onCreateJoinLink,
    onCopyJoinLink: rest.onCopyJoinLink
  };

  const publishProps: PublishMenuPanelProps = {
    projectEnabled: rest.projectEnabled,
    correspondenceEnabled: rest.correspondenceEnabled,
    canPublishPublicTemplate: rest.canPublishPublicTemplate,
    hasPublishedPost: rest.hasPublishedPost,
    widgetTemplatesOnly: rest.widgetTemplatesOnly,
    pnIdentifier: rest.pnIdentifier,
    onPublishLive: rest.onPublishLive,
    onShareToAggregators: rest.onShareToAggregators,
    isSocial: rest.isSocial,
    onToggleSocial: rest.onToggleSocial,
    feedEnabled: rest.feedEnabled,
    onPublishTemplate: rest.onPublishTemplate,
    onSendCorrespondence: rest.onSendCorrespondence,
    onTemplatePrivate: rest.onTemplatePrivate,
    onLibraryTemplate: rest.onLibraryTemplate,
    onFinishedWork: rest.onFinishedWork,
    onDownload: rest.onDownload,
    licensing: rest.licensing,
    ownerPnHash: rest.ownerPnHash,
    membership: rest.membership,
    connectReady: rest.connectReady,
    musicAsset: rest.musicAsset,
    onLicensingChange: rest.onLicensingChange,
    hideSocialToggle: true,
    onRequestClose: () => setOpen(false)
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`inline-flex items-center px-2 py-0.5 ${
          open ? 'text-black' : 'text-neutral-600 hover:text-black'
        }`}
        aria-expanded={open}
        aria-label="Share"
        title="Share"
        onClick={() => setOpen((v) => !v)}
      >
        <IconShare />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-[min(80vh,32rem)] w-80 overflow-y-auto rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <ShareMenuPanel {...shareProps} />
          <div className="my-3 border-t border-neutral-200" />
          <PublishMenuPanel {...publishProps} />
          <div className="my-3 border-t border-neutral-200" />
          <button
            type="button"
            title="View version history and chain"
            className="block w-full py-1.5 text-left text-[12px] font-bold text-stone-800 hover:opacity-70"
            onClick={() => {
              onOpenHistory();
              setOpen(false);
            }}
          >
            Version history
          </button>
        </div>
      )}
    </div>
  );
}
