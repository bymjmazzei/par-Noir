/**
 * Prefer installed Unlock app (custom scheme) before HTTPS web popup.
 */

import { brokerLaunchContextFromUrl, pollBrokerLaunchedOnce } from './brokerLaunched';
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
export function isCapacitorNative(): boolean {
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
 * Open hides the caller page. Cancel is a blur (the dialog) then focus, with the
 * page never hidden. A blur by itself is the dialog, not a choice.
 */
export function unlockDialogDecision(args: {
  nativePlatform: boolean;
  documentHidden: boolean;
  sawBlur: boolean;
  focusedAfterBlur: boolean;
  noDialogTimedOut: boolean;
  /** Desktop browser: Open is a launch claim, not a blur. */
  appLaunched?: boolean;
  claimPollEnabled?: boolean;
  cancelGraceElapsed?: boolean;
}): 'app' | 'web' | 'pending' {
  if (args.nativePlatform || args.documentHidden || args.appLaunched) return 'app';
  if (args.sawBlur && args.focusedAfterBlur) {
    if (args.claimPollEnabled && !args.cancelGraceElapsed) return 'pending';
    return 'web';
  }
  if (args.noDialogTimedOut && !args.sawBlur) return 'web';
  return 'pending';
}

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
 * The page hiding means Open. Blur then focus, still visible, means Cancel.
 * No dialog within waitMs means the app is not installed.
 */
const CANCEL_GRACE_MS = 1000;

export async function tryPreferUnlockApp(
  appUrl: string,
  options?: {
    waitMs?: number;
    cancelGraceMs?: number;
    /** Called in the Cancel focus turn so a later open is not popup-blocked. */
    reserveWebPopup?: () => void;
  }
): Promise<PreferUnlockAppResult> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { opened: false, mode: 'fallback' };
  }
  const waitMs = options?.waitMs ?? DEFAULT_PREFER_APP_WAIT_MS;
  const cancelGraceMs = options?.cancelGraceMs ?? CANCEL_GRACE_MS;
  const nativePlatform = isCapacitorNative();
  const launchCtx = brokerLaunchContextFromUrl(appUrl);

  return new Promise((resolve) => {
    let sawBlur = false;
    let focusedAfterBlur = false;
    let noDialogTimedOut = false;
    let appLaunched = false;
    let cancelGraceElapsed = false;
    let settled = false;
    let noDialogTimer = 0;
    let capTimer = 0;
    let pollTimer = 0;
    let graceTimer = 0;

    const cleanup = () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.clearTimeout(noDialogTimer);
      window.clearTimeout(capTimer);
      window.clearTimeout(graceTimer);
      window.clearInterval(pollTimer);
    };

    const finish = () => {
      if (settled) return;
      const decision = unlockDialogDecision({
        nativePlatform,
        documentHidden: document.hidden,
        sawBlur,
        focusedAfterBlur,
        noDialogTimedOut,
        appLaunched,
        claimPollEnabled: Boolean(launchCtx),
        cancelGraceElapsed,
      });
      if (decision === 'pending') return;
      settled = true;
      cleanup();
      resolve(
        decision === 'app'
          ? { opened: true, mode: 'app' }
          : { opened: false, mode: 'fallback' }
      );
    };

    const pollLaunch = async () => {
      if (!launchCtx || settled) return;
      const launched = await pollBrokerLaunchedOnce(launchCtx);
      if (!launched || settled) return;
      appLaunched = true;
      finish();
    };

    const onVis = () => finish();
    const onBlur = () => {
      sawBlur = true;
      window.clearTimeout(noDialogTimer);
      finish();
    };
    const onFocus = () => {
      if (!sawBlur) return;
      focusedAfterBlur = true;
      if (!launchCtx) {
        try {
          options?.reserveWebPopup?.();
        } catch {
          /* caller reports a blocked popup */
        }
        finish();
        return;
      }
      try {
        options?.reserveWebPopup?.();
      } catch {
        /* caller reports a blocked popup */
      }
      if (graceTimer) return;
      graceTimer = window.setTimeout(() => {
        cancelGraceElapsed = true;
        finish();
      }, cancelGraceMs);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    try {
      triggerCustomScheme(appUrl);
    } catch {
      cleanup();
      resolve({ opened: false, mode: 'fallback' });
      return;
    }

    if (launchCtx) {
      void pollLaunch();
      pollTimer = window.setInterval(() => {
        void pollLaunch();
      }, 1000);
    }

    // Cap iOS often shows "Open in Unlock?" without hiding the caller WebView.
    if (nativePlatform || document.hidden) {
      finish();
      return;
    }

    noDialogTimer = window.setTimeout(() => {
      noDialogTimedOut = true;
      // App not installed: no dialog ever blurred the page. Reserve now.
      // A blur means the OS dialog is still up — do not open the web window yet.
      if (!sawBlur && !document.hidden && !appLaunched) {
        try {
          options?.reserveWebPopup?.();
        } catch {
          /* caller reports a blocked popup */
        }
      }
      finish();
    }, waitMs);
    // Dialog can stay up while the user decides. Do not treat that as Cancel.
    capTimer = window.setTimeout(() => {
      noDialogTimedOut = true;
      sawBlur = false;
      if (!document.hidden && !appLaunched) {
        try {
          options?.reserveWebPopup?.();
        } catch {
          /* caller reports a blocked popup */
        }
      }
      finish();
    }, 120_000);
  });
}

export type LaunchUnlockBrokerOptions = {
  httpsUrl: string;
  preferApp?: boolean;
  waitMs?: number;
  reserveWebPopup?: () => void;
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
  const result = await tryPreferUnlockApp(appUrl, {
    waitMs: options.waitMs,
    reserveWebPopup: options.reserveWebPopup,
  });
  if (result.opened) {
    return { useHttpsPopup: false, httpsUrl: options.httpsUrl, usedApp: true, appUrl };
  }
  return { useHttpsPopup: true, httpsUrl: options.httpsUrl, usedApp: false, appUrl };
}
