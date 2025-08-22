/**
 * Decentralized Authentication Server
 * 
 * Replaces OAuth 2.0 with DID-based decentralized authentication
 * No centralized database required - all authentication is cryptographic
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';

// Import decentralized authentication components
import { DecentralizedAuth } from '../core/identity-core/src/distributed/DecentralizedAuth';
import { DIDResolver } from '../core/identity-core/src/distributed/DIDResolver';
import { IdentityCore } from '../core/identity-core/src/index';

// Load environment variables
dotenv.config();

interface DecentralizedAuthConfig {
  port: number;
  corsOrigins: string[];
  rateLimitWindow: number;
  rateLimitMax: number;
  challengeExpiry: number;
  sessionExpiry: number;
}

class DecentralizedAuthServer {
  private app: express.Application;
  private server: any;
  private io: Server;
  private logger!: winston.Logger;
  private auth: DecentralizedAuth;
  private resolver: DIDResolver;
  private identityCore: IdentityCore;
  private config: DecentralizedAuthConfig;

  constructor() {
    this.validateEnvironmentVariables();
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env['ALLOWED_ORIGINS']?.split(',') || ['https://yourdomain.com'],
        methods: ['GET', 'POST']
      }
    });

    this.config = {
      port: parseInt(process.env.PORT || '3001'),
      corsOrigins: process.env['ALLOWED_ORIGINS']?.split(',') || ['https://yourdomain.com'],
      rateLimitWindow: 15 * 60 * 1000, // 15 minutes
      rateLimitMax: 100,
      challengeExpiry: 5 * 60 * 1000, // 5 minutes
      sessionExpiry: 24 * 60 * 60 * 1000 // 24 hours
    };

    this.resolver = new DIDResolver();
    this.auth = new DecentralizedAuth(this.resolver);
    this.identityCore = new IdentityCore();

    this.setupLogger();
    this.setupMiddleware();
    this.setupSecurity();
    this.setupRateLimiting();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private validateEnvironmentVariables(): void {
    const requiredEnvVars = [
      'JWT_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ CRITICAL: Missing required environment variables:');
      missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
      });
      console.error('\nPlease set these environment variables before starting the server.');
      process.exit(1);
    }

    console.log('✅ Environment variables validated successfully');
  }

  private setupLogger(): void {
    this.logger = winston.createLogger({
      level: process.env['LOG_LEVEL'] || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'decentralized-auth-server' },
      transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-identity-did']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      next();
    });
  }

  private setupSecurity(): void {
    // Additional security middleware
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      next();
    });
  }

  private setupRateLimiting(): void {
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindow,
      max: this.config.rateLimitMax,
      message: {
        error: 'rate_limit_exceeded',
        message: 'Too many requests from this IP'
      },
      standardHeaders: true,
      legacyHeaders: false,
    });

    this.app.use('/auth/', limiter);
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'decentralized-auth-server',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    });

    // Authentication routes
    this.app.post('/auth/challenge', this.createChallenge.bind(this));
    this.app.post('/auth/authenticate', this.authenticate.bind(this));
    this.app.get('/auth/userinfo', this.getUserInfo.bind(this));
    this.app.get('/auth/validate', this.validateSession.bind(this));
    this.app.post('/auth/logout', this.logout.bind(this));

    // DID resolution endpoint
    this.app.get('/auth/resolve/:did', this.resolveDID.bind(this));

    // OAuth compatibility endpoints (for legacy support)
    this.app.get('/oauth/authorize', this.oauthCompatibilityAuthorize.bind(this));
    this.app.post('/oauth/token', this.oauthCompatibilityToken.bind(this));
    this.app.get('/oauth/userinfo', this.oauthCompatibilityUserInfo.bind(this));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'not_found',
        message: 'Endpoint not found'
      });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('WebSocket client connected', { socketId: socket.id });

      socket.on('auth_challenge', async (data) => {
        try {
          const { did } = data;
          const challenge = await this.auth.createChallenge(did);
          socket.emit('challenge_created', challenge);
        } catch (error) {
          socket.emit('error', { error: 'challenge_creation_failed' });
        }
      });

      socket.on('disconnect', () => {
        this.logger.info('WebSocket client disconnected', { socketId: socket.id });
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      res.status(500).json({
        error: 'internal_server_error',
        message: 'An unexpected error occurred'
      });
    });
  }

  // Core authentication endpoints

  private async createChallenge(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did } = req.body;
      
      if (!did) {
        return res.status(400).json({
          error: 'missing_did',
          message: 'DID is required'
        });
      }

      const challenge = await this.auth.createChallenge(did, this.config.challengeExpiry);
      
      this.logger.info('Challenge created', { did, challengeId: challenge.challenge.substring(0, 8) });
      
      res.json(challenge);
    } catch (error) {
      this.logger.error('Challenge creation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(400).json({
        error: 'challenge_creation_failed',
        message: 'Failed to create authentication challenge'
      });
    }
  }

  private async authenticate(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did, signature } = req.body;
      
      if (!did || !signature) {
        return res.status(400).json({
          error: 'missing_parameters',
          message: 'DID and signature are required'
        });
      }

      const session = await this.auth.authenticate(did, signature);
      
      if (!session) {
        return res.status(401).json({
          error: 'authentication_failed',
          message: 'Authentication failed'
        });
      }

      this.logger.info('Authentication successful', { did, deviceId: session.deviceId });
      
      // Return session info (no tokens needed)
      res.json({
        session_id: session.did,
        authenticated_at: session.authenticatedAt,
        expires_at: session.expiresAt,
        permissions: session.permissions,
        device_id: session.deviceId
      });
    } catch (error) {
      this.logger.error('Authentication failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(401).json({
        error: 'authentication_failed',
        message: 'Authentication failed'
      });
    }
  }

  private async getUserInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const did = req.headers['x-identity-did'] as string;
      
      if (!did) {
        return res.status(401).json({
          error: 'missing_identity',
          message: 'Identity DID is required'
        });
      }

      const isAuthenticated = await this.auth.isAuthenticated(did);
      if (!isAuthenticated) {
        return res.status(401).json({
          error: 'not_authenticated',
          message: 'Identity is not authenticated'
        });
      }

      // Resolve DID to get user info
      const resolution = await this.resolver.resolve(did);
      if (!resolution) {
        return res.status(404).json({
          error: 'identity_not_found',
          message: 'Identity not found'
        });
      }

      // Get additional identity info from Identity Core
      const identity = await this.identityCore.getDID(did);
      
      const userInfo = {
        sub: did,
        name: identity?.metadata?.displayName || resolution.didDocument.service?.[0]?.name || 'Unknown',
        email: identity?.metadata?.email || resolution.didDocument.service?.[0]?.email,
        username: identity?.username,
        created_at: resolution.metadata.created,
        updated_at: resolution.metadata.updated,
        verified: identity?.verified || false
      };

      res.json(userInfo);
    } catch (error) {
      this.logger.error('Get user info failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to get user information'
      });
    }
  }

  private async validateSession(req: express.Request, res: express.Response): Promise<void> {
    try {
      const did = req.headers['x-identity-did'] as string;
      
      if (!did) {
        return res.status(401).json({
          error: 'missing_identity',
          message: 'Identity DID is required'
        });
      }

      const isAuthenticated = await this.auth.isAuthenticated(did);
      res.json({ 
        authenticated: isAuthenticated,
        did: did
      });
    } catch (error) {
      this.logger.error('Session validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to validate session'
      });
    }
  }

  private async logout(req: express.Request, res: express.Response): Promise<void> {
    try {
      const did = req.headers['x-identity-did'] as string;
      
      if (!did) {
        return res.status(400).json({
          error: 'missing_identity',
          message: 'Identity DID is required'
        });
      }

      await this.auth.logout(did);
      
      this.logger.info('Logout successful', { did });
      
      res.json({ 
        message: 'logged_out',
        did: did
      });
    } catch (error) {
      this.logger.error('Logout failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to logout'
      });
    }
  }

  private async resolveDID(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did } = req.params;
      
      if (!did) {
        return res.status(400).json({
          error: 'missing_did',
          message: 'DID is required'
        });
      }

      const resolution = await this.resolver.resolve(did);
      if (!resolution) {
        return res.status(404).json({
          error: 'did_not_found',
          message: 'DID not found'
        });
      }

      res.json(resolution);
    } catch (error) {
      this.logger.error('DID resolution failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      res.status(500).json({
        error: 'server_error',
        message: 'Failed to resolve DID'
      });
    }
  }

  // OAuth compatibility endpoints (for legacy support)

  private async oauthCompatibilityAuthorize(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { client_id, redirect_uri, state, scope } = req.query;
      
      // Instead of OAuth flow, redirect to decentralized auth
      const authUrl = `/auth/decentralized?${new URLSearchParams({
        client_id: client_id as string,
        redirect_uri: redirect_uri as string,
        state: state as string,
        scope: scope as string || 'openid profile email'
      })}`;
      
      res.redirect(authUrl);
    } catch (error) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Invalid OAuth request'
      });
    }
  }

  private async oauthCompatibilityToken(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { grant_type, did, signature } = req.body;
      
      if (grant_type !== 'decentralized_auth') {
        return res.status(400).json({
          error: 'unsupported_grant_type',
          message: 'Only decentralized authentication is supported'
        });
      }

      const session = await this.auth.authenticate(did, signature);
      if (!session) {
        return res.status(401).json({
          error: 'invalid_grant',
          message: 'Authentication failed'
        });
      }

      // Convert to OAuth token response format
      res.json({
        access_token: session.did, // Use DID as token
        token_type: 'Bearer',
        expires_in: Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
        scope: session.permissions.join(' '),
        did: session.did
      });
    } catch (error) {
      res.status(400).json({
        error: 'invalid_request',
        message: 'Invalid token request'
      });
    }
  }

  private async oauthCompatibilityUserInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      const did = authHeader.replace('Bearer ', '');
      const isAuthenticated = await this.auth.isAuthenticated(did);
      
      if (!isAuthenticated) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      // Get user info using the same logic as decentralized endpoint
      const resolution = await this.resolver.resolve(did);
      if (!resolution) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      const identity = await this.identityCore.getDID(did);
      
      const userInfo = {
        sub: did,
        name: identity?.metadata?.displayName || resolution.didDocument.service?.[0]?.name || 'Unknown',
        email: identity?.metadata?.email || resolution.didDocument.service?.[0]?.email,
        username: identity?.username,
        created_at: resolution.metadata.created,
        updated_at: resolution.metadata.updated
      };

      res.json(userInfo);
    } catch (error) {
      res.status(500).json({ error: 'server_error' });
    }
  }

  public start(): void {
    this.server.listen(this.config.port, () => {
      this.logger.info(`Decentralized Auth Server started`, {
        port: this.config.port,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
      });
    });
  }

  public getRouter(): express.Router {
    const router = express.Router();
    
    // Authentication routes
    router.post('/challenge', this.createChallenge.bind(this));
    router.post('/authenticate', this.authenticate.bind(this));
    router.get('/userinfo', this.getUserInfo.bind(this));
    router.get('/validate', this.validateSession.bind(this));
    router.post('/logout', this.logout.bind(this));
    router.get('/resolve/:did', this.resolveDID.bind(this));
    
    return router;
  }
}

export default DecentralizedAuthServer;
