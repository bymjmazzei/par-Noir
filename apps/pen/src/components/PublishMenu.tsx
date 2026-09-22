import { useEffect, useRef, useState } from 'react';

/** Publish destinations. Library is a template/doc category — not a publish channel. */
export function PublishMenu({
  projectEnabled,
  onSocial,
  onTemplate,
  onLibraryTemplate,
  onFinishedWork
}: {
  /** Project docs unlock Library-template + finished-work outcomes. */
  projectEnabled: boolean;
  onSocial: () => void;
  onTemplate: () => void;
  onLibraryTemplate: () => void;
  onFinishedWork: () => void;
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
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded px-2 py-0.5 hover:bg-stone-200"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Publish ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[13rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              onSocial();
              setOpen(false);
            }}
          >
            Social
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              onTemplate();
              setOpen(false);
            }}
          >
            As template
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
