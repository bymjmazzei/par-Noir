import { useEffect, useRef, useState } from 'react';
import { listPendingInvites } from '../services/penCollab';
import type { PenRole } from '@par-noir/pen-protocol';

/** Invite collaborators by pn with role — browse-style group invite under the hood. */
export function ShareMenu({
  docId,
  invitePn,
  onInvitePnChange,
  onInvite,
  inviteRole,
  onInviteRoleChange,
  canInvite
}: {
  docId: string;
  invitePn: string;
  onInvitePnChange: (value: string) => void;
  onInvite: () => void;
  inviteRole: PenRole;
  onInviteRoleChange: (role: PenRole) => void;
  canInvite: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={`px-2 py-0.5 text-[13px] ${
          open ? 'font-bold text-black' : 'text-neutral-600 hover:text-black'
        }`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Share
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
            Collaborate
          </p>
          <p className="mb-2 text-[12px] text-neutral-600">
            Invite by pN. Roles: collaborator (edit + invite), commentor (suggest), viewer (read).
          </p>
          {!canInvite && (
            <p className="mb-2 text-[12px] text-red-700">You do not have permission to invite.</p>
          )}
          <div className="mb-2 flex gap-2">
            <select
              className="border border-neutral-300 px-2 py-1 text-sm"
              value={inviteRole}
              disabled={!canInvite}
              onChange={(e) => onInviteRoleChange(e.target.value as PenRole)}
            >
              <option value="collaborator">Collaborator</option>
              <option value="commentor">Commentor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
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
