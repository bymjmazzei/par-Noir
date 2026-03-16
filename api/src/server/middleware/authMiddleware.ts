/**
 * Authentication Middleware
 * Verifies Bearer tokens and validates user authentication
 * 
 * INTEGRATED: Now uses full token verification via OAuth service
 */

import { Request, Response, NextFunction } from 'express';
import { PNOAuthService, TokenPayload } from '../modules/pnOAuthService';

export interface AuthenticatedRequest extends Request {
  user?: {
    did: string;
    pnIdentifier?: string;
    accessToken?: string;
    clientId?: string;
    scope?: string[];
  };
}

/**
 * Authentication middleware that verifies Bearer tokens
 * SECURITY: Fully validates token signature, expiration, and authenticity
 * 
 * This middleware:
 * 1. Checks token format (Bearer token)
 * 2. Validates token signature using OAuth service
 * 3. Checks token expiration
 * 4. Populates req.user with authenticated user data
 * 
 * If token is invalid, request continues but req.user is undefined
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      // No auth header - request continues but user is not authenticated
      return next();
    }
    
    // Check if it's a Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      // Invalid format - don't grant authenticated rate limits
      return next();
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // SECURITY: Basic token format validation
    if (!token || token.trim().length === 0) {
      return next();
    }
    
    // ✅ INTEGRATION: Full token verification using OAuth service
    // This validates:
    // - Token signature (prevents tampering)
    // - Token expiration (prevents use of expired tokens)
    // - Token existence (prevents fake tokens)
    const tokenPayload: TokenPayload | null = PNOAuthService.validateAccessToken(token);
    
    if (!tokenPayload) {
      // Token is invalid (expired, wrong signature, doesn't exist, etc.)
      // Request continues but user is NOT authenticated
      // This prevents attackers from using fake tokens to get higher rate limits
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Auth] Invalid or expired token provided`);
      }
      return next();
    }
    
    // ✅ Token is valid! Populate user info from token payload
    req.user = {
      did: tokenPayload.did,
      pnIdentifier: tokenPayload.pnIdentifier,
      accessToken: token,
      clientId: tokenPayload.clientId,
      scope: tokenPayload.scope,
    };
    
    // Do not log DID or pnIdentifier (sensitive); log only that auth succeeded
    if (process.env.NODE_ENV === 'development') {
      console.log('[Auth] Authenticated');
    }
    
    next();
  } catch (error) {
    // On error, continue without authentication; do not log token or identity data
    if (process.env.NODE_ENV === 'development') {
      console.error('[Auth] Error during token verification');
    }
    next();
  }
};

/**
 * Middleware that requires authentication
 * Returns 401 if no valid token is present or token is invalid
 * 
 * INTEGRATED: Now uses full token verification via OAuth service
 * 
 * Use this middleware on endpoints that require authentication.
 * If token is missing or invalid, returns 401 Unauthorized.
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token in the Authorization header'
      });
      return;
    }
    
    const token = authHeader.substring(7);
    
    if (!token || token.trim().length === 0) {
      res.status(401).json({ 
        error: 'Invalid token',
        message: 'Token cannot be empty'
      });
      return;
    }
    
    // ✅ INTEGRATION: Full token verification using OAuth service
    const tokenPayload: TokenPayload | null = PNOAuthService.validateAccessToken(token);
    
    if (!tokenPayload) {
      // Token is invalid, expired, or tampered with
      res.status(401).json({ 
        error: 'Invalid or expired token',
        message: 'The provided token is invalid, expired, or has been tampered with. Please authenticate again.'
      });
      return;
    }
    
    // ✅ Token is valid! Populate user info from token payload
    req.user = {
      did: tokenPayload.did,
      pnIdentifier: tokenPayload.pnIdentifier,
      accessToken: token,
      clientId: tokenPayload.clientId,
      scope: tokenPayload.scope,
    };
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Auth] Authenticated');
    }
    
    next();
  } catch (error) {
    res.status(401).json({ 
      error: 'Authentication failed',
      message: 'Unable to process authentication token'
    });
    return;
  }
};

