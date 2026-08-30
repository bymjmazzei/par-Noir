/**
 * L5 must not call first-party product APIs (messages, mailbox, connections, groups, …).
 * Mount early so Express runs this before route handlers on those prefixes.
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

function firstPartyProductMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!requireFirstPartyOAuthClient(req, res)) return;
  next();
}

/** Register first-party Bearer gates on product path prefixes. Call before route setup. */
export function mountL5ProductFirstPartyBoundary(app: Application): void {
  for (const prefix of L5_PRODUCT_ROUTE_PREFIXES) {
    app.use(prefix, firstPartyProductMiddleware);
  }
}
