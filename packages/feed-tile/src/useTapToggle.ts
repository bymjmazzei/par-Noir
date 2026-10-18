import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

export const TAP_SLOP_PX = 8;

/** Action objects keep their own taps: Pen buttons and inputs, engagement rail, captions. */
const TAP_IGNORE_SELECTOR =
  'button, a, input, textarea, select, [data-pen-behavior], [data-pen-scrub], [data-no-tap-toggle], .feed-engagement-rail';

/**
 * Pointer-down handler that calls `onTap` for a tap on empty media space.
 * A drag past the slop or a pointercancel (the browser took the scroll) is not a tap.
 */
export function useTapToggle(
  onTap: () => void,
  opts: { enabled?: boolean; blocked?: () => boolean } = {}
): (e: ReactPointerEvent) => void {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const enabledRef = useRef(opts.enabled !== false);
  enabledRef.current = opts.enabled !== false;
  const blockedRef = useRef(opts.blocked);
  blockedRef.current = opts.blocked;

  return useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    if (!enabledRef.current || blockedRef.current?.()) return;
    const target = e.target;
    const host = e.currentTarget;
    if (target instanceof Element) {
      const hit = target.closest(TAP_IGNORE_SELECTOR);
      if (hit && host instanceof Element && host.contains(hit)) return;
    }

    const originX = e.clientX;
    const originY = e.clientY;
    let moved = false;

    const detach = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', detach, true);
    };
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - originX, ev.clientY - originY) > TAP_SLOP_PX) {
        moved = true;
      }
    };
    const onUp = () => {
      detach();
      if (moved || blockedRef.current?.()) return;
      if (!enabledRef.current) return;
      onTapRef.current();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', detach, true);
  }, []);
}
