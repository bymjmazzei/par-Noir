/**
 * OAuth redirect_uri for Pen web / Cap / Electron.
 * Must match seeded pen-app redirect_uris in api clientRegistration.
 */

import { isCapacitorNative, isPenDesktop } from './penPlatform';

const DESKTOP_REDIRECT = 'com.parnoir.pen://oauth-callback';
const CAP_HTTPS_REDIRECT = 'https://localhost/oauth-callback.html';
const CAP_SCHEME_REDIRECT = 'capacitor://localhost/oauth-callback.html';

function isOpaqueOrFileOrigin(origin: string): boolean {
  return !origin || origin === 'null' || origin.startsWith('file:');
}

export function penOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '/oauth-callback.html';

  if (isPenDesktop() || isOpaqueOrFileOrigin(window.location.origin)) {
    return DESKTOP_REDIRECT;
  }

  if (isCapacitorNative()) {
    // capacitor.config.json uses androidScheme: "https"
    const origin = window.location.origin;
    if (origin === 'https://localhost' || origin === 'http://localhost') {
      return CAP_HTTPS_REDIRECT;
    }
    if (origin.startsWith('capacitor:') || origin.startsWith('ionic:')) {
      return CAP_SCHEME_REDIRECT;
    }
    return CAP_HTTPS_REDIRECT;
  }

  return `${window.location.origin}/oauth-callback.html`.replace(/\/$/, '');
}
