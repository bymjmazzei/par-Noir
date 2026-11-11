import { useCallback, useRef, useState } from 'react';
import { AnchoredPanel } from './AnchoredPanel';

/** ⋮ menu for library rows / gallery tiles. Portaled so overflow parents cannot clip it. */
export function DocItemMenu({
  onRename,
  onMove,
  onDelete,
  folders,
  showMove = true,
  preferAbove = false
}: {
  onRename: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
  folders: Array<{ id: string; name: string }>;
  showMove?: boolean;
  /** Gallery tiles: open above the trigger. */
  preferAbove?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setMoveOpen(false);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title="More"
        aria-label="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[15px] leading-none text-neutral-600 hover:text-black"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
          setMoveOpen(false);
        }}
      >
        ⋮
      </button>
      <AnchoredPanel
        open={open}
        anchorRef={rootRef}
        onClose={close}
        align="end"
        preferAbove={preferAbove}
        role="menu"
        className="pen-doc-item-menu-panel"
      >
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            role="menuitem"
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
                role="menuitem"
                className="block w-full px-3 py-1.5 text-left text-[12px] text-black hover:bg-neutral-50"
                onClick={() => setMoveOpen((v) => !v)}
              >
                Move to… {moveOpen ? '▾' : '▸'}
              </button>
              {moveOpen && (
                <div className="border-t border-neutral-100 py-1">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1.5 text-left text-[12px] text-neutral-600 hover:bg-neutral-50 hover:text-black"
                    onClick={() => {
                      onMove(null);
                      setOpen(false);
                    }}
                  >
                    My Library
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="menuitem"
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
            role="menuitem"
            className="block w-full px-3 py-1.5 text-left text-[12px] font-bold text-red-600 hover:bg-neutral-50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      </AnchoredPanel>
    </div>
  );
}
