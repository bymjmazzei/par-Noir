/**
 * Optional Sentry for API error reporting. Enabled when SENTRY_DSN is set.
 * Does not log request bodies or auth headers.
 */
import type { Request } from 'express';
import * as Sentry from '@sentry/node';

let initialized = false;

export function initApiSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn || initialized) {
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Math.min(1, Math.max(0, parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0') || 0)),
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          const h = { ...event.request.headers };
          delete h.authorization;
          delete h['x-api-key'];
          event.request.headers = h;
        }
      }
      return event;
    },
  });
  initialized = true;
}

export function captureApiRouteError(err: unknown, req: Request): void {
  if (!process.env.SENTRY_DSN?.trim()) {
    return;
  }
  Sentry.withScope((scope) => {
    scope.setTag('path', req.path);
    scope.setTag('method', req.method);
    const rid = req.headers['x-request-id'];
    if (typeof rid === 'string' && rid) {
      scope.setTag('request_id', rid);
    }
    Sentry.captureException(err);
  });
}
