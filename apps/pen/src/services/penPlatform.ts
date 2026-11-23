/**
 * Detect Cap / Electron shells for Pen.
 */

export function isCapacitorNative(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
  } catch {
    return false;
  }
}

export function isPenDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { penDesktop?: unknown; __PN_PEN_DESKTOP__?: boolean };
  return Boolean(w.penDesktop || w.__PN_PEN_DESKTOP__);
}

/** Full-page OAuth (no popup) on Cap or Electron. */
export function penForceOAuthRedirect(): boolean {
  return isCapacitorNative() || isPenDesktop();
}
