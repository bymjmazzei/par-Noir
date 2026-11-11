import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from 'react';
import { createPortal } from 'react-dom';

type Coords = { top: number; left: number; above: boolean };

const GAP_PX = 4;
const EDGE_PX = 8;

/**
 * Popup anchored to a trigger. Portaled to the body with fixed position so
 * overflow-hidden columns and neighbouring panels cannot clip or cover it.
 */
export function AnchoredPanel({
  open,
  anchorRef,
  onClose,
  children,
  className,
  align = 'start',
  preferAbove = false,
  role
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Line the panel up with the trigger's left (start) or right (end) edge. */
  align?: 'start' | 'end';
  preferAbove?: boolean;
  role?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  function measure(): Coords | null {
    const anchor = anchorRef.current;
    if (!anchor) return null;
    const r = anchor.getBoundingClientRect();
    const w = panelRef.current?.offsetWidth || 180;
    const h = panelRef.current?.offsetHeight || 160;
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    let above = preferAbove;
    if (preferAbove && spaceAbove < h + GAP_PX && spaceBelow > spaceAbove) above = false;
    else if (!preferAbove && spaceBelow < h + GAP_PX && spaceAbove > spaceBelow) above = true;
    const rawLeft = align === 'end' ? r.right - w : r.left;
    const left = Math.max(EDGE_PX, Math.min(rawLeft, window.innerWidth - w - EDGE_PX));
    return { top: above ? r.top - GAP_PX : r.bottom + GAP_PX, left, above };
  }

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    setCoords(measure());
    const id = window.requestAnimationFrame(() => setCoords(measure()));
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, align, preferAbove]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const reposition = () => setCoords(measure());
    const grows = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (panelRef.current) grows?.observe(panelRef.current);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      grows?.disconnect();
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRef, align, preferAbove]);

  if (!open || typeof document === 'undefined') return null;
  const style: CSSProperties = coords
    ? coords.above
      ? { position: 'fixed', bottom: window.innerHeight - coords.top, left: coords.left, zIndex: 1000 }
      : { position: 'fixed', top: coords.top, left: coords.left, zIndex: 1000 }
    : { position: 'fixed', top: 0, left: 0, zIndex: 1000, visibility: 'hidden' };
  return createPortal(
    <div ref={panelRef} role={role} className={className} style={style}>
      {children}
    </div>,
    document.body
  );
}
