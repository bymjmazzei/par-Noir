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
  return Boolean((window as Window & { penDesktop?: unknown }).penDesktop);
}

/** Full-page OAuth (no popup) on Cap or Electron. */
export function penForceOAuthRedirect(): boolean {
  return isCapacitorNative() || isPenDesktop();
}
