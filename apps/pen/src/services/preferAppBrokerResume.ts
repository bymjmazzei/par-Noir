/**
 * Resume Cap/Electron prefer-app OAuth after oauth/resume deep link or foreground.
 * Live startPnOAuthPopup polls wake via PN_PREFER_APP_RESUME_WAKE_EVENT;
 * cold start (no live waiter) polls broker-pending once from localStorage.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  isPreferAppBrokerPollLive,
  pollStashedPreferAppBrokerOnce,
  pushPnOAuthDebug,
  readPreferAppBrokerWait,
  wakePreferAppBrokerPoll,
} from '@par-noir/oauth-ui';

export type PreferAppResumePayload = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  granted_data_points?: string;
  consent_shown?: string;
  messagingHandoff?: unknown;
};

type PenDesktopDeepLinkApi = {
  onDeepLink: (handler: (url: string) => void) => () => void;
  getPendingDeepLink?: () => Promise<string | null>;
};

function penDesktopApi(): PenDesktopDeepLinkApi | null {
  if (typeof window === 'undefined') return null;
  return (window as Window & { penDesktop?: PenDesktopDeepLinkApi }).penDesktop ?? null;
}

export async function tryResumePreferAppBroker(): Promise<PreferAppResumePayload | null> {
  if (readPreferAppBrokerWait()) {
    wakePreferAppBrokerPoll();
  }
  if (isPreferAppBrokerPollLive()) {
    pushPnOAuthDebug('prefer_app_resume_wake_live_waiter', {});
    return null;
  }
  if (!readPreferAppBrokerWait()) return null;
  pushPnOAuthDebug('prefer_app_resume_attempt', {});
  const data = await pollStashedPreferAppBrokerOnce();
  if (!data) return null;
  return {
    code: data.code,
    state: data.state,
    error: data.error,
    error_description: data.error_description,
    granted_data_points: data.granted_data_points,
    consent_shown: data.consent_shown,
    messagingHandoff: data.messagingHandoff,
  };
}

/** Cap appUrlOpen + Electron pen:deep-link + visibility → try resume. */
export function installPreferAppBrokerResume(
  onPayload: (payload: PreferAppResumePayload) => void | Promise<void>
): () => void {
  let cancelled = false;
  let inflight = false;

  const run = () => {
    if (cancelled || inflight) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    inflight = true;
    void tryResumePreferAppBroker()
      .then((payload) => {
        if (cancelled || !payload) return;
        return onPayload(payload);
      })
      .finally(() => {
        inflight = false;
      });
  };

  const onResumeUrl = (url: string) => {
    if (/oauth\/resume/i.test(url || '')) run();
  };

  const onVis = () => {
    if (!document.hidden) run();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', run);
  queueMicrotask(run);

  const unsubs: Array<() => void> = [];

  const desktop = penDesktopApi();
  if (desktop) {
    unsubs.push(desktop.onDeepLink(onResumeUrl));
    void desktop.getPendingDeepLink?.().then((url) => {
      if (url) onResumeUrl(url);
    });
  }

  if (Capacitor.isNativePlatform()) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) run();
    }).then((h) => {
      unsubs.push(() => {
        void h.remove();
      });
    });
    void CapApp.addListener('appUrlOpen', ({ url }) => {
      onResumeUrl(url || '');
    }).then((h) => {
      unsubs.push(() => {
        void h.remove();
      });
    });
  }

  return () => {
    cancelled = true;
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', run);
    for (const u of unsubs) u();
  };
}
