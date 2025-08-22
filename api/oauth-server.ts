/**
 * Identity Protocol OAuth Server
 * 
 * Provides OAuth 2.0 endpoints for third-party authentication
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { IdentityCore } from '../core/identity-core/src/index';

interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  name: string;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  userId: string;
  expiresAt: Date;
}

interface AccessToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
  userId: string;
  clientId: string;
  issuedAt: Date;
}

class OAuthServer {
  private app: express.Application;
  private clients: Map<string, OAuthClient> = new Map();
  private authorizationCodes: Map<string, AuthorizationCode> = new Map();
  private accessTokens: Map<string, AccessToken> = new Map();
  private identityCore: IdentityCore;
  private jwtSecret: string;

  constructor() {
    this.app = express();
    this.identityCore = new IdentityCore();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.setupMiddleware();
    this.setupRoutes();
    this.initializeDefaultClients();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS for cross-origin requests
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });

    // Rate limiting
    this.app.use(this.rateLimiter());
  }

  private rateLimiter() {
    const requests = new Map<string, { count: number; resetTime: number }>();
    
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = req.ip;
      const now = Date.now();
      const windowMs = 15 * 60 * 1000; // 15 minutes
      const maxRequests = 100;

      const userRequests = requests.get(ip);
      
      if (!userRequests || now > userRequests.resetTime) {
        requests.set(ip, { count: 1, resetTime: now + windowMs });
      } else if (userRequests.count >= maxRequests) {
        return res.status(429).json({ error: 'rate_limit_exceeded' });
      } else {
        userRequests.count++;
      }
      
      next();
    };
  }

  private setupRoutes(): void {
    // OAuth 2.0 Authorization Endpoint
    this.app.get('/oauth/authorize', this.handleAuthorization.bind(this));
    
    // OAuth 2.0 Token Endpoint
    this.app.post('/oauth/token', this.handleTokenExchange.bind(this));
    
    // OAuth 2.0 User Info Endpoint
    this.app.get('/oauth/userinfo', this.handleUserInfo.bind(this));
    
    // OAuth 2.0 Token Revocation Endpoint
    this.app.post('/oauth/revoke', this.handleTokenRevocation.bind(this));
    
    // Client Registration Endpoint
    this.app.post('/oauth/clients', this.handleClientRegistration.bind(this));
    
    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
  }

  private initializeDefaultClients(): void {
    // Register default clients for testing
    this.registerClient({
      clientId: 'test-client',
              clientSecret: crypto.randomBytes(32).toString('hex'),
              redirectUri: process.env.OAUTH_REDIRECT_URI || 'https://yourdomain.com/callback',
      scopes: ['openid', 'profile', 'email'],
      name: 'Test Client'
    });
  }

  public registerClient(client: OAuthClient): void {
    this.clients.set(client.clientId, client);
  }

  private async handleAuthorization(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { 
        response_type, 
        client_id, 
        redirect_uri, 
        scope, 
        state, 
        nonce 
      } = req.query;

      // Validate required parameters
      if (response_type !== 'code') {
        return this.oauthError(res, 'unsupported_response_type', 'Only authorization code flow is supported');
      }

      if (!client_id || !redirect_uri) {
        return this.oauthError(res, 'invalid_request', 'Missing required parameters');
      }

      // Validate client
      const client = this.clients.get(client_id as string);
      if (!client) {
        return this.oauthError(res, 'unauthorized_client', 'Invalid client');
      }

      if (client.redirectUri !== redirect_uri) {
        return this.oauthError(res, 'invalid_request', 'Invalid redirect URI');
      }

      // Check if user is authenticated
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        // Redirect to login page
        const loginUrl = `/login?${new URLSearchParams({
          client_id: client_id as string,
          redirect_uri: redirect_uri as string,
          scope: scope as string || 'openid profile email',
          state: state as string || '',
          nonce: nonce as string || ''
        })}`;
        
        return res.redirect(loginUrl);
      }

      // Extract user ID from JWT token
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const userId = decoded.userId;

      // Generate authorization code
      const code = crypto.randomBytes(32).toString('hex');
      const authorizationCode: AuthorizationCode = {
        code,
        clientId: client_id as string,
        redirectUri: redirect_uri as string,
        scope: (scope as string || 'openid profile email').split(' '),
        state: state as string,
        nonce: nonce as string,
        userId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };

      this.authorizationCodes.set(code, authorizationCode);

      // Redirect back to client with authorization code
      const redirectUrl = `${redirect_uri}?${new URLSearchParams({
        code,
        state: state as string || ''
      })}`;

      res.redirect(redirectUrl);

    } catch (error) {
      // Silently handle authorization errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      this.oauthError(res, 'server_error', 'Internal server error');
    }
  }

  private async handleTokenExchange(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { 
        grant_type, 
        code, 
        client_id, 
        client_secret, 
        redirect_uri 
      } = req.body;

      // Validate grant type
      if (grant_type !== 'authorization_code') {
        return this.oauthError(res, 'unsupported_grant_type', 'Only authorization code grant is supported');
      }

      // Validate client credentials
      const client = this.clients.get(client_id);
      if (!client || client.clientSecret !== client_secret) {
        return this.oauthError(res, 'invalid_client', 'Invalid client credentials');
      }

      // Validate authorization code
      const authCode = this.authorizationCodes.get(code);
      if (!authCode) {
        return this.oauthError(res, 'invalid_grant', 'Invalid authorization code');
      }

      if (authCode.clientId !== client_id) {
        return this.oauthError(res, 'invalid_grant', 'Authorization code was issued to different client');
      }

      if (authCode.redirectUri !== redirect_uri) {
        return this.oauthError(res, 'invalid_grant', 'Redirect URI mismatch');
      }

      if (authCode.expiresAt < new Date()) {
        this.authorizationCodes.delete(code);
        return this.oauthError(res, 'invalid_grant', 'Authorization code expired');
      }

      // Generate access token
      const accessToken = crypto.randomBytes(32).toString('hex');
      const tokenInfo: AccessToken = {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: 3600, // 1 hour
        scope: authCode.scope,
        userId: authCode.userId,
        clientId: client_id,
        issuedAt: new Date()
      };

      this.accessTokens.set(accessToken, tokenInfo);
      this.authorizationCodes.delete(code);

      // Return token response
      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: authCode.scope.join(' '),
        state: authCode.state
      });

    } catch (error) {
      // Silently handle token exchange errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      this.oauthError(res, 'server_error', 'Internal server error');
    }
  }

  private async handleUserInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      const token = authHeader.replace('Bearer ', '');
      const tokenInfo = this.accessTokens.get(token);
      
      if (!tokenInfo) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      if (tokenInfo.issuedAt.getTime() + (tokenInfo.expiresIn * 1000) < Date.now()) {
        this.accessTokens.delete(token);
        return res.status(401).json({ error: 'token_expired' });
      }

      // Get user identity from Identity Core
      const userIdentity = await this.identityCore.getDID(tokenInfo.userId);
      
      if (!userIdentity) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      // Return user info based on requested scopes
      const userInfo: any = {
        sub: userIdentity.id,
        name: userIdentity.metadata.displayName,
        email: userIdentity.metadata.email,
        username: userIdentity.username,
        created_at: userIdentity.createdAt,
        updated_at: userIdentity.updatedAt
      };

      res.json(userInfo);

    } catch (error) {
      // Silently handle user info errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  private async handleTokenRevocation(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { token, token_type_hint } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      // Revoke the token
      this.accessTokens.delete(token);

      res.status(200).json({ message: 'Token revoked successfully' });

    } catch (error) {
      // Silently handle token revocation errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  private async handleClientRegistration(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { name, redirect_uri, scopes } = req.body;

      if (!name || !redirect_uri) {
        return res.status(400).json({ error: 'invalid_request', message: 'Missing required fields' });
      }

      // Generate client credentials
      const clientId = crypto.randomBytes(16).toString('hex');
      const clientSecret = crypto.randomBytes(32).toString('hex');

      const client: OAuthClient = {
        clientId,
        clientSecret,
        redirectUri: redirect_uri,
        scopes: scopes || ['openid', 'profile', 'email'],
        name
      };

      this.registerClient(client);

      res.status(201).json({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect_uri,
        scopes: client.scopes,
        name: client.name
      });

    } catch (error) {
      // Silently handle client registration errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      res.status(500).json({ error: 'server_error' });
    }
  }

  private oauthError(res: express.Response, error: string, description?: string): void {
    res.status(400).json({
      error,
      error_description: description
    });
  }

  public start(port: number = 3001): void {
    this.app.listen(port, () => {
      // Silently start server in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    });
  }

  public getRouter(): express.Router {
    const router = express.Router();
    
    // OAuth 2.0 Authorization Endpoint
    router.get('/authorize', this.handleAuthorization.bind(this));
    
    // OAuth 2.0 Token Endpoint
    router.post('/token', this.handleTokenExchange.bind(this));
    
    // OAuth 2.0 User Info Endpoint
    router.get('/userinfo', this.handleUserInfo.bind(this));
    
    // OAuth 2.0 Token Revocation Endpoint
    router.post('/revoke', this.handleTokenRevocation.bind(this));
    
    // OAuth 2.0 Client Registration Endpoint
    router.post('/clients', this.handleClientRegistration.bind(this));
    
    return router;
  }
}

export default OAuthServer; 