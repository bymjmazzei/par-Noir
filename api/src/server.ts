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
    
    // Trust proxy for Railway/deployment platforms (needed for rate limiting)
    this.app.set('trust proxy', 1);
    
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

    // Body parsing - increased limit for large video metadata with encrypted tokens
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    // Request logging (development only)
    this.app.use((req, res, next) => {
      if (NODE_ENV === 'development') {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
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

    // Third-party indexers catalog
    this.app.get('/api/third-party/indexers', async (req, res) => {
      try {
        const { getThirdPartyIndexersService } = await import('./server/modules/thirdPartyIndexersService');
        const service = getThirdPartyIndexersService();
        const identity = typeof req.query.identity === 'string' ? req.query.identity : undefined;

        const [indexers, access] = await Promise.all([
          service.listIndexers(),
          identity ? service.getAccessForIdentity(identity) : Promise.resolve([])
        ]);

        const accessMap = access.reduce<Record<string, boolean>>((acc, entry) => {
          acc[entry.thirdPartyId] = entry.isEnabled;
          return acc;
        }, {});

        const response = indexers.map((indexer) => ({
          ...indexer,
          isAuthorized: identity ? !!accessMap[indexer.id] : undefined
        }));

        res.json({
          indexers: response,
          access
        });
      } catch (error: any) {
        console.error('❌ [GET /api/third-party/indexers] Error:', error);
        res.status(500).json({
          error: 'Failed to load third-party indexers',
          message: error.message
        });
      }
    });

    this.app.put('/api/third-party/access/:identity', async (req, res) => {
      const identity = req.params.identity;

      if (!identity) {
        res.status(400).json({ error: 'Identity is required' });
        return;
      }

      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

      try {
        const { getThirdPartyIndexersService } = await import('./server/modules/thirdPartyIndexersService');
        const service = getThirdPartyIndexersService();
        await service.upsertAccess(identity, updates);

        const access = await service.getAccessForIdentity(identity);
        res.json({ success: true, access });
      } catch (error: any) {
        console.error('❌ [PUT /api/third-party/access] Error:', error);
        res.status(500).json({
          error: 'Failed to update third-party access',
          message: error.message
        });
      }
    });

    this.app.get('/api/third-party/files/:fileId/index-visibility', async (req, res) => {
      const { fileId } = req.params;

      if (!fileId) {
        res.status(400).json({ error: 'fileId parameter is required' });
        return;
      }

      try {
        const [{ AggregatorMetadataServiceDB }, { getThirdPartyIndexersService }] = await Promise.all([
          import('./server/modules/aggregatorMetadataServiceDB'),
          import('./server/modules/thirdPartyIndexersService')
        ]);

        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const service = getThirdPartyIndexersService();

        const metadataEntry = await aggregator.getFileMetadata(fileId);
        const overrides = await service.getFileOverrides(fileId);

        res.json({
          indexingPermissions: metadataEntry?.metadata.indexingPermissions || null,
          overrides
        });
      } catch (error: any) {
        console.error('❌ [GET /api/third-party/files/:fileId/index-visibility] Error:', error);
        res.status(500).json({
          error: 'Failed to load file indexing visibility',
          message: error.message
        });
      }
    });

    this.app.put('/api/third-party/files/:fileId/index-visibility', async (req, res) => {
      const { fileId } = req.params;
      const { indexingPermissions } = req.body || {};

      if (!fileId) {
        res.status(400).json({ error: 'fileId parameter is required' });
        return;
      }

      try {
        const [{ AggregatorMetadataServiceDB }, { getThirdPartyIndexersService }] = await Promise.all([
          import('./server/modules/aggregatorMetadataServiceDB'),
          import('./server/modules/thirdPartyIndexersService')
        ]);

        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const service = getThirdPartyIndexersService();

        const updatedMetadata = await aggregator.updateIndexingPermissions(fileId, indexingPermissions);

        // Derive overrides from permissions
        const overridesPayload: { thirdPartyId: string; isAllowed: boolean }[] = [];
        if (indexingPermissions) {
          const mode = indexingPermissions.mode || 'all';
          if (mode === 'custom') {
            (indexingPermissions.allowed || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: true });
            });
            (indexingPermissions.blocked || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: false });
            });
          } else if (mode === 'all') {
            (indexingPermissions.blocked || []).forEach((id: string) => {
              overridesPayload.push({ thirdPartyId: id, isAllowed: false });
            });
          } else if (mode === 'none') {
            // No overrides needed; absence represents full restriction.
          }
        }

        await service.setFileOverrides(fileId, overridesPayload);

        res.json({
          success: true,
          indexingPermissions: updatedMetadata?.indexingPermissions || indexingPermissions || null
        });
      } catch (error: any) {
        console.error('❌ [PUT /api/third-party/files/:fileId/index-visibility] Error:', error);
        res.status(500).json({
          error: 'Failed to update file indexing visibility',
          message: error.message
        });
      }
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

    // pN OAuth 2.0 endpoints
    this.setupPNOAuthEndpoints();

    // Notification endpoints
    this.setupNotificationEndpoints();

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
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const fileType = req.query.fileType as string | undefined;
        const authorDid = req.query.authorDid as string | undefined;
        const indexerId = req.query.indexerId as string | undefined;
        const debug = req.query.debug === 'true';

        const response = await service.getIndexResponse({
          tags,
          fileType,
          authorDid,
          indexerId
        });

        if (debug) {
          // Debug mode: return additional info
          const db = (await import('./server/utils/database')).getDatabasePool();
          const allFiles = await db.query(`
            SELECT file_id, metadata->>'isPublic' as is_public, metadata->>'name' as name, updated_at
            FROM aggregator_metadata
            ORDER BY updated_at DESC
            LIMIT 100
          `);
          
          return res.json({
            ...response,
            debug: {
              totalInDatabase: allFiles.rows.length,
              publicInDatabase: allFiles.rows.filter((r: any) => r.is_public === 'true').length,
              sampleFiles: allFiles.rows.slice(0, 10).map((r: any) => ({
                fileId: r.file_id,
                isPublic: r.is_public,
                name: r.name,
                updatedAt: r.updated_at
              }))
            }
          });
        }

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
        
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

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
        await service.submitMetadata(validatedMetadata, pnIdentifier);

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
    this.app.delete('/api/aggregator/metadata-index/:fileId', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { fileId } = req.params;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        const removed = await service.removeMetadata(fileId);

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
    this.app.get('/api/aggregator/metadata-index/stats', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const stats = await service.getStats();
        res.json(stats);
      } catch (error: any) {
        console.error('Error fetching aggregator stats:', error);
        res.status(500).json({ 
          error: 'Failed to fetch stats',
          message: error.message 
        });
      }
    });

    // PUT /api/aggregator/metadata-index/:fileId - Update metadata
    this.app.put('/api/aggregator/metadata-index/:fileId', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { fileId } = req.params;
        const { 
          name, 
          description, 
          keywords, 
          tags,
          genre,
          category,
          locationCreated,
          license,
          inLanguage
        } = req.body;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        const updated = await service.updateMetadata(fileId, {
          name,
          description,
          keywords: keywords || tags,
          tags: tags || keywords,
          genre,
          category,
          locationCreated,
          license,
          inLanguage
        });

        if (!updated) {
          return res.status(404).json({ error: 'File not found in index' });
        }

        return res.json({ success: true, metadata: updated });
      } catch (error: any) {
        console.error('Error updating metadata:', error);
        return res.status(500).json({ 
          error: 'Failed to update metadata',
          message: error.message 
        });
      }
    });

    // PUT /api/storage/credentials/:identityId - Save storage credentials (server encrypted)
    this.app.put('/api/storage/credentials/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;
        const { credentials, cid } = req.body;

        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        if (!credentials) {
          return res.status(400).json({ error: 'Missing credentials in request body' });
        }

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const record = await storageCredentialsService.upsertCredentials(identityId, credentials, cid);

        return res.json({
          success: true,
          identityId: record.identityId,
          cid: record.cid ?? null,
          updatedAt: record.updatedAt
        });
      } catch (error: any) {
        console.error('Error saving storage credentials:', error);
        return res.status(500).json({
          error: 'Failed to save storage credentials',
          message: error.message
        });
      }
    });

    // GET /api/storage/credentials/:identityId - Retrieve encrypted storage credentials
    this.app.get('/api/storage/credentials/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;

        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const record = await storageCredentialsService.getCredentials(identityId);

        if (!record) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        return res.json({
          success: true,
          identityId: record.identityId,
          credentials: record.credentials,
          cid: record.cid,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt
        });
      } catch (error: any) {
        console.error('Error retrieving storage credentials:', error);
        return res.status(500).json({
          error: 'Failed to retrieve storage credentials',
          message: error.message
        });
      }
    });

    // POST /api/aggregator/engagement/:fileId/:type - Update engagement metrics
    this.app.post('/api/aggregator/engagement/:fileId/:type', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { fileId, type } = req.params;
        const { userDid } = req.body;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        if (!['like', 'view', 'share', 'comment'].includes(type)) {
          return res.status(400).json({ error: 'Invalid engagement type. Must be: like, view, share, or comment' });
        }

        const updated = await service.updateEngagement(
          fileId,
          type as 'like' | 'view' | 'share' | 'comment',
          userDid
        );

        if (!updated) {
          return res.status(404).json({ error: 'File not found in index' });
        }

        return res.json({ 
          success: true, 
          engagement: updated.engagement,
          metadata: updated
        });
      } catch (error: any) {
        console.error('Error updating engagement:', error);
        return res.status(500).json({ 
          error: 'Failed to update engagement',
          message: error.message 
        });
      }
    });

    // ============================================================================
    // Engagement APIs (Enhanced)
    // ============================================================================

    // POST /api/engagement/:fileId/like - Toggle like
    this.app.post('/api/engagement/:fileId/like', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        const { userDid } = req.body;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid is required' });
        }

        const result = await EngagementService.toggleLike(fileId, userDid);

        return res.json({
          success: true,
          liked: result.liked,
          count: result.count
        });
      } catch (error: any) {
        console.error('Error toggling like:', error);
        return res.status(500).json({ error: 'Failed to toggle like', message: error.message });
      }
    });

    // GET /api/engagement/:fileId/like - Check if liked
    this.app.get('/api/engagement/:fileId/like', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        const { userDid } = req.query;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid query parameter is required' });
        }

        const liked = await EngagementService.isLiked(fileId, userDid as string);

        return res.json({ liked });
      } catch (error: any) {
        console.error('Error checking like:', error);
        return res.status(500).json({ error: 'Failed to check like', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/comment - Add comment
    // File owner has the content, pN commentor references it
    this.app.post('/api/engagement/:fileId/comment', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        const { userDid, content, authorName, fileOwnerDid } = req.body;

        if (!userDid || !content) {
          return res.status(400).json({ error: 'userDid and content are required' });
        }

        const comment = await EngagementService.addComment(
          fileId, 
          userDid, 
          content, 
          authorName,
          fileOwnerDid // Optional - will be fetched from metadata if not provided
        );

        return res.status(201).json({
          ...comment,
          note: 'File owner owns content; commentor references it'
        });
      } catch (error: any) {
        console.error('Error adding comment:', error);
        return res.status(500).json({ error: 'Failed to add comment', message: error.message });
      }
    });

    // GET /api/engagement/:fileId/comments - Get comments
    this.app.get('/api/engagement/:fileId/comments', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;

        const comments = await EngagementService.getComments(fileId);

        return res.json({
          fileId,
          comments,
          count: comments.length
        });
      } catch (error: any) {
        console.error('Error getting comments:', error);
        return res.status(500).json({ error: 'Failed to get comments', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/share - Record share
    this.app.post('/api/engagement/:fileId/share', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        const { userDid } = req.body;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid is required' });
        }

        const count = await EngagementService.recordShare(fileId, userDid);

        return res.json({
          success: true,
          count
        });
      } catch (error: any) {
        console.error('Error recording share:', error);
        return res.status(500).json({ error: 'Failed to record share', message: error.message });
      }
    });

    // GET /api/engagement/:fileId/stats - Get engagement stats
    this.app.get('/api/engagement/:fileId/stats', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;

        const stats = await EngagementService.getEngagementStats(fileId);

        return res.json({
          fileId,
          ...stats
        });
      } catch (error: any) {
        console.error('Error getting engagement stats:', error);
        return res.status(500).json({ error: 'Failed to get engagement stats', message: error.message });
      }
    });

    // POST /api/engagement/bulk-stats - Get engagement stats for multiple files
    this.app.post('/api/engagement/bulk-stats', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileIds, userDid } = req.body;

        if (!fileIds || !Array.isArray(fileIds)) {
          return res.status(400).json({ error: 'fileIds array is required' });
        }

        const statsMap = await EngagementService.getBulkEngagementStats(fileIds);

        // Convert Map to object for JSON response
        const stats: Record<string, any> = {};
        statsMap.forEach((value, key) => {
          stats[key] = value;
        });

        // Also check which files the user has liked if userDid is provided
        const likedFiles: string[] = [];
        if (userDid && fileIds.length > 0) {
          const likedSet = await EngagementService.getBulkLikedFiles(fileIds, userDid);
          likedFiles.push(...Array.from(likedSet));
        }

        return res.json({
          stats,
          likedFiles,
          count: fileIds.length
        });
      } catch (error: any) {
        console.error('Error getting bulk engagement stats:', error);
        return res.status(500).json({ error: 'Failed to get bulk engagement stats', message: error.message });
      }
    });

    // GET /api/aggregator/curated/:did - Get curated feed for a DID
    // ============================================================================
    // Feed Management APIs
    // ============================================================================

    // POST /api/feeds - Create a new feed
    this.app.post('/api/feeds', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedName, feedCategory, feedDescription, creatorDid, creatorTier, feedRatingRange, branding } = req.body;

        if (!feedName || !creatorDid) {
          return res.status(400).json({ error: 'feedName and creatorDid are required' });
        }

        // Only paid tiers can create feeds
        if (creatorTier === 'free') {
          return res.status(403).json({ error: 'Free tier cannot create feeds. Upgrade to feed or self-hosted tier.' });
        }

        const feed = await FeedService.createFeed({
          feedName,
          feedCategory,
          feedDescription,
          creatorDid,
          creatorTier: creatorTier || 'feed',
          feedRatingRange,
          branding
        });

        return res.status(201).json(feed);
      } catch (error: any) {
        console.error('Error creating feed:', error);
        return res.status(500).json({ error: 'Failed to create feed', message: error.message });
      }
    });

    // GET /api/feeds - List feeds with filters
    this.app.get('/api/feeds', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { category, creatorDid, creatorTier, search, limit, offset } = req.query;

        const result = await FeedService.listFeeds({
          category: category as any,
          creatorDid: creatorDid as string,
          creatorTier: creatorTier as any,
          search: search as string,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined
        });

        return res.json({
          feeds: result.feeds,
          total: result.total,
          limit: limit ? parseInt(limit as string, 10) : undefined,
          offset: offset ? parseInt(offset as string, 10) : undefined
        });
      } catch (error: any) {
        console.error('Error listing feeds:', error);
        return res.status(500).json({ error: 'Failed to list feeds', message: error.message });
      }
    });

    // GET /api/feeds/:feedId - Get feed by ID
    this.app.get('/api/feeds/:feedId', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;

        const feed = await FeedService.getFeedById(feedId);

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json(feed);
      } catch (error: any) {
        console.error('Error getting feed:', error);
        return res.status(500).json({ error: 'Failed to get feed', message: error.message });
      }
    });

    // PUT /api/feeds/:feedId - Update feed
    this.app.put('/api/feeds/:feedId', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;
        const { feedName, feedDescription, feedCategory, ratingRange, branding, creatorDid } = req.body;

        // Verify creator owns the feed
        const existingFeed = await FeedService.getFeedById(feedId);
        if (!existingFeed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        if (existingFeed.creatorId !== creatorDid) {
          return res.status(403).json({ error: 'Only feed creator can update feed' });
        }

        const feed = await FeedService.updateFeed(feedId, {
          feedName,
          feedDescription,
          feedCategory,
          ratingRange,
          branding
        });

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json(feed);
      } catch (error: any) {
        console.error('Error updating feed:', error);
        return res.status(500).json({ error: 'Failed to update feed', message: error.message });
      }
    });

    // DELETE /api/feeds/:feedId - Delete feed
    this.app.delete('/api/feeds/:feedId', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;
        const { creatorDid } = req.body;

        if (!creatorDid) {
          return res.status(400).json({ error: 'creatorDid is required' });
        }

        const deleted = await FeedService.deleteFeed(feedId, creatorDid);

        if (!deleted) {
          return res.status(404).json({ error: 'Feed not found or unauthorized' });
        }

        return res.json({ success: true, message: 'Feed deleted' });
      } catch (error: any) {
        console.error('Error deleting feed:', error);
        return res.status(500).json({ error: 'Failed to delete feed', message: error.message });
      }
    });

    // GET /api/feeds/:feedId/posts - Get posts in feed
    this.app.get('/api/feeds/:feedId/posts', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;

        const fileIds = await FeedService.getFeedPosts(feedId);

        return res.json({
          feedId,
          fileIds,
          count: fileIds.length
        });
      } catch (error: any) {
        console.error('Error getting feed posts:', error);
        return res.status(500).json({ error: 'Failed to get feed posts', message: error.message });
      }
    });

    // POST /api/feeds/:feedId/posts - Add post to feed
    this.app.post('/api/feeds/:feedId/posts', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;
        const { fileId, addedBy } = req.body;

        if (!fileId || !addedBy) {
          return res.status(400).json({ error: 'fileId and addedBy are required' });
        }

        // Verify creator owns the feed
        const feed = await FeedService.getFeedById(feedId);
        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        if (feed.creatorId !== addedBy) {
          return res.status(403).json({ error: 'Only feed creator can add posts' });
        }

        const success = await FeedService.addPostToFeed(feedId, fileId, addedBy);

        if (!success) {
          return res.status(500).json({ error: 'Failed to add post to feed' });
        }

        return res.json({ success: true, message: 'Post added to feed' });
      } catch (error: any) {
        console.error('Error adding post to feed:', error);
        return res.status(500).json({ error: 'Failed to add post to feed', message: error.message });
      }
    });

    // DELETE /api/feeds/:feedId/posts/:fileId - Remove post from feed
    this.app.delete('/api/feeds/:feedId/posts/:fileId', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId, fileId } = req.params;
        const { creatorDid } = req.body;

        if (!creatorDid) {
          return res.status(400).json({ error: 'creatorDid is required' });
        }

        // Verify creator owns the feed
        const feed = await FeedService.getFeedById(feedId);
        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        if (feed.creatorId !== creatorDid) {
          return res.status(403).json({ error: 'Only feed creator can remove posts' });
        }

        const success = await FeedService.removePostFromFeed(feedId, fileId);

        if (!success) {
          return res.status(500).json({ error: 'Failed to remove post from feed' });
        }

        return res.json({ success: true, message: 'Post removed from feed' });
      } catch (error: any) {
        console.error('Error removing post from feed:', error);
        return res.status(500).json({ error: 'Failed to remove post from feed', message: error.message });
      }
    });

    // ============================================================================
    // Feed Subscription APIs
    // ============================================================================

    // POST /api/feeds/:feedId/subscribe - Subscribe to feed
    // Creator stores subscriber info on their Google Drive
    // Subscriber stores local reference (handled by frontend)
    this.app.post('/api/feeds/:feedId/subscribe', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;
        const { userDid, creatorGoogleTokens } = req.body;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid is required' });
        }

        // Note: creatorGoogleTokens is optional - if creator doesn't have Drive connected,
        // subscription is stored in database only and can sync to Drive later

        const success = await FeedService.subscribeToFeed(feedId, userDid, creatorGoogleTokens);

        if (!success) {
          return res.status(500).json({ error: 'Failed to subscribe to feed' });
        }

        return res.json({ 
          success: true, 
          message: 'Subscribed to feed',
          note: 'Subscription stored in database and creator Google Drive (if connected)'
        });
      } catch (error: any) {
        console.error('Error subscribing to feed:', error);
        return res.status(500).json({ error: 'Failed to subscribe to feed', message: error.message });
      }
    });

    // DELETE /api/feeds/:feedId/subscribe - Unsubscribe from feed
    this.app.delete('/api/feeds/:feedId/subscribe', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;
        const { userDid } = req.body;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid is required' });
        }

        const success = await FeedService.unsubscribeFromFeed(feedId, userDid);

        if (!success) {
          return res.status(500).json({ error: 'Failed to unsubscribe from feed' });
        }

        return res.json({ success: true, message: 'Unsubscribed from feed' });
      } catch (error: any) {
        console.error('Error unsubscribing from feed:', error);
        return res.status(500).json({ error: 'Failed to unsubscribe from feed', message: error.message });
      }
    });

    // GET /api/users/:userDid/subscriptions - Get user's subscriptions
    this.app.get('/api/users/:userDid/subscriptions', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { userDid } = req.params;

        const feeds = await FeedService.getUserSubscriptions(userDid);

        return res.json({
          userDid,
          feeds,
          count: feeds.length
        });
      } catch (error: any) {
        console.error('Error getting user subscriptions:', error);
        return res.status(500).json({ error: 'Failed to get subscriptions', message: error.message });
      }
    });

    // GET /api/feeds/:feedId/subscribers - Get feed subscribers count
    this.app.get('/api/feeds/:feedId/subscribers', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { feedId } = req.params;

        const feed = await FeedService.getFeedById(feedId);

        if (!feed) {
          return res.status(404).json({ error: 'Feed not found' });
        }

        return res.json({
          feedId,
          subscriberCount: feed.subscriberCount || 0
        });
      } catch (error: any) {
        console.error('Error getting feed subscribers:', error);
        return res.status(500).json({ error: 'Failed to get subscribers', message: error.message });
      }
    });

    // GET /api/creators/:creatorDid/subscribers - Get creator's subscriber index
    this.app.get('/api/creators/:creatorDid/subscribers', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { creatorDid } = req.params;

        const subscribers = await FeedService.getCreatorSubscriberIndex(creatorDid);

        return res.json({
          creatorDid,
          subscribers,
          count: subscribers.length
        });
      } catch (error: any) {
        console.error('Error getting creator subscriber index:', error);
        return res.status(500).json({ error: 'Failed to get subscriber index', message: error.message });
      }
    });

    // ============================================================================
    // Feed Discovery APIs (Catalogue/Store Interface)
    // ============================================================================

    // GET /api/feeds/discover - Discover feeds with filters (categories, trending, new)
    this.app.get('/api/feeds/discover', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { category, sort = 'new', limit = 20, offset = 0 } = req.query;

        const result = await FeedService.discoverFeeds({
          category: category as any,
          sort: sort as 'new' | 'trending' | 'popular',
          limit: limit ? parseInt(limit as string, 10) : 20,
          offset: offset ? parseInt(offset as string, 10) : 0
        });

        return res.json(result);
      } catch (error: any) {
        console.error('Error discovering feeds:', error);
        return res.status(500).json({ error: 'Failed to discover feeds', message: error.message });
      }
    });

    // GET /api/feeds/categories - List all feed categories with counts
    this.app.get('/api/feeds/categories', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const categories = await FeedService.getFeedCategories();

        return res.json({
          categories,
          total: categories.reduce((sum, cat) => sum + cat.count, 0)
        });
      } catch (error: any) {
        console.error('Error getting feed categories:', error);
        return res.status(500).json({ error: 'Failed to get categories', message: error.message });
      }
    });

    // GET /api/feeds/trending - Get trending feeds
    this.app.get('/api/feeds/trending', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { limit = 20, category } = req.query;

        const feeds = await FeedService.getTrendingFeeds({
          limit: limit ? parseInt(limit as string, 10) : 20,
          category: category as any
        });

        return res.json({
          feeds,
          count: feeds.length,
          period: '7d' // Last 7 days
        });
      } catch (error: any) {
        console.error('Error getting trending feeds:', error);
        return res.status(500).json({ error: 'Failed to get trending feeds', message: error.message });
      }
    });

    // GET /api/feeds/recommended - Get recommended feeds for user
    this.app.get('/api/feeds/recommended', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { userDid, limit = 10 } = req.query;

        if (!userDid) {
          return res.status(400).json({ error: 'userDid is required' });
        }

        const feeds = await FeedService.getRecommendedFeeds({
          userDid: userDid as string,
          limit: limit ? parseInt(limit as string, 10) : 10
        });

        return res.json({
          feeds,
          count: feeds.length,
          userDid
        });
      } catch (error: any) {
        console.error('Error getting recommended feeds:', error);
        return res.status(500).json({ error: 'Failed to get recommended feeds', message: error.message });
      }
    });

    this.app.get('/api/aggregator/curated/:did', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { did } = req.params;

        if (!did) {
          return res.status(400).json({ error: 'Missing DID parameter' });
        }

        const entries = await service.getCuratedFeed(did);

        return res.json({
          did,
          files: entries,
          totalFiles: entries.length,
          updatedAt: new Date().toISOString()
        });
      } catch (error: any) {
        console.error('Error getting curated feed:', error);
        return res.status(500).json({ 
          error: 'Failed to get curated feed',
          message: error.message 
        });
      }
    });

    // POST /api/aggregator/metadata-index/sync - Manually trigger Google Drive sync
    this.app.post('/api/aggregator/metadata-index/sync', async (req, res) => {
      try {
        const { GoogleDriveSyncService } = await import('./server/modules/googleDriveSyncService');
        const syncService = GoogleDriveSyncService.getInstance();

        console.log('🔄 Manual sync triggered via API');
        
        // Trigger sync (non-blocking)
        syncService.syncFromGoogleDrive().catch(error => {
          console.error('❌ Manual sync failed:', error);
        });

        res.json({
          success: true,
          message: 'Sync started',
          note: 'Sync runs in background. Check logs for progress.'
        });
      } catch (error: any) {
        console.error('Error triggering sync:', error);
        res.status(500).json({ 
          error: 'Failed to trigger sync',
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

    // POST /api/auth/google-oauth/refresh - Refresh access token using refresh token
    this.app.post('/api/auth/google-oauth/refresh', async (req, res) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          return res.status(400).json({
            error: 'Missing required fields',
            required: ['refreshToken'],
          });
        }

        const clientId =
          process.env.GOOGLE_DRIVE_CLIENT_ID ||
          '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
        const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

        if (!clientSecret || clientSecret.trim() === '') {
          console.error('⚠️ GOOGLE_DRIVE_CLIENT_SECRET not configured or empty for refresh flow');
          return res.status(500).json({
            error: 'OAuth configuration error',
            message:
              'Google OAuth client secret not configured on server. Please set GOOGLE_DRIVE_CLIENT_SECRET environment variable in Railway.',
            details: {
              hasClientSecret: !!clientSecret,
              clientSecretLength: clientSecret?.length || 0,
              clientId,
            },
          });
        }

        const refreshRequestBody = new URLSearchParams({
          refresh_token: refreshToken,
          client_id: clientId,
          grant_type: 'refresh_token',
        });

        if (clientSecret) {
          refreshRequestBody.set('client_secret', clientSecret);
        }

        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: refreshRequestBody,
        });

        const responseText = await refreshResponse.text();

        if (!refreshResponse.ok) {
          let errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch {
            errorData = { error: responseText };
          }

          console.error('[Google OAuth Refresh] Refresh failed:', {
            status: refreshResponse.status,
            error: errorData,
          });

          return res.status(500).json({
            error: 'Token refresh failed',
            message: errorData.error_description || errorData.error || 'Failed to refresh Google access token',
            details: {
              googleError: errorData,
              httpStatus: refreshResponse.status,
            },
          });
        }

        let tokenData: {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
        };

        try {
          tokenData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Google OAuth Refresh] Failed to parse token response:', parseError);
          return res.status(500).json({
            error: 'Invalid response from Google',
            message: 'Failed to parse token response from Google OAuth API',
          });
        }

        return res.json({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type || 'Bearer',
        });
      } catch (error: any) {
        console.error('Error refreshing Google OAuth token:', error);
        return res.status(500).json({
          error: 'Failed to refresh access token',
          message: error.message,
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

  /**
   * Setup pN OAuth 2.0 endpoints
   * Implements authorization code flow similar to Google OAuth
   */
  private setupPNOAuthEndpoints(): void {
    // Dynamic import to avoid circular dependencies
    const PNOAuthService = require('./server/modules/pnOAuthService').PNOAuthService;

    // GET /oauth/authorize - Authorization endpoint
    // This endpoint initiates the OAuth flow
    // Client should redirect user here with: client_id, redirect_uri, response_type=code, scope, state
    this.app.get('/oauth/authorize', (req, res) => {
      const { client_id, redirect_uri, response_type, scope, state, nonce } = req.query;

      // Validate required parameters
      if (!client_id || !redirect_uri || !response_type) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri, response_type'
        });
      }

      if (response_type !== 'code') {
        return res.status(400).json({
          error: 'unsupported_response_type',
          error_description: 'Only authorization_code flow is supported'
        });
      }

      // For now, return authorization page URL
      // In production, this would render an authorization page where user uploads pN file and enters passcode
      // For browser app, we'll handle this client-side
      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];
      
      res.json({
        authorization_url: `/oauth/authorize/consent?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&scope=${encodeURIComponent(scope as string || 'openid profile')}&state=${state || ''}&nonce=${nonce || ''}`,
        client_id,
        redirect_uri,
        scope: scopes,
        state: state || undefined,
        nonce: nonce || undefined
      });
    });

    // POST /oauth/authorize/authenticate - Authenticate user with pN identity
    // Client sends encrypted identity file and passcode
    // Server decrypts, verifies, and generates authorization code
    this.app.post('/oauth/authorize/authenticate', async (req, res) => {
      try {
        const { 
          client_id, 
          redirect_uri, 
          scope, 
          state, 
          nonce,
          encrypted_identity, // Encrypted pN identity file
          passcode,
          public_key, // Public key from identity
          pn_name // pN name (required for verification)
        } = req.body;

        if (!client_id || !redirect_uri || !encrypted_identity || !passcode || !public_key || !pn_name) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required fields: client_id, redirect_uri, encrypted_identity, passcode, public_key, pn_name'
          });
        }

        // Import crypto utilities
        const { decryptIdentity, verifyPnName } = await import('./utils/pnCrypto');

        // Decrypt and verify identity file
        let decryptedIdentity;
        try {
          decryptedIdentity = await decryptIdentity(
            {
              publicKey: public_key,
              encryptedData: encrypted_identity.encryptedData || encrypted_identity.encrypted,
              iv: encrypted_identity.iv,
              salt: encrypted_identity.salt
            },
            passcode
          );
        } catch (error: any) {
          return res.status(401).json({
            error: 'invalid_credentials',
            error_description: error.message || 'Failed to decrypt identity. Please check your passcode.'
          });
        }

        // Verify pN name matches
        if (!verifyPnName(decryptedIdentity, pn_name)) {
          return res.status(401).json({
            error: 'invalid_credentials',
            error_description: 'pN name does not match identity file'
          });
        }

        // Extract DID from decrypted identity
        const did = decryptedIdentity.id;
        if (!did) {
          return res.status(400).json({
            error: 'invalid_identity',
            error_description: 'Identity file missing DID'
          });
        }

        // Verify public key matches
        if (decryptedIdentity.publicKey && decryptedIdentity.publicKey !== public_key) {
          return res.status(400).json({
            error: 'invalid_identity',
            error_description: 'Public key mismatch'
          });
        }

        // Generate authorization code
        const scopes = scope ? scope.split(' ') : ['openid', 'profile'];
        const code = PNOAuthService.generateAuthorizationCode({
          clientId: client_id,
          redirectUri: redirect_uri,
          scope: scopes,
          state,
          nonce,
          did,
          pnName: pn_name // Store verified pN name
        });

        // Return authorization code
        res.json({
          code,
          state: state || undefined
        });
      } catch (error: any) {
        console.error('OAuth authentication error:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Authentication failed'
        });
      }
    });

    // POST /oauth/token - Token endpoint
    // Exchange authorization code for access token
    this.app.post('/oauth/token', (req, res) => {
      try {
        const { code, client_id, redirect_uri, grant_type } = req.body;

        if (!code || !client_id || !redirect_uri) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: code, client_id, redirect_uri'
          });
        }

        if (grant_type !== 'authorization_code') {
          return res.status(400).json({
            error: 'unsupported_grant_type',
            error_description: 'Only authorization_code grant type is supported'
          });
        }

        const tokenResponse = PNOAuthService.exchangeCodeForToken({
          code,
          clientId: client_id,
          redirectUri: redirect_uri
        });

        if (!tokenResponse) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired authorization code'
          });
        }

        res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token exchange error:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Token exchange failed'
        });
      }
    });

    // POST /oauth/refresh - Refresh token endpoint
    this.app.post('/oauth/refresh', (req, res) => {
      try {
        const { refresh_token, client_id } = req.body;

        if (!refresh_token || !client_id) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: refresh_token, client_id'
          });
        }

        const tokenResponse = PNOAuthService.refreshAccessToken(refresh_token, client_id);

        if (!tokenResponse) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token'
          });
        }

        res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token refresh error:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Token refresh failed'
        });
      }
    });

    // GET /oauth/userinfo - User info endpoint
    // Returns user information based on access token
    this.app.get('/oauth/userinfo', (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'Missing or invalid authorization header'
          });
        }

        const accessToken = authHeader.substring(7);
        const tokenPayload = PNOAuthService.validateAccessToken(accessToken);

        if (!tokenPayload) {
          return res.status(401).json({
            error: 'invalid_token',
            error_description: 'Invalid or expired access token'
          });
        }

        // Return user info based on token payload
        res.json({
          sub: tokenPayload.did,
          did: tokenPayload.did,
          pn_name: tokenPayload.pnName || undefined
        });
      } catch (error: any) {
        console.error('Userinfo error:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to retrieve user info'
        });
      }
    });

    // POST /oauth/revoke - Revoke token endpoint
    this.app.post('/oauth/revoke', (req, res) => {
      try {
        const { token, token_type_hint } = req.body;

        if (!token) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameter: token'
          });
        }

        // Try to revoke as access token first
        let revoked = PNOAuthService.revokeAccessToken(token);
        
        // If not found and hint suggests refresh token, try that
        if (!revoked && token_type_hint === 'refresh_token') {
          revoked = PNOAuthService.revokeRefreshToken(token);
        }

        // If still not found, try refresh token anyway
        if (!revoked) {
          revoked = PNOAuthService.revokeRefreshToken(token);
        }

        res.json({ revoked: true });
      } catch (error: any) {
        console.error('Token revocation error:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Token revocation failed'
        });
      }
    });
  }

  /**
   * Setup notification API endpoints
   */
  private setupNotificationEndpoints(): void {
    // GET /api/notifications - Get user's notifications
    this.app.get('/api/notifications', async (req, res) => {
      try {
        const userDid = req.headers['x-user-did'] as string || req.query.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type as string | undefined;

        const result = await NotificationService.getUserNotifications(userDid, {
          limit,
          offset,
          unreadOnly,
          type: type as any
        });

        res.json({
          notifications: result.notifications,
          total: result.total,
          limit,
          offset
        });
      } catch (error: any) {
        console.error('Failed to get notifications:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get notifications'
        });
      }
    });

    // GET /api/notifications/unread-count - Get unread count
    this.app.get('/api/notifications/unread-count', async (req, res) => {
      try {
        const userDid = req.headers['x-user-did'] as string || req.query.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const count = await NotificationService.getUnreadCount(userDid);

        res.json({ count });
      } catch (error: any) {
        console.error('Failed to get unread count:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get unread count'
        });
      }
    });

    // PUT /api/notifications/:notificationId/read - Mark notification as read
    this.app.put('/api/notifications/:notificationId/read', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userDid = req.headers['x-user-did'] as string || req.body.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const success = await NotificationService.markAsRead(notificationId, userDid);

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        res.json({ success: true });
      } catch (error: any) {
        console.error('Failed to mark notification as read:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to mark notification as read'
        });
      }
    });

    // PUT /api/notifications/read-all - Mark all notifications as read
    this.app.put('/api/notifications/read-all', async (req, res) => {
      try {
        const userDid = req.headers['x-user-did'] as string || req.body.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const count = await NotificationService.markAllAsRead(userDid);

        res.json({ success: true, markedRead: count });
      } catch (error: any) {
        console.error('Failed to mark all notifications as read:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to mark all notifications as read'
        });
      }
    });

    // DELETE /api/notifications/:notificationId - Delete notification
    this.app.delete('/api/notifications/:notificationId', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userDid = req.headers['x-user-did'] as string || req.query.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const success = await NotificationService.deleteNotification(notificationId, userDid);

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        res.json({ success: true });
      } catch (error: any) {
        console.error('Failed to delete notification:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to delete notification'
        });
      }
    });

    // GET /api/notifications/preferences - Get notification preferences
    this.app.get('/api/notifications/preferences', async (req, res) => {
      try {
        const userDid = req.headers['x-user-did'] as string || req.query.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const preferences = await NotificationService.getPreferences(userDid);

        res.json(preferences);
      } catch (error: any) {
        console.error('Failed to get notification preferences:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get notification preferences'
        });
      }
    });

    // PUT /api/notifications/preferences - Update notification preferences
    this.app.put('/api/notifications/preferences', async (req, res) => {
      try {
        const userDid = req.headers['x-user-did'] as string || req.body.userDid as string;
        
        if (!userDid) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User DID required'
          });
        }

        const { NotificationService } = require('./server/modules/notificationService');
        const preferences = await NotificationService.updatePreferences(userDid, req.body);

        res.json(preferences);
      } catch (error: any) {
        console.error('Failed to update notification preferences:', error);
        res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to update notification preferences'
        });
      }
    });
  }

  public async start(): Promise<void> {
    // Initialize database connection and schema
    try {
      const { initializeDatabase } = await import('./server/utils/database');
      await initializeDatabase();
    } catch (error) {
      console.error('⚠️ Failed to initialize database:', error);
      // Continue anyway - database might not be configured yet
      if (process.env.DATABASE_URL) {
        throw error; // If DATABASE_URL is set, database is required
      }
    }

    // Start Google Drive sync service (if configured)
    try {
      const { GoogleDriveSyncService } = await import('./server/modules/googleDriveSyncService');
      const syncService = GoogleDriveSyncService.getInstance();
      
      // Start periodic sync (every 10 minutes)
      // Only if service account is configured
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        syncService.startPeriodicSync(10);
      } else {
        console.log('ℹ️ Google Drive sync disabled - GOOGLE_SERVICE_ACCOUNT_KEY not set');
      }
    } catch (error) {
      console.warn('⚠️ Failed to start Google Drive sync service:', error);
      // Continue anyway - sync is optional
    }

    // Warm third-party catalog
    try {
      const { getThirdPartyIndexersService } = await import('./server/modules/thirdPartyIndexersService');
      const service = getThirdPartyIndexersService();
      await service.listIndexers();
    } catch (error) {
      console.warn('⚠️ Failed to load third-party indexers catalog during startup:', error);
    }

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
    // Stop Google Drive sync
    try {
      const { GoogleDriveSyncService } = await import('./server/modules/googleDriveSyncService');
      const syncService = GoogleDriveSyncService.getInstance();
      syncService.stopPeriodicSync();
    } catch (error) {
      console.warn('Failed to stop sync service:', error);
    }

    // Close database connections
    try {
      const { closeDatabasePool } = await import('./server/utils/database');
      await closeDatabasePool();
    } catch (error) {
      console.warn('Failed to close database pool:', error);
    }

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
