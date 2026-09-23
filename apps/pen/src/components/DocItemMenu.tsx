import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type MenuPlacement = 'above' | 'below';

type MenuCoords = { top: number; left: number; placement: MenuPlacement };

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
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function measure(): MenuCoords | null {
    const btn = btnRef.current;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const menuW = menuRef.current?.offsetWidth || 160;
    const menuH = menuRef.current?.offsetHeight || 140;
    const gap = 4;
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    let placement: MenuPlacement = preferAbove ? 'above' : 'below';
    if (preferAbove && spaceAbove < menuH + gap && spaceBelow > spaceAbove) {
      placement = 'below';
    } else if (!preferAbove && spaceBelow < menuH + gap && spaceAbove > spaceBelow) {
      placement = 'above';
    }
    let left = r.right - menuW;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    if (placement === 'above') {
      return { top: r.top - gap, left, placement };
    }
    return { top: r.bottom + gap, left, placement };
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const next = measure();
    if (next) setCoords(next);
    // Remeasure after paint once menu DOM exists (accurate height/width).
    const id = window.requestAnimationFrame(() => {
      const refined = measure();
      if (refined) setCoords(refined);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, moveOpen, preferAbove]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setMoveOpen(false);
    };
    const onReposition = () => {
      const next = measure();
      if (next) setCoords(next);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, preferAbove, moveOpen]);

  const panel =
    open && coords
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="pen-doc-item-menu-panel"
            style={
              coords.placement === 'above'
                ? {
                    position: 'fixed',
                    bottom: window.innerHeight - coords.top,
                    left: coords.left,
                    zIndex: 80
                  }
                : {
                    position: 'fixed',
                    top: coords.top,
                    left: coords.left,
                    zIndex: 80
                  }
            }
            onClick={(e) => e.stopPropagation()}
          >
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
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={btnRef}
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
      {panel}
    </div>
  );
}
