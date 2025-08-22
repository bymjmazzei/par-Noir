/**
 * Production API Server for Identity Protocol
 * 
 * Simplified version focusing on core functionality
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

// Import decentralized authentication server
import DecentralizedAuthServer from '../decentralized-auth-server';

// Load environment variables
dotenv.config();

class ProductionServer {
  private app: express.Application;
  private server: any;
  private io: Server;
  private logger!: winston.Logger;
  private decentralizedAuthServer: DecentralizedAuthServer;

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

    // Initialize decentralized authentication server
    this.decentralizedAuthServer = new DecentralizedAuthServer();

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
      'JWT_SECRET',
      'SENDGRID_API_KEY',
      'IPFS_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ CRITICAL: Missing required environment variables:');
      missingVars.forEach(varName => {
        console.error(`   - ${varName}`);
      });
      console.error('\nPlease set these environment variables before starting the server.');
      console.error('For development, you can create a .env file with these variables.');
      process.exit(1);
    }

    // Validate JWT secret strength
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      console.error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long');
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
      defaultMeta: { service: 'identity-protocol-api' },
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
          connectSrc: ["'self'", "wss:", "https:"],
          fontSrc: ["'self'", "https:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: []
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      frameguard: { action: 'deny' }
    }));

    // CORS
    this.app.use(cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || ['https://yourdomain.com'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ 
      limit: '1mb',
      verify: (req, res, buf) => {
        try {
          JSON.parse(buf.toString());
        } catch (e) {
          throw new Error('Invalid JSON');
        }
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
    // Enhanced security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "https:"],
          fontSrc: ["'self'", "https:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: []
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      frameguard: { action: 'deny' }
    }));

    // Additional security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      next();
    });

    // Request size limits
    this.app.use(express.json({ 
      limit: '1mb',
      verify: (req, res, buf) => {
        try {
          JSON.parse(buf.toString());
        } catch (e) {
          throw new Error('Invalid JSON');
        }
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // Input sanitization middleware
    this.app.use(this.sanitizeInput);
  }

  /**
   * Input sanitization middleware
   */
  private sanitizeInput = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    // Sanitize request body
    if (req.body) {
      req.body = this.sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = this.sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = this.sanitizeObject(req.params);
    }

    next();
  }

  /**
   * Recursively sanitize objects
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this.sanitizeString(key);
      sanitized[sanitizedKey] = this.sanitizeObject(value);
    }

    return sanitized;
  }

  /**
   * Sanitize strings to prevent injection attacks
   */
  private sanitizeString(value: any): any {
    if (typeof value !== 'string') {
      return value;
    }

    // Remove null bytes
    let sanitized = value.replace(/\0/g, '');

    // Remove control characters except newlines and tabs
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize unicode
    sanitized = sanitized.normalize('NFC');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Validate and sanitize email addresses
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate and sanitize usernames
   */
  private validateUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9-]{3,20}$/;
    return usernameRegex.test(username);
  }

  /**
   * Validate and sanitize passcodes
   */
  private validatePasscode(passcode: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (passcode.length < 12) {
      errors.push('Passcode must be at least 12 characters long');
    }
    
    if (!/[A-Z]/.test(passcode)) {
      errors.push('Passcode must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(passcode)) {
      errors.push('Passcode must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(passcode)) {
      errors.push('Passcode must contain at least one number');
    }
    
    if (!/[^A-Za-z0-9]/.test(passcode)) {
      errors.push('Passcode must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private setupRateLimiting(): void {
    // Global rate limiting
    const globalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress || 'unknown';
      },
      handler: (req, res) => {
        this.logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(15 * 60 / 60) // minutes
        });
      }
    });

    // Authentication-specific rate limiting
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 auth attempts per windowMs
      message: 'Too many authentication attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        return `auth_${req.ip || req.connection.remoteAddress || 'unknown'}`;
      },
      handler: (req, res) => {
        this.logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too many authentication attempts',
          retryAfter: Math.ceil(15 * 60 / 60) // minutes
        });
      }
    });

    // DID creation rate limiting
    const didCreationLimiter = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // limit each IP to 3 DID creations per hour
      message: 'Too many DID creation attempts, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        return `did_creation_${req.ip || req.connection.remoteAddress || 'unknown'}`;
      },
      handler: (req, res) => {
        this.logger.warn(`DID creation rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
          error: 'Too many DID creation attempts',
          retryAfter: Math.ceil(60 / 60) // minutes
        });
      }
    });

    // Apply rate limiters
    this.app.use(globalLimiter);
    this.app.use('/api/auth', authLimiter);
    this.app.use('/api/identity/create', didCreationLimiter);

    // Threat detection middleware
    this.app.use(this.detectThreats);
  }

  /**
   * Threat detection middleware
   */
  private detectThreats = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    const path = req.path;
    const method = req.method;

    // Detect suspicious patterns
    const threats = [];

    // Check for SQL injection attempts
    const sqlInjectionPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter)\b)/i,
      /(\b(exec|execute|script|javascript|vbscript)\b)/i,
      /(['"]\s*(union|select|insert|update|delete|drop|create|alter)\s*)/i
    ];

    const requestString = JSON.stringify(req.body) + JSON.stringify(req.query) + JSON.stringify(req.params);
    for (const pattern of sqlInjectionPatterns) {
      if (pattern.test(requestString)) {
        threats.push('Potential SQL injection attempt');
        break;
      }
    }

    // Check for XSS attempts
    const xssPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(requestString)) {
        threats.push('Potential XSS attempt');
        break;
      }
    }

    // Check for path traversal attempts
    const pathTraversalPatterns = [
      /\.\.\//,
      /\.\.\\/,
      /%2e%2e%2f/i,
      /%2e%2e%5c/i
    ];

    for (const pattern of pathTraversalPatterns) {
      if (pattern.test(path)) {
        threats.push('Potential path traversal attempt');
        break;
      }
    }

    // Check for suspicious user agents
    const suspiciousUserAgents = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /wget/i,
      /curl/i,
      /python/i,
      /perl/i,
      /ruby/i,
      /php/i
    ];

    for (const pattern of suspiciousUserAgents) {
      if (pattern.test(userAgent)) {
        threats.push('Suspicious user agent detected');
        break;
      }
    }

    // Log threats
    if (threats.length > 0) {
      this.logger.warn(`Threat detected for IP ${ip}:`, {
        threats,
        path,
        method,
        userAgent,
        timestamp: new Date().toISOString()
      });

      // Block suspicious requests
      if (threats.some(t => t.includes('SQL injection') || t.includes('XSS'))) {
        res.status(403).json({
          error: 'Request blocked due to security concerns',
          timestamp: new Date().toISOString()
        });
        return;
      }
    }

    next();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0'
      });
    });

    // API Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env['npm_package_version'] || '1.0.0',
        service: 'identity-protocol-api'
      });
    });

    // Decentralized Authentication endpoints (replaces OAuth)
    this.app.use('/auth', this.decentralizedAuthServer.getRouter());
    
    // OAuth compatibility endpoints (for legacy support)
    this.app.get('/oauth/authorize', this.handleOAuthAuthorize.bind(this));
    this.app.post('/oauth/token', this.handleOAuthToken.bind(this));
    this.app.get('/oauth/userinfo', this.handleOAuthUserInfo.bind(this));
    this.app.post('/oauth/revoke', this.handleOAuthRevoke.bind(this));

    // Identity management endpoints
    this.app.post('/api/identities', this.handleCreateIdentity.bind(this));
    this.app.post('/api/identities/authenticate', this.handleAuthenticateIdentity.bind(this));
    this.app.put('/api/identities/:id', this.handleUpdateIdentity.bind(this));
    this.app.get('/api/identities/:id', this.handleGetIdentity.bind(this));

    // Recovery endpoints
    this.app.post('/api/recovery/initiate', this.handleInitiateRecovery.bind(this));
    this.app.post('/api/recovery/:id/approve', this.handleApproveRecovery.bind(this));
    this.app.get('/api/recovery/:id', this.handleGetRecoveryStatus.bind(this));

    // IPFS endpoints
    this.app.post('/api/ipfs/upload', this.handleIPFSUpload.bind(this));
    this.app.get('/api/ipfs/:cid', this.handleIPFSDownload.bind(this));

    // Webhook endpoints
    this.app.post('/api/webhooks/subscriptions', this.handleCreateWebhook.bind(this));
    this.app.get('/api/webhooks/subscriptions', this.handleListWebhooks.bind(this));
    this.app.delete('/api/webhooks/subscriptions/:id', this.handleDeleteWebhook.bind(this));

    // Tool management endpoints
    this.app.post('/api/tools/request-access', this.handleToolAccessRequest.bind(this));
    this.app.post('/api/tools/:toolId/approve', this.handleApproveToolAccess.bind(this));
    this.app.post('/api/tools/:toolId/deny', this.handleDenyToolAccess.bind(this));
    this.app.get('/api/tools/permissions', this.handleGetToolPermissions.bind(this));
    this.app.delete('/api/tools/:toolId/revoke', this.handleRevokeToolAccess.bind(this));
    this.app.put('/api/tools/:toolId/permissions', this.handleUpdateToolPermissions.bind(this));
    this.app.post('/api/privacy/register-data-point', this.handleRegisterDataPoint.bind(this));
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      this.logger.info('Client connected', { socketId: socket.id });

      // Join security room for real-time updates
      socket.join('security');

      socket.on('join-room', (room) => {
        socket.join(room);
        this.logger.info('Client joined room', { socketId: socket.id, room });
      });

      socket.on('disconnect', () => {
        this.logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  /**
   * Broadcast security alert to all connected clients
   */
  private broadcastSecurityAlert(type: string, severity: 'low' | 'medium' | 'high' | 'critical', message: string, details: any = {}): void {
    this.io.to('security').emit('security-alert', {
      type,
      severity,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast session update to all connected clients
   */
  private broadcastSessionUpdate(sessionId: string, deviceName: string, status: string, ipAddress?: string, location?: string): void {
    this.io.to('security').emit('session-update', {
      sessionId,
      deviceName,
      status,
      ipAddress,
      location,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast tool access update to all connected clients
   */
  private broadcastToolAccessUpdate(toolId: string, toolName: string, action: string, dataPoints: string[] = []): void {
    this.io.to('security').emit('tool-access', {
      toolId,
      toolName,
      action,
      dataPoints,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Broadcast recovery status update to all connected clients
   */
  private broadcastRecoveryStatusUpdate(requestId: string, status: string, custodianName?: string): void {
    this.io.to('security').emit('recovery-status', {
      requestId,
      status,
      custodianName,
      timestamp: new Date().toISOString()
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.path
      });
    });

    // Global error handler
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env['NODE_ENV'] === 'production' ? 'An unexpected error occurred' : err.message
      });
    });
  }

  // OAuth handlers
  private async handleOAuthAuthorize(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { client_id, redirect_uri, response_type, scope, state } = req.query;
      
      // Validate required parameters
      if (!client_id || !redirect_uri || response_type !== 'code') {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      // Generate authorization code
      const authCode = Math.random().toString(36).substring(2, 15);
      
      res.json({
        code: authCode,
        state: state || null
      });
    } catch (error) {
      this.logger.error('OAuth authorization error', { error });
      res.status(500).json({ error: 'server_error' });
    }
  }

  private async handleOAuthToken(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { grant_type, code, client_id, client_secret } = req.body;
      
      if (grant_type !== 'authorization_code') {
        res.status(400).json({ error: 'unsupported_grant_type' });
        return;
      }

      // Generate access token
      const accessToken = crypto.randomBytes(32).toString('hex');
      
      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid profile'
      });
    } catch (error) {
      this.logger.error('OAuth token error', { error });
      res.status(500).json({ error: 'server_error' });
    }
  }

  private async handleOAuthUserInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'invalid_token' });
        return;
      }

      res.json({
        sub: 'user123',
        name: 'John Doe',
        email: 'john@example.com',
        picture: 'https://example.com/avatar.jpg'
      });
    } catch (error) {
      this.logger.error('OAuth userinfo error', { error });
      res.status(500).json({ error: 'server_error' });
    }
  }

  private async handleOAuthRevoke(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { token } = req.body;
      if (!token) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      this.logger.error('OAuth revoke error', { error });
      res.status(500).json({ error: 'server_error' });
    }
  }

  // Identity handlers
  private async handleCreateIdentity(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { username, passcode, displayName, email } = req.body;
      
      if (!username || !passcode) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const identity = {
        id: `did:identity:${Math.random().toString(36).substring(2, 15)}`,
        username,
        displayName,
        email,
        createdAt: new Date().toISOString()
      };

      res.json({ success: true, identity });
    } catch (error) {
      this.logger.error('Error creating identity', { error });
      res.status(500).json({ error: 'Failed to create identity' });
    }
  }

  private async handleAuthenticateIdentity(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did, passcode } = req.body;
      
      if (!did || !passcode) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      res.json({ 
        success: true, 
        message: 'Identity authenticated',
        token: Math.random().toString(36).substring(2, 15)
      });
    } catch (error) {
      this.logger.error('Error authenticating identity', { error });
      res.status(500).json({ error: 'Failed to authenticate identity' });
    }
  }

  private async handleUpdateIdentity(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { displayName, email } = req.body;

      res.json({ success: true, message: 'Identity updated' });
    } catch (error) {
      this.logger.error('Error updating identity', { error });
      res.status(500).json({ error: 'Failed to update identity' });
    }
  }

  private async handleGetIdentity(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;

      res.json({ success: true, message: 'Identity retrieved' });
    } catch (error) {
      this.logger.error('Error getting identity', { error });
      res.status(500).json({ error: 'Failed to get identity' });
    }
  }

  // Recovery handlers
  private async handleInitiateRecovery(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did, claimantContactType, claimantContactValue } = req.body;
      
      if (!did || !claimantContactType || !claimantContactValue) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const recoveryId = Math.random().toString(36).substring(2, 15);
      
      res.json({ 
        success: true, 
        message: 'Recovery initiated',
        recoveryId
      });
    } catch (error) {
      this.logger.error('Error initiating recovery', { error });
      res.status(500).json({ error: 'Failed to initiate recovery' });
    }
  }

  private async handleApproveRecovery(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      const { approvalCode } = req.body;

      res.json({ success: true, message: 'Recovery approved' });
    } catch (error) {
      this.logger.error('Error approving recovery', { error });
      res.status(500).json({ error: 'Failed to approve recovery' });
    }
  }

  private async handleGetRecoveryStatus(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;

      res.json({ 
        success: true, 
        message: 'Recovery status retrieved',
        status: 'pending'
      });
    } catch (error) {
      this.logger.error('Error getting recovery status', { error });
      res.status(500).json({ error: 'Failed to get recovery status' });
    }
  }

  // IPFS handlers
  private async handleIPFSUpload(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { data } = req.body;
      
      if (!data) {
        res.status(400).json({ error: 'Missing data' });
        return;
      }

      // Simulate IPFS upload
      const cid = `Qm${Math.random().toString(36).substring(2, 15)}`;
      
      res.json({ 
        success: true, 
        message: 'File uploaded to IPFS',
        cid
      });
    } catch (error) {
      this.logger.error('Error uploading to IPFS', { error });
      res.status(500).json({ error: 'Failed to upload to IPFS' });
    }
  }

  private async handleIPFSDownload(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { cid } = req.params;

      // Simulate IPFS download
      const data = { message: 'IPFS data retrieved' };
      
      res.json({ 
        success: true, 
        message: 'File downloaded from IPFS',
        data
      });
    } catch (error) {
      this.logger.error('Error downloading from IPFS', { error });
      res.status(500).json({ error: 'Failed to download from IPFS' });
    }
  }

  // Webhook handlers
  private async handleCreateWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { clientId, url, events } = req.body;
      
      if (!clientId || !url || !events) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }

      const webhookId = Math.random().toString(36).substring(2, 15);
      
      res.json({ 
        success: true, 
        message: 'Webhook created',
        webhookId
      });
    } catch (error) {
      this.logger.error('Error creating webhook', { error });
      res.status(500).json({ error: 'Failed to create webhook' });
    }
  }

  private async handleListWebhooks(req: express.Request, res: express.Response): Promise<void> {
    try {
      res.json({ 
        success: true, 
        message: 'Webhooks listed',
        webhooks: []
      });
    } catch (error) {
      this.logger.error('Error listing webhooks', { error });
      res.status(500).json({ error: 'Failed to list webhooks' });
    }
  }

  private async handleDeleteWebhook(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { id } = req.params;
      
      // For MVP, just return success
      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });
    } catch (error) {
      this.logger.error('Delete webhook error', { error });
      res.status(500).json({ error: 'Failed to delete webhook' });
    }
  }

  // Tool management handlers
  private async handleToolAccessRequest(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did, toolId, toolName, toolDescription, requestedData, permissions, expiresAt } = req.body;
      
      // Basic validation
      if (!did || !toolId || !toolName || !requestedData) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      // Store pending request (simple implementation for MVP)
      const request = {
        toolId,
        toolName,
        toolDescription,
        requestedData,
        permissions: permissions || [],
        expiresAt,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      
      // For MVP, just return success - real implementation will use privacy manager
      res.json({
        success: true,
        requestId: toolId,
        status: 'pending_approval',
        message: 'Tool access request created successfully'
      });
      
    } catch (error) {
      this.logger.error('Tool access request error', { error });
      res.status(500).json({ error: 'Failed to process tool request' });
    }
  }

  private async handleApproveToolAccess(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { toolId } = req.params;
      const { did } = req.body;
      
      if (!did) {
        res.status(400).json({ error: 'DID required' });
        return;
      }
      
      // For MVP, just return success
      res.json({
        success: true,
        toolId,
        status: 'approved',
        message: 'Tool access approved successfully'
      });
      
    } catch (error) {
      this.logger.error('Approve tool access error', { error });
      res.status(500).json({ error: 'Failed to approve tool access' });
    }
  }

  private async handleDenyToolAccess(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { toolId } = req.params;
      const { did } = req.body;
      
      if (!did) {
        res.status(400).json({ error: 'DID required' });
        return;
      }
      
      // For MVP, just return success
      res.json({
        success: true,
        toolId,
        status: 'denied',
        message: 'Tool access denied successfully'
      });
      
    } catch (error) {
      this.logger.error('Deny tool access error', { error });
      res.status(500).json({ error: 'Failed to deny tool access' });
    }
  }

  private async handleGetToolPermissions(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { did } = req.query;
      
      if (!did) {
        res.status(400).json({ error: 'DID required' });
        return;
      }
      
      // For MVP, return empty structure - real implementation will fetch from storage
      res.json({
        permissions: [],
        pendingRequests: [],
        dataPoints: {},
        globalSettings: {
          allowAllToolAccess: true,
          allowAnalytics: true,
          allowMarketing: false,
          allowThirdPartySharing: true
        }
      });
      
    } catch (error) {
      this.logger.error('Get tool permissions error', { error });
      res.status(500).json({ error: 'Failed to get tool permissions' });
    }
  }

  private async handleRevokeToolAccess(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { toolId } = req.params;
      const { did } = req.body;
      
      if (!did) {
        res.status(400).json({ error: 'DID required' });
        return;
      }
      
      // For MVP, just return success
      res.json({
        success: true,
        toolId,
        status: 'revoked',
        message: 'Tool access revoked successfully'
      });
      
    } catch (error) {
      this.logger.error('Revoke tool access error', { error });
      res.status(500).json({ error: 'Failed to revoke tool access' });
    }
  }

  private async handleUpdateToolPermissions(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { toolId } = req.params;
      const { did, permissions, dataPoints } = req.body;
      
      if (!did) {
        res.status(400).json({ error: 'DID required' });
        return;
      }
      
      // For MVP, just return success
      res.json({
        success: true,
        toolId,
        permissions: permissions || [],
        dataPoints: dataPoints || [],
        message: 'Tool permissions updated successfully'
      });
      
    } catch (error) {
      this.logger.error('Update tool permissions error', { error });
      res.status(500).json({ error: 'Failed to update tool permissions' });
    }
  }

  private async handleRegisterDataPoint(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { toolId, dataPointKey, label, description, category } = req.body;
      
      // Validate required fields
      if (!toolId || !dataPointKey || !label || !description || !category) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
      }
      
      // For MVP, just return success - real implementation will update user's privacy settings
      res.json({
        success: true,
        dataPointKey,
        toolId,
        message: 'Data point registered successfully'
      });
      
    } catch (error) {
      this.logger.error('Register data point error', { error });
      res.status(500).json({ error: 'Failed to register data point' });
    }
  }

  public start(port: number = parseInt(process.env['PORT'] || '3001')): void {
    this.server.listen(port, () => {
      this.logger.info(`Production server started on port ${port}`, {
        port,
        environment: process.env['NODE_ENV'] || 'development',
        timestamp: new Date().toISOString()
      });
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getIO(): Server {
    return this.io;
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new ProductionServer();
  server.start();
}

export default ProductionServer; 