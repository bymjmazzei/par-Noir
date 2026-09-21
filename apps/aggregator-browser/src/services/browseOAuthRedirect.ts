/**
 * Single redirect_uri for browse/messaging OAuth token exchange (must match authorize request).
 *
 * Cap native WebViews use origin `capacitor://localhost`, which is not a registered
 * OAuth redirect. Prefer the deployed HTTPS callback so authenticate + token exchange
 * validate against seeded messaging-app / browser-app redirect_uris.
 */

import { MESSAGING_ONLY } from '../config/buildFlags';

const DEFAULT_BROWSE_ORIGIN = 'https://browse.parnoir.com';
const DEFAULT_MESSAGING_ORIGIN = 'https://messaging.parnoir.com';

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (
      window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
  } catch {
    return false;
  }
}

function nativeOAuthOrigin(): string {
  const env = import.meta.env as ImportMetaEnv & {
    VITE_MESSAGING_ORIGIN?: string;
    VITE_BROWSE_ORIGIN?: string;
  };
  if (MESSAGING_ONLY) {
    return (env.VITE_MESSAGING_ORIGIN || DEFAULT_MESSAGING_ORIGIN).replace(/\/$/, '');
  }
  return (env.VITE_BROWSE_ORIGIN || DEFAULT_BROWSE_ORIGIN).replace(/\/$/, '');
}

export function browseOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '/oauth-callback.html';
  if (isCapacitorNative()) {
    return `${nativeOAuthOrigin()}/oauth-callback.html`;
  }
  return `${window.location.origin}/oauth-callback.html`.replace(/\/$/, '');
}
