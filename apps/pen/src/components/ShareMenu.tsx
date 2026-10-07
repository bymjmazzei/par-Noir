import { useEffect, useRef, useState } from 'react';
import { listPendingInvites } from '../services/penCollab';
import type { PenRole } from '@par-noir/pen-protocol';
import type { Connection } from '@par-noir/social-connections';
import { IconShare } from './icons/PenIcons';

type ShareTab = 'connections' | 'link' | 'pn';

/** Invite collaborators by connections, doc link, or pn id. */
export function ShareMenu({
  docId,
  invitePn,
  onInvitePnChange,
  onInvite,
  inviteRole,
  onInviteRoleChange,
  canInvite,
  connections,
  connectionsLoading,
  selectedConnectionPns,
  onToggleConnection,
  onInviteConnections,
  joinLink,
  joinLinkLoading,
  onCreateJoinLink,
  onCopyJoinLink
}: {
  docId: string;
  invitePn: string;
  onInvitePnChange: (value: string) => void;
  onInvite: () => void;
  inviteRole: PenRole;
  onInviteRoleChange: (role: PenRole) => void;
  canInvite: boolean;
  connections: Connection[];
  connectionsLoading: boolean;
  selectedConnectionPns: string[];
  onToggleConnection: (peerPn: string) => void;
  onInviteConnections: () => void;
  joinLink: string | null;
  joinLinkLoading: boolean;
  onCreateJoinLink: () => void;
  onCopyJoinLink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ShareTab>('connections');
  const rootRef = useRef<HTMLDivElement>(null);
  const invites = listPendingInvites(docId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const roleSelect = (
    <select
      className="w-full border border-neutral-300 px-2 py-1 text-sm"
      value={inviteRole}
      disabled={!canInvite}
      onChange={(e) => onInviteRoleChange(e.target.value as PenRole)}
    >
      <option value="collaborator">Collaborator</option>
      <option value="commentor">Commentor</option>
      <option value="viewer">Viewer</option>
    </select>
  );

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
        <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
            Collaborate
          </p>
          {!canInvite && (
            <p className="mb-2 text-[12px] text-red-700">You do not have permission to invite.</p>
          )}
          <div className="mb-2 flex gap-1 text-[11px] font-bold uppercase">
            {(['connections', 'link', 'pn'] as ShareTab[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`flex-1 border px-1 py-1 ${
                  tab === key ? 'border-black bg-neutral-100 text-black' : 'border-neutral-200 text-neutral-600'
                }`}
                onClick={() => setTab(key)}
              >
                {key === 'connections' ? 'Connections' : key === 'link' ? 'Link' : 'By pN'}
              </button>
            ))}
          </div>
          <div className="mb-2">{roleSelect}</div>

          {tab === 'connections' && (
            <div>
              <p className="mb-2 text-[12px] text-neutral-600">
                Invite accepted connections (multi-select).
              </p>
              {connectionsLoading ? (
                <p className="text-[12px] text-neutral-500">Loading connections…</p>
              ) : connections.length === 0 ? (
                <p className="text-[12px] text-neutral-500">No connections yet.</p>
              ) : (
                <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto border border-neutral-100 p-2">
                  {connections.map((c) => {
                    const peer = c.userPnIdentifier;
                    const checked = selectedConnectionPns.includes(peer);
                    return (
                      <li key={c.connectionId}>
                        <label className="flex cursor-pointer items-center gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canInvite}
                            onChange={() => onToggleConnection(peer)}
                          />
                          <span className="truncate">{peer}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button
                type="button"
                className="w-full px-2 py-1 text-sm font-bold text-black hover:opacity-60 disabled:opacity-40"
                disabled={!canInvite || selectedConnectionPns.length === 0}
                onClick={onInviteConnections}
              >
                Invite selected
              </button>
            </div>
          )}

          {tab === 'link' && (
            <div>
              <p className="mb-2 text-[12px] text-neutral-600">
                Anyone with the link can request access (no connection required).
              </p>
              <button
                type="button"
                className="mb-2 w-full border border-black px-2 py-1 text-sm font-bold disabled:opacity-40"
                disabled={!canInvite || joinLinkLoading}
                onClick={onCreateJoinLink}
              >
                {joinLinkLoading ? 'Creating…' : 'Create link'}
              </button>
              {joinLink && (
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 border border-neutral-300 px-2 py-1 text-[11px]"
                    readOnly
                    value={joinLink}
                  />
                  <button
                    type="button"
                    className="shrink-0 px-2 py-1 text-sm font-bold"
                    onClick={onCopyJoinLink}
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'pn' && (
            <div>
              <p className="mb-2 text-[12px] text-neutral-600">Invite by pN id (advanced).</p>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-black"
                  placeholder="Invite pn…"
                  value={invitePn}
                  disabled={!canInvite}
                  onChange={(e) => onInvitePnChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canInvite) onInvite();
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 px-2 py-1 text-sm font-bold text-black hover:opacity-60 disabled:opacity-40"
                  disabled={!canInvite}
                  onClick={onInvite}
                >
                  Invite
                </button>
              </div>
            </div>
          )}

          {invites.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-2">
              {invites.map((pn) => (
                <li key={pn} className="truncate text-[12px] text-black">
                  {pn}
                  <span className="ml-2 text-neutral-600">invited</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
