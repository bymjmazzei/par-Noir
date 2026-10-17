import { useEffect, useRef, useState } from 'react';
import { IconShare } from './icons/PenIcons';
import { ShareMenuPanel, type ShareMenuPanelProps } from './ShareMenuPanel';

/** Invite collaborators by connections, doc link, or pn id. */
export function ShareMenu(props: ShareMenuPanelProps) {
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
          <ShareMenuPanel {...props} />
        </div>
      )}
    </div>
  );
}
