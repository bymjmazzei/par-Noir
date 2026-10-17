import { useEffect, useRef, useState } from 'react';
import { IconChevron, IconPublish } from './icons/PenIcons';
import { PublishMenuPanel, type PublishMenuPanelProps } from './PublishMenuPanel';

/**
 * Share to feeds / private template / project library paths. Doc version: Save → Commit.
 * Browse/networks: all unlocked users. Public templates + licensing: verified only.
 */
export function PublishMenu(props: PublishMenuPanelProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

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
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[15rem] overflow-hidden rounded-md border border-stone-200 bg-white px-3 py-2 shadow-lg">
          <PublishMenuPanel {...props} onRequestClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export type PenAggregatorTarget = string;
