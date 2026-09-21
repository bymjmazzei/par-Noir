/**
 * L5 must not call first-party product APIs (messages, mailbox, connections, groups, …).
 * Mount early so Express runs this before route handlers on those prefixes.
 *
 * Engagement: public *reads* (stats/comments/metrics/bulk-stats) skip Bearer so locked
 * browse can populate the engagement bar; mutations stay first-party-only.
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { requireFirstPartyOAuthClient } from './deviceCapabilityService';

/** Path prefixes reserved for first-party OAuth clients only. */
export const L5_PRODUCT_ROUTE_PREFIXES = [
  '/api/messages',
  '/api/mailbox',
  '/api/connections',
  '/api/groups',
  '/api/engagement',
  '/api/notifications',
  '/api/push',
] as const;

/**
 * Public engagement reads — no Bearer required (locked browse / anonymous).
 * Mutations and viewer-private GETs still require first-party OAuth.
 *
 * Profile activity (`GET …/user/:pn`) is public server-cache data so anyone can
 * open a creator's Me page; likes/comments mutations stay first-party.
 */
export function isPublicEngagementRead(method: string, pathOrUrl: string): boolean {
  const raw = String(pathOrUrl || '').split('?')[0];
  const full = raw.startsWith('/api/engagement')
    ? raw
    : `/api/engagement${raw.startsWith('/') ? raw : `/${raw}`}`;
  const m = String(method || 'GET').toUpperCase();

  if (m === 'POST' && full === '/api/engagement/bulk-stats') {
    return true;
  }
  if (m === 'GET') {
    if (/^\/api\/engagement\/user\/[^/]+$/.test(full)) return true;
    if (/^\/api\/engagement\/[^/]+\/comments$/.test(full)) return true;
    if (/^\/api\/engagement\/[^/]+\/likes$/.test(full)) return true;
    if (/^\/api\/engagement\/[^/]+\/stats$/.test(full)) return true;
    if (/^\/api\/engagement\/[^/]+\/metrics$/.test(full)) return true;
  }
  return false;
}

function firstPartyProductMiddleware(req: Request, res: Response, next: NextFunction): void {
  const pathForMatch = (req.originalUrl || req.url || req.path || '').split('?')[0];
  if (isPublicEngagementRead(req.method, pathForMatch)) {
    next();
    return;
  }
  if (!requireFirstPartyOAuthClient(req, res)) return;
  next();
}

/** Register first-party Bearer gates on product path prefixes. Call before route setup. */
export function mountL5ProductFirstPartyBoundary(app: Application): void {
  for (const prefix of L5_PRODUCT_ROUTE_PREFIXES) {
    app.use(prefix, firstPartyProductMiddleware);
  }
}
