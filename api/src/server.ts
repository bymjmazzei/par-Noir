/**
 * Production API Server for Identity Protocol
 * Simplified production-ready server implementation
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Always include these origins, even if ALLOWED_ORIGINS env var is set
const DEFAULT_ORIGINS = [
  'https://parnoir.com',
  'https://pn.parnoir.com',
  'https://pn-parnoir.web.app',
  'https://par-noir-dashboard.web.app',
  'https://browse.parnoir.com',
  'http://localhost:3000',
  'http://localhost:3001'
];

const ENV_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...ENV_ORIGINS])]; // Merge and deduplicate

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
});

class ProductionServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST']
      }
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSockets();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }
        if (ALLOWED_ORIGINS.includes(origin)) {
          if (NODE_ENV === 'development') {
            console.log(`[CORS] Allowing origin: ${origin}`);
          }
          callback(null, true);
        } else {
          console.error(`[CORS] Blocked origin: ${origin}. Allowed origins:`, ALLOWED_ORIGINS);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['Content-Type'],
      maxAge: 86400, // 24 hours
      preflightContinue: false, // Handle preflight immediately
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      if (NODE_ENV === 'development') {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      }
      next();
    });
  }

  /**
   * Helper to get file type from MIME type
   */
  private getFileTypeFromMime(mimeType?: string): string {
    if (!mimeType) return 'other';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
    return 'other';
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV
      });
    });

    // API status endpoint
    this.app.get('/api/status', (req, res) => {
      res.json({
        service: 'Identity Protocol API',
        version: '1.0.0',
        status: 'operational',
        timestamp: new Date().toISOString()
      });
    });

    // Debug endpoint to check OAuth configuration (without exposing secrets)
    this.app.get('/api/debug/oauth-config', (req, res) => {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
      const hasClientSecret = !!process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const clientSecretLength = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.length || 0;
      
      res.json({
        hasClientId: !!clientId,
        clientId: clientId,
        hasClientSecret: hasClientSecret,
        clientSecretLength: clientSecretLength,
        clientSecretFirstChars: process.env.GOOGLE_DRIVE_CLIENT_SECRET ? process.env.GOOGLE_DRIVE_CLIENT_SECRET.substring(0, 4) + '...' : 'MISSING',
        environment: NODE_ENV
      });
    });

    // Authentication endpoints with rate limiting (skip OPTIONS for CORS preflight)
    this.app.use('/api/auth', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        return next(); // Skip rate limiting for OPTIONS requests
      }
      authLimiter(req, res, next);
    });
    this.app.post('/api/auth/challenge', (req, res) => {
      // Generate authentication challenge
      const challenge = this.generateChallenge();
      res.json({ challenge, expiresAt: Date.now() + 300000 }); // 5 minutes
    });

    this.app.post('/api/auth/verify', (req, res) => {
      // Verify authentication response
      const { challenge, signature, publicKey } = req.body;
      
      if (!challenge || !signature || !publicKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // In production, implement proper signature verification
      return res.json({ 
        success: true, 
        token: this.generateToken(),
        expiresIn: 3600 // 1 hour
      });
    });

    // DID management endpoints
    this.app.post('/api/did/create', (req, res) => {
      // Create new DID
      const { username, publicKey } = req.body;
      
      if (!username || !publicKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const did = `did:key:${this.generateDID(username, publicKey)}`;
      return res.json({ did, createdAt: new Date().toISOString() });
    });

    // Aggregator metadata index endpoints
    // GET /api/aggregator/metadata-index - Query public metadata
    this.app.get('/api/aggregator/metadata-index', async (req, res) => {
      try {
        const { AggregatorMetadataService } = await import('./server/modules/aggregatorMetadataService');
        const service = AggregatorMetadataService.getInstance();

        // Parse query parameters
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const fileType = req.query.fileType as string | undefined;
        const authorDid = req.query.authorDid as string | undefined;

        const response = service.getIndexResponse({
          tags,
          fileType,
          authorDid
        });

        console.log(`📤 [GET /api/aggregator/metadata-index] Returning ${response.files.length} files`);
        res.json(response);
      } catch (error: any) {
        console.error('❌ [GET /api/aggregator/metadata-index] Error:', error);
        res.status(500).json({ 
          error: 'Failed to fetch metadata index',
          message: error.message 
        });
      }
    });

    // POST /api/aggregator/metadata-index - Submit public metadata
    this.app.post('/api/aggregator/metadata-index', async (req, res) => {
      let requestId = Math.random().toString(36).substring(7);
      try {
        console.log(`📥 [${requestId}] [POST /api/aggregator/metadata-index] Received request`);
        
        const { AggregatorMetadataService } = await import('./server/modules/aggregatorMetadataService');
        const service = AggregatorMetadataService.getInstance();

        const { file, submittedAt, pnIdentifier } = req.body;

        // Handle both formats: { file: { metadata: {...} } } and { metadata: {...} }
        const metadata = file?.metadata || req.body.metadata;
        
        // Log incoming request for debugging
        console.log(`📥 [${requestId}] Request body keys:`, Object.keys(req.body));
        console.log(`📥 [${requestId}] Metadata keys:`, metadata ? Object.keys(metadata) : 'No metadata');
        console.log(`📥 [${requestId}] File type:`, metadata?.fileType || metadata?.mimeType || 'unknown');
        
        // Validate metadata structure
        if (!metadata) {
          console.error(`❌ [${requestId}] No metadata object received`);
          return res.status(400).json({ 
            error: 'Missing metadata object',
            requestId
          });
        }

        if (!metadata.fileId) {
          console.error(`❌ [${requestId}] Missing fileId`);
          console.error(`❌ [${requestId}] Metadata received:`, JSON.stringify(metadata, null, 2));
          return res.status(400).json({ 
            error: 'Missing required field: fileId',
            requestId,
            receivedKeys: Object.keys(metadata)
          });
        }

        // Validate metadata (support both legacy and semantic web format)
        const title = metadata.name || metadata.title;
        const authorDid = metadata.creator?.identifier?.value || metadata.creator?.["@id"] || metadata.author?.did;
        
        // More lenient validation - allow missing fields with defaults
        const validatedMetadata = {
          ...metadata,
          backend: metadata.backend || 'google_drive',
          backendFileId: metadata.backendFileId || metadata.fileId,
          name: title || metadata.fileId || 'Untitled',
          uploadDate: metadata.uploadDate || new Date().toISOString(),
          isPublic: metadata.isPublic !== false, // Default to true if not specified
          fileType: metadata.fileType || this.getFileTypeFromMime(metadata.mimeType) || 'other'
        };

        // Only require fileId - other fields can be optional
        if (!validatedMetadata.fileId) {
          console.error(`❌ [${requestId}] Missing fileId after validation`);
          return res.status(400).json({ 
            error: 'Missing required field: fileId after validation',
            requestId
          });
        }

        console.log(`📝 [${requestId}] Submitting metadata for file: ${validatedMetadata.fileId}`);

        // Submit metadata to central index
        service.submitMetadata(validatedMetadata, pnIdentifier);

        console.log(`✅ [${requestId}] Successfully submitted metadata for: ${validatedMetadata.fileId}`);
        return res.json({
          success: true,
          fileId: validatedMetadata.fileId,
          submittedAt: submittedAt || new Date().toISOString(),
          requestId
        });
      } catch (error: any) {
        console.error(`❌ [${requestId}] [POST /api/aggregator/metadata-index] Error:`, error);
        console.error(`❌ [${requestId}] Error message:`, error?.message);
        console.error(`❌ [${requestId}] Error stack:`, error?.stack);
        console.error(`❌ [${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
        return res.status(500).json({ 
          error: 'Failed to submit metadata',
          message: error?.message || 'Unknown error',
          requestId,
          stack: NODE_ENV === 'development' ? error?.stack : undefined
        });
      }
    });

    // DELETE /api/aggregator/metadata-index/:fileId - Remove public metadata
    this.app.delete('/api/aggregator/metadata-index/:fileId', (req, res) => {
      try {
        const { AggregatorMetadataService } = require('./server/modules/aggregatorMetadataService');
        const service = AggregatorMetadataService.getInstance();

        const { fileId } = req.params;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        const removed = service.removeMetadata(fileId);

        if (removed) {
          return res.json({ success: true, fileId });
        } else {
          return res.status(404).json({ error: 'File not found in index' });
        }
      } catch (error: any) {
        console.error('Error removing aggregator metadata:', error);
        return res.status(500).json({ 
          error: 'Failed to remove metadata',
          message: error.message 
        });
      }
    });

    // GET /api/aggregator/metadata-index/stats - Get index statistics
    this.app.get('/api/aggregator/metadata-index/stats', (req, res) => {
      try {
        const { AggregatorMetadataService } = require('./server/modules/aggregatorMetadataService');
        const service = AggregatorMetadataService.getInstance();

        const stats = service.getStats();
        res.json(stats);
      } catch (error: any) {
        console.error('Error fetching aggregator stats:', error);
        res.status(500).json({ 
          error: 'Failed to fetch stats',
          message: error.message 
        });
      }
    });
    // POST /api/auth/google-oauth/token - Exchange authorization code for tokens
    this.app.post('/api/auth/google-oauth/token', async (req, res) => {
      try {
        const { code, redirectUri } = req.body;
        
        console.log('[Google OAuth Token Exchange] Request received:', {
          hasCode: !!code,
          redirectUri,
          origin: req.headers.origin
        });
        
        if (!code || !redirectUri) {
          return res.status(400).json({
            error: 'Missing required fields',
            required: ['code', 'redirectUri']
          });
        }

        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
        const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
        
        console.log('[Google OAuth Token Exchange] Client ID:', clientId);
        console.log('[Google OAuth Token Exchange] Client secret length:', clientSecret?.length || 0);
        console.log('[Google OAuth Token Exchange] Client secret first 4 chars:', clientSecret ? clientSecret.substring(0, 4) + '...' : 'MISSING');
        
        if (!clientSecret || clientSecret.trim() === '') {
          console.error('⚠️ GOOGLE_DRIVE_CLIENT_SECRET not configured or empty');
          return res.status(500).json({
            error: 'OAuth configuration error',
            message: 'Google OAuth client secret not configured on server. Please set GOOGLE_DRIVE_CLIENT_SECRET environment variable in Railway.',
            details: {
              hasClientSecret: !!clientSecret,
              clientSecretLength: clientSecret?.length || 0,
              clientId: clientId
            }
          });
        }

        const tokenRequestBody = new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        });

        console.log('[Google OAuth Token Exchange] Requesting token from Google...');
        
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: tokenRequestBody,
        });

        const responseText = await tokenResponse.text();
        console.log('[Google OAuth Token Exchange] Google response status:', tokenResponse.status);
        console.log('[Google OAuth Token Exchange] Google response length:', responseText.length);
        console.log('[Google OAuth Token Exchange] Google response (first 500 chars):', responseText.substring(0, 500));

        if (!tokenResponse.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch {
            errorData = { error: responseText };
          }
          
          console.error('[Google OAuth Token Exchange] Token exchange failed:', {
            status: tokenResponse.status,
            error: errorData,
            redirectUri: redirectUri,
            clientId: clientId,
            codeLength: code?.length || 0
          });
          
          // Return 500 instead of passing through Google's status code to avoid confusion
          return res.status(500).json({
            error: 'Token exchange failed',
            message: errorData.error_description || errorData.error || 'Failed to exchange authorization code with Google',
            details: {
              googleError: errorData,
              httpStatus: tokenResponse.status,
              redirectUri: redirectUri,
              clientId: clientId
            }
          });
        }

        // Parse the response text we already read
        let tokenData: {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
        };
        try {
          tokenData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Google OAuth Token Exchange] Failed to parse token response:', parseError);
          return res.status(500).json({
            error: 'Invalid response from Google',
            message: 'Failed to parse token response from Google OAuth API'
          });
        }

        return res.json({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type || 'Bearer',
        });
      } catch (error: any) {
        console.error('Error exchanging Google OAuth code:', error);
        return res.status(500).json({
          error: 'Failed to exchange authorization code',
          message: error.message
        });
      }
    });

    this.app.get('/api/did/:did', (req, res) => {
      // Resolve DID document
      const { did } = req.params;
      
      // In production, implement proper DID resolution
      res.json({
        '@context': 'https://www.w3.org/ns/did/v1',
        id: did,
        publicKey: [{
          id: `${did}#key-1`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }]
      });
    });

    // Error handling middleware
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      const errorResponse = {
        error: 'Internal Server Error',
        status: 500,
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
      };

      if (NODE_ENV === 'development') {
        (errorResponse as any).error = err.message;
        (errorResponse as any).stack = err.stack;
      }

      res.status(500).json(errorResponse);
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupWebSockets(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });

      // Handle authentication events
      socket.on('auth:challenge', (data) => {
        const challenge = this.generateChallenge();
        socket.emit('auth:challenge', { challenge });
      });

      // Handle DID events
      socket.on('did:resolve', (data) => {
        const { did } = data;
        // Implement DID resolution logic
        socket.emit('did:resolved', { did, document: {} });
      });
    });
  }

  private generateChallenge(): string {
    const timestamp = Date.now();
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
    return `challenge_${timestamp}_${random}`;
  }

  private generateToken(): string {
    const timestamp = Date.now();
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
    return `token_${timestamp}_${random}`;
  }

  private generateDID(username: string, publicKey: string): string {
    const timestamp = Date.now();
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
    return `${username}_${timestamp}_${random}`;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(PORT, () => {
        console.log(`🚀 Identity Protocol API Server running on port ${PORT}`);
        console.log(`📊 Environment: ${NODE_ENV}`);
        console.log(`🔒 CORS Origins: ${ALLOWED_ORIGINS.join(', ')}`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        console.error('Failed to start server:', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('Server stopped');
        resolve();
      });
    });
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new ProductionServer();
  
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}

export { ProductionServer };
export default ProductionServer;
