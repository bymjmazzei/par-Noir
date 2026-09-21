/**
 * Resume Cap prefer-app OAuth after cold start / oauth/resume deep link.
 * Does not steal OS focus — only runs inside the Cap WebView.
 */

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  pollStashedPreferAppBrokerOnce,
  pushPnOAuthDebug,
  readPreferAppBrokerWait,
  wakePreferAppBrokerPoll,
} from '@par-noir/oauth-ui';
import { isOAuthPopupUnlockActive } from './oauthCallbackGate';

export type PreferAppResumePayload = {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  granted_data_points?: string;
  consent_shown?: string;
  messagingHandoff?: unknown;
};

/**
 * If a durable prefer-app wait exists and no live popup waiter is active,
 * poll broker-pending once and return the payload for runOAuthCallback.
 */
export async function tryResumePreferAppBroker(): Promise<PreferAppResumePayload | null> {
  // Cap custom-scheme resume does not always fire document.visibilitychange.
  // Always wake the live startPnOAuthPopup poll when a wait is stashed.
  if (readPreferAppBrokerWait()) {
    wakePreferAppBrokerPoll();
  }
  // If the live waiter is still active, do NOT consume broker-pending here —
  // that race unlocks briefly then the empty popup result calls setLocked again.
  // The wake event above is the Cap path; cold-start (no live waiter) polls below.
  if (isOAuthPopupUnlockActive()) {
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

/** Cap: appUrlOpen (oauth/resume) + appStateChange + visibility → try resume. */
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

  const onVis = () => {
    if (!document.hidden) run();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', run);
  // Cold start
  queueMicrotask(run);

  const unsubs: Array<() => void> = [];
  if (Capacitor.isNativePlatform()) {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) run();
    }).then((h) => {
      unsubs.push(() => {
        void h.remove();
      });
    });
    void CapApp.addListener('appUrlOpen', ({ url }) => {
      if (/oauth\/resume/i.test(url || '')) run();
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
