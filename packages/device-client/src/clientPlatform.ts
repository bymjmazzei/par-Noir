/**
 * Whether this install may register / hold a device signing key.
 * Web browsers: false. Capacitor mobile / Electron desktop: true.
 */

export type PnClientPlatform = 'web' | 'native-mobile' | 'native-desktop';

export function detectClientPlatform(): PnClientPlatform {
  if (typeof window === 'undefined') return 'web';
  try {
    const w = window as Window & {
      parNoirDesktop?: unknown;
      Capacitor?: { isNativePlatform?: () => boolean };
    };
    if (w.parNoirDesktop) return 'native-desktop';
    const Cap = w.Capacitor;
    if (Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform()) {
      return 'native-mobile';
    }
  } catch {
    /* ignore */
  }
  return 'web';
}

export function isKeyableClient(): boolean {
  const p = detectClientPlatform();
  return p === 'native-mobile' || p === 'native-desktop';
}

/** Header value for API device register gating. */
export function clientPlatformHeaderValue(): PnClientPlatform {
  return detectClientPlatform();
}
