import { useEffect, useRef, useState } from 'react';
import { listPendingInvites } from '../services/penCollab';

/** Invite collaborators by pn — primary share entry (not buried under History). */
export function ShareMenu({
  docId,
  invitePn,
  onInvitePnChange,
  onInvite
}: {
  docId: string;
  invitePn: string;
  onInvitePnChange: (value: string) => void;
  onInvite: () => void;
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
        <div className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-600">
            Collaborate
          </p>
          <p className="mb-2 text-[12px] text-neutral-600">
            Invite another pN to this document. They can suggest edits; owners commit versions.
          </p>
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-black"
              placeholder="Invite pn…"
              value={invitePn}
              onChange={(e) => onInvitePnChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onInvite();
              }}
            />
            <button
              type="button"
              className="shrink-0 px-2 py-1 text-sm font-bold text-black hover:opacity-60"
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
                  <span className="ml-2 text-neutral-600">pending</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
