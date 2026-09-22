import { useEffect, useRef, useState } from 'react';

/**
 * Publish = update live current/ in Pen.
 * Connect to feed = separate social visibility step.
 */
export function PublishMenu({
  projectEnabled,
  onPublishLive,
  onConnectFeed,
  onTemplate,
  onLibraryTemplate,
  onFinishedWork
}: {
  projectEnabled: boolean;
  onPublishLive: () => void;
  onConnectFeed: () => void;
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
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[14rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
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
            title="Make the live version visible on your social feed (separate from Publish live)"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-stone-800 hover:bg-stone-50"
            onClick={() => {
              onConnectFeed();
              setOpen(false);
            }}
          >
            Connect to feed
          </button>
          <div className="my-1 border-t border-stone-100" />
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
