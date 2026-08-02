/**
 * Legacy /api/auth surface: rate limiting for the namespace and challenge issuance.
 * Credential verification now lives in pN OAuth (/oauth/token).
 */

import type { Application, RequestHandler } from 'express';
import { generateChallenge } from '../utils/identifierGenerators';

export interface AuthChallengeRouteDeps {
  authLimiter: RequestHandler;
}

export function registerAuthChallengeRoutes(app: Application, deps: AuthChallengeRouteDeps): void {
  const { authLimiter } = deps;

    // Authentication endpoints with rate limiting (skip OPTIONS for CORS preflight)
    // OAuth token endpoint has its own more lenient limiter, so exclude it
    app.use('/api/auth', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        return next(); // Skip rate limiting for OPTIONS requests
      }
      // Skip rate limiting for OAuth token endpoint (it has its own limiter)
      if (req.path === '/api/auth/google-oauth/token' && req.method === 'POST') {
        return next();
      }
      authLimiter(req, res, next);
    });

    app.post('/api/auth/challenge', (req, res) => {
      // Generate authentication challenge
      const challenge = generateChallenge();
      res.json({ challenge, expiresAt: Date.now() + 300000 }); // 5 minutes
    });

    app.post('/api/auth/verify', (_req, res) => {
      return res.status(410).json({
        error: 'gone',
        error_description: 'Legacy auth verify removed. Use pN OAuth (/oauth/token).'
      });
    });
}
