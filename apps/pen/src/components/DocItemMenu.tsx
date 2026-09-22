import { useEffect, useRef, useState } from 'react';

/** ⋯ menu for library rows / gallery tiles. */
export function DocItemMenu({
  onRename,
  onMove,
  onDelete,
  folders,
  showMove = true
}: {
  onRename: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  folders: Array<{ id: string; name: string }>;
  showMove?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMoveOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title="More"
        aria-label="More actions"
        aria-expanded={open}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-neutral-600 hover:text-black"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
          setMoveOpen(false);
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] text-black hover:bg-neutral-50"
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            Rename
          </button>
          {showMove && (
            <>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-black hover:bg-neutral-50"
                onClick={() => setMoveOpen((v) => !v)}
              >
                Move to… {moveOpen ? '▾' : '▸'}
              </button>
              {moveOpen && (
                <div className="border-t border-neutral-100 py-1">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[12px] text-neutral-600 hover:bg-neutral-50 hover:text-black"
                    onClick={() => {
                      onMove(null);
                      setOpen(false);
                    }}
                  >
                    My Library (root)
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-[12px] text-black hover:bg-neutral-50"
                      onClick={() => {
                        onMove(f.id);
                        setOpen(false);
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="my-1 border-t border-neutral-100" />
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[12px] font-bold text-red-600 hover:bg-neutral-50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
