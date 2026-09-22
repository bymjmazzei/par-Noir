import { useEffect, useRef, useState } from 'react';

/** Save draft (default) with dropdown: Commit version or Suggest. */
export function SaveMenu({
  canCommit,
  dirty,
  lastDraftAt,
  busy,
  onSaveDraft,
  onCommit,
  onSuggest
}: {
  canCommit: boolean;
  dirty: boolean;
  lastDraftAt: string | null;
  busy?: boolean;
  onSaveDraft: () => void;
  onCommit: () => void;
  onSuggest: () => void;
}) {
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
    <div className="relative flex items-center gap-2" ref={rootRef}>
      {lastDraftAt && (
        <span className="hidden text-[11px] text-neutral-600 sm:inline" title={lastDraftAt}>
          Draft {formatRelative(lastDraftAt)}
          {dirty ? ' · unsaved' : ''}
        </span>
      )}
      <div className="inline-flex items-stretch">
        <button
          type="button"
          disabled={busy}
          className="px-2 py-0.5 text-[13px] font-bold text-black hover:opacity-60 disabled:opacity-40"
          onClick={onSaveDraft}
          title="Save draft"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={busy}
          className="px-1.5 py-0.5 text-[13px] text-neutral-600 hover:text-black disabled:opacity-40"
          aria-expanded={open}
          aria-label="More save options"
          onClick={() => setOpen((v) => !v)}
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[12rem] overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {canCommit ? (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[12px] font-bold text-black hover:bg-neutral-50"
              onClick={() => {
                onCommit();
                setOpen(false);
              }}
            >
              Commit to current version
            </button>
          ) : (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[12px] font-bold text-black hover:bg-neutral-50"
              onClick={() => {
                onSuggest();
                setOpen(false);
              }}
            >
              Suggest
            </button>
          )}
          {canCommit && (
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[12px] text-neutral-600 hover:bg-neutral-50 hover:text-black"
              onClick={() => {
                onSuggest();
                setOpen(false);
              }}
            >
              Suggest instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 8) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}
