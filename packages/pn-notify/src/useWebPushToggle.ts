import { useCallback, useEffect, useState } from 'react';
import {
  getWebPushSubscription,
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
  type WebPushOptions,
  type WebPushResult,
} from './client';

export interface WebPushToggleState {
  supported: boolean;
  enabled: boolean;
  busy: boolean;
  /** Last subscribe outcome other than success, for a short inline hint. */
  problem: Exclude<WebPushResult, 'subscribed'> | null;
  toggle: () => Promise<void>;
}

export function useWebPushToggle(opts: WebPushOptions): WebPushToggleState {
  const supported = isWebPushSupported();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<WebPushToggleState['problem']>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void getWebPushSubscription().then((sub) => {
      if (!cancelled) setEnabled(Boolean(sub) && Notification.permission === 'granted');
    });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const { apiEndpoint, getAccessToken, appId, categories, swUrl } = opts;
  const toggle = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await unsubscribeWebPush({ apiEndpoint, getAccessToken });
        setEnabled(false);
        setProblem(null);
      } else {
        const result = await subscribeWebPush({ apiEndpoint, getAccessToken, appId, categories, swUrl });
        setEnabled(result === 'subscribed');
        setProblem(result === 'subscribed' ? null : result);
      }
    } catch {
      setProblem('failed');
    } finally {
      setBusy(false);
    }
  }, [supported, busy, enabled, apiEndpoint, getAccessToken, appId, categories, swUrl]);

  return { supported, enabled, busy, problem, toggle };
}

export function webPushProblemText(problem: WebPushToggleState['problem']): string | null {
  switch (problem) {
    case 'denied':
      return 'Notifications are blocked in your browser settings.';
    case 'unsupported':
      return 'This browser does not support notifications.';
    case 'unconfigured':
      return 'Notifications are not available yet.';
    case 'failed':
      return 'Could not turn on notifications. Try again.';
    default:
      return null;
  }
}
