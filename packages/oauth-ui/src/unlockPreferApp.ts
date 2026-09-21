/**
 * Prefer installed Unlock app (custom scheme) before HTTPS web popup.
 */

import { UNLOCK_CUSTOM_SCHEME } from './consentUnlock/constants';

const DEFAULT_PREFER_APP_WAIT_MS = 1400;

function envPreferAppEnabled(): boolean {
  try {
    const env =
      typeof import.meta !== 'undefined'
        ? (import.meta as ImportMeta & { env?: Record<string, string> }).env
        : undefined;
    if (env?.VITE_UNLOCK_PREFER_APP === '0' || env?.VITE_UNLOCK_PREFER_APP === 'false') {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/** Capacitor WKWebView / native shell — do not import @capacitor/core from oauth-ui. */
function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (
      window as Window & {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
  } catch {
    return false;
  }
}

/** True when already running inside the Unlock broker (web host / Electron flag). */
export function isRunningInsideUnlockBroker(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as Window & { __PN_UNLOCK_DESKTOP__?: boolean }).__PN_UNLOCK_DESKTOP__) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const h = window.location.hostname.toLowerCase();
    if (h === 'unlock.parnoir.com') return true;
    if ((h === 'localhost' || h === '127.0.0.1') && window.location.port === '5178') return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Map HTTPS consent URL → custom-scheme URL (same query).
 * Forces popup=false so completion uses redirect_uri across OS processes.
 */
export function httpsConsentUrlToAppUrl(httpsUrl: string): string {
  const u = new URL(httpsUrl);
  u.searchParams.set('popup', 'false');
  return `${UNLOCK_CUSTOM_SCHEME}://oauth/consent?${u.searchParams.toString()}`;
}

export type PreferUnlockAppResult =
  | { opened: true; mode: 'app' }
  | { opened: false; mode: 'fallback' };

/**
 * Fire custom-scheme navigation without an iframe.
 * Browse CSP is `frame-src 'self'`, so iframe loads of `com.parnoir.unlock://…`
 * are blocked (DevTools: Framing '' violates frame-src) and prefer-app never runs.
 */
function triggerCustomScheme(appUrl: string): void {
  const a = document.createElement('a');
  a.href = appUrl;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Attempt to open the Unlock app via custom scheme.
 * If the page loses visibility within waitMs, assume the app took over.
 */
export async function tryPreferUnlockApp(
  appUrl: string,
  options?: { waitMs?: number }
): Promise<PreferUnlockAppResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { opened: false, mode: 'fallback' };
  }
  const waitMs = options?.waitMs ?? DEFAULT_PREFER_APP_WAIT_MS;

  let sawHide = document.hidden;
  const onVis = () => {
    if (document.hidden) sawHide = true;
  };
  const onBlur = () => {
    sawHide = true;
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', onBlur);

  try {
    triggerCustomScheme(appUrl);
  } catch {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
    return { opened: false, mode: 'fallback' };
  }

  // Cap iOS often shows "Open in Unlock?" without hiding the caller WebView, so
  // visibility never flips — still treat as prefer-app so callers poll broker-pending
  // instead of navigating the Cap shell to unlock.parnoir.com.
  if (isCapacitorNative()) {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('blur', onBlur);
    return { opened: true, mode: 'app' };
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, waitMs);
  });

  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('blur', onBlur);

  if (sawHide || document.hidden) {
    return { opened: true, mode: 'app' };
  }
  return { opened: false, mode: 'fallback' };
}

export type LaunchUnlockBrokerOptions = {
  httpsUrl: string;
  preferApp?: boolean;
  waitMs?: number;
};

/**
 * Prefer Unlock app, else signal caller to open httpsUrl as a popup.
 */
export async function launchUnlockBroker(
  options: LaunchUnlockBrokerOptions
): Promise<{ useHttpsPopup: boolean; httpsUrl: string; usedApp: boolean; appUrl: string }> {
  const appUrl = httpsConsentUrlToAppUrl(options.httpsUrl);
  const prefer =
    options.preferApp !== false && envPreferAppEnabled() && !isRunningInsideUnlockBroker();
  if (!prefer) {
    return { useHttpsPopup: true, httpsUrl: options.httpsUrl, usedApp: false, appUrl };
  }
  const result = await tryPreferUnlockApp(appUrl, { waitMs: options.waitMs });
  if (result.opened) {
    return { useHttpsPopup: false, httpsUrl: options.httpsUrl, usedApp: true, appUrl };
  }
  return { useHttpsPopup: true, httpsUrl: options.httpsUrl, usedApp: false, appUrl };
}
