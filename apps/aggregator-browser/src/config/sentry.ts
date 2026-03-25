/**
 * Optional browser error reporting. Enabled in production when VITE_SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/react';

let enabled = false;

export function initBrowserSentry(): void {
  if (!import.meta.env.PROD) {
    return;
  }
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const trimmed = typeof dsn === 'string' ? dsn.trim() : '';
  if (!trimmed) {
    return;
  }
  const tracesSampleRate = Math.min(
    1,
    Math.max(0, parseFloat(String(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0')) || 0)
  );
  Sentry.init({
    dsn: trimmed,
    environment: import.meta.env.MODE || 'production',
    tracesSampleRate,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          u.search = '';
          event.request.url = u.toString();
        } catch {
          /* ignore */
        }
      }
      return event;
    }
  });
  enabled = true;
}

export function captureReactError(error: unknown, componentStack?: string): void {
  if (!enabled) {
    return;
  }
  Sentry.captureException(error, { extra: componentStack ? { componentStack } : undefined });
}
