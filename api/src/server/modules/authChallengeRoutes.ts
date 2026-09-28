/**
 * Legacy /api/auth rate limiting.
 * Challenge/verify session mint was removed — use pN OAuth (/oauth/token).
 */

import type { Application, RequestHandler } from 'express';

export interface AuthChallengeRouteDeps {
  authLimiter: RequestHandler;
}

export function registerAuthChallengeRoutes(app: Application, deps: AuthChallengeRouteDeps): void {
  const { authLimiter } = deps;

  // Authentication endpoints with rate limiting (skip OPTIONS for CORS preflight)
  // OAuth token endpoint has its own more lenient limiter, so exclude it
  app.use('/api/auth', (req, res, next) => {
    if (req.method === 'OPTIONS') {
      return next();
    }
    authLimiter(req, res, next);
  });
}
