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
import crypto from 'crypto';
import { determineFileType, getFileTypeFromMime, determineContentClass } from './server/utils/fileTypeUtils';

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

// Rate limiting configuration - higher limit for authenticated requests
// SECURITY FIX: Rate limits now check for valid token format, not just presence
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // SECURITY FIX: Only grant higher limits if token format is valid
    // This prevents attackers from adding fake Authorization headers
    const authHeader = req.headers.authorization;
    const hasValidTokenFormat = authHeader && 
                                authHeader.startsWith('Bearer ') && 
                                authHeader.substring(7).trim().length > 0;
    
    if (hasValidTokenFormat) {
      return 500; // 500 requests per 15 minutes for authenticated users
    }
    return 100; // 100 requests per 15 minutes for unauthenticated requests
  },
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// More lenient rate limiter for aggregator endpoints (read-heavy, frequently accessed)
const aggregatorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // SECURITY FIX: Verify token format before granting higher limits
    const authHeader = req.headers.authorization;
    const hasValidTokenFormat = authHeader && 
                                authHeader.startsWith('Bearer ') && 
                                authHeader.substring(7).trim().length > 0;
    
    if (hasValidTokenFormat) {
      return 2000; // 2000 requests per 15 minutes for authenticated users
    }
    return 1000; // 1000 requests per 15 minutes for unauthenticated requests
  },
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Very lenient limiter for public discovery: GET metadata-index and nsfw-index.
// These are required before unlock; shared IPs (NAT, mobile) can exhaust aggregatorLimiter.
const metadataIndexReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    const authHeader = req.headers.authorization;
    const hasValidTokenFormat = authHeader &&
                                authHeader.startsWith('Bearer ') &&
                                authHeader.substring(7).trim().length > 0;
    if (hasValidTokenFormat) return 10000;
    return 5000; // 5000 per 15 min unauthenticated (discovery before unlock)
  },
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Lenient rate limiter for read-heavy endpoints (profile, feeds, engagement GET requests)
const readOnlyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // SECURITY FIX: Verify token format before granting higher limits
    const authHeader = req.headers.authorization;
    const hasValidTokenFormat = authHeader && 
                                authHeader.startsWith('Bearer ') && 
                                authHeader.substring(7).trim().length > 0;
    
    if (hasValidTokenFormat) {
      return 3000; // 3000 requests per 15 minutes for authenticated users
    }
    return 1500; // 1500 requests per 15 minutes for unauthenticated requests
  },
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiting (for login/auth endpoints)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased from 5 to 20 - OAuth token exchange can happen multiple times during setup
  message: 'Too many authentication attempts, please try again later.',
});

// OAuth token exchange rate limiting (more lenient - users may need multiple attempts during setup)
// Users may unlock multiple pN accounts, so we need a higher limit
const oauthTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Increased from 30 to 50 - users may unlock multiple pN accounts
  message: 'Too many OAuth token requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

class ProductionServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private _cleanupOrphanedTimer: ReturnType<typeof setTimeout> | null = null;
  private _cleanupOrphanedInterval: ReturnType<typeof setInterval> | null = null;

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
    this.setupWebSockets();
  }

  /**
   * Extract account ID from Google Drive account object
   * Checks all possible property names in order of precedence
   */
  private extractAccountId(account: any): string | undefined {
    return (account as any)?.backendId || 
           (account as any)?.keyPrefix || 
           (account as any)?.accountId || 
           (account as any)?.id || 
           undefined;
  }

  /**
   * Helper function to get or create metadata folder for a user
   * Creates pN folder if needed, then creates _metadata folder inside it
   * Follows standard pattern: accepts accessToken as parameter
   */
  private async getOrCreateMetadataFolder(
    accessToken: string,
    pnIdentifier: string
  ): Promise<string> {
    // Normalize pn identifier
    const normalizedPn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    
    // Find or create pN folder
    const pnFolderName = `par Noir - ${normalizedPn}`;
    const pnFolderQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const pnFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderQuery)}&fields=files(id)&pageSize=1`;
    const pnFolderResponse = await fetch(pnFolderUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    let pnFolderId: string | null = null;
    if (pnFolderResponse.ok) {
      const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
      if (pnFolderData.files && pnFolderData.files.length > 0) {
        pnFolderId = pnFolderData.files[0].id;
      }
    }

    // Create pN folder if it doesn't exist
    if (!pnFolderId) {
      console.log('[getOrCreateMetadataFolder] Creating pN folder:', pnFolderName);
      const createPnFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: pnFolderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      console.log('[getOrCreateMetadataFolder] Create pN folder response status:', createPnFolderResponse.status);

      if (!createPnFolderResponse.ok) {
        const errorText = await createPnFolderResponse.text().catch(() => 'Unknown error');
        let errorJson = null;
        try {
          errorJson = JSON.parse(errorText);
        } catch (e) {
          // Not JSON, use as text
        }
        console.error(`[getOrCreateMetadataFolder] Failed to create pN folder: ${createPnFolderResponse.status} ${createPnFolderResponse.statusText}`);
        console.error(`[getOrCreateMetadataFolder] Full error response text:`, errorText);
        console.error(`[getOrCreateMetadataFolder] Parsed error JSON:`, errorJson);
        console.error(`[getOrCreateMetadataFolder] Token used (first 50 chars):`, accessToken.substring(0, 50));
        throw new Error(`Failed to create pN folder: ${createPnFolderResponse.status} ${createPnFolderResponse.statusText} - ${errorText.substring(0, 500)}`);
      }

      const createdPnFolder = await createPnFolderResponse.json() as { id: string };
      pnFolderId = createdPnFolder.id;
    }

    // Now search for _metadata folder inside pN folder
    const metadataFolderQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const metadataFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataFolderQuery)}&fields=files(id)&pageSize=1`;
    const metadataFolderResponse = await fetch(metadataFolderUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (metadataFolderResponse.ok) {
      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
      if (metadataFolderData.files && metadataFolderData.files.length > 0) {
        return metadataFolderData.files[0].id;
      }
    }

    // Create _metadata folder inside pN folder
    const createMetadataResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: '_metadata',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [pnFolderId]
      })
    });

    if (!createMetadataResponse.ok) {
      const errorText = await createMetadataResponse.text().catch(() => 'Unknown error');
      console.error(`Failed to create _metadata folder: ${createMetadataResponse.status} ${createMetadataResponse.statusText}`, errorText);
      throw new Error(`Failed to create _metadata folder: ${createMetadataResponse.status} ${createMetadataResponse.statusText} - ${errorText.substring(0, 200)}`);
    }

    const createdMetadata = await createMetadataResponse.json() as { id: string };
    return createdMetadata.id;
  }

  /**
   * Lookup-only: find pN folder and _metadata folder. Returns { metadataFolderId, pnFolderId } if both exist, else null.
   * Do not create anything. Use in usage paths; if null, return 409 DRIVE_NOT_INITIALIZED.
   */
  private async getMetadataFolder(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ): Promise<{ metadataFolderId: string; pnFolderId: string } | null> {
    const { GoogleOAuth2Helper } = await import('./server/modules/googleOAuth2Helper');
    const { google } = await import('googleapis');
    
    const auth = GoogleOAuth2Helper.createClient(token, pnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    
    const normalizedPn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const pnFolderName = `par Noir - ${normalizedPn}`;
    const pnFolderQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
    try {
      // Google client library will automatically refresh token on 401
      const pnFolderResponse = await drive.files.list({
        q: pnFolderQuery,
        fields: 'files(id)',
        pageSize: 1
      });
      
      if (!pnFolderResponse.data.files || pnFolderResponse.data.files.length === 0) {
        // Folders not found - return null (this is the only case where null is appropriate)
        return null;
      }
      const pnFolderId = pnFolderResponse.data.files[0].id!;

      const metadataFolderQuery = `name='_metadata' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      
      // Google client library will automatically refresh token on 401
      const metadataFolderResponse = await drive.files.list({
        q: metadataFolderQuery,
        fields: 'files(id)',
        pageSize: 1
      });
      
      if (!metadataFolderResponse.data.files || metadataFolderResponse.data.files.length === 0) {
        // _metadata folder not found - return null
        return null;
      }
      return { metadataFolderId: metadataFolderResponse.data.files[0].id!, pnFolderId };
    } catch (error: any) {
      // Handle authentication errors
      if (error?.response?.status === 401 || error?.response?.status === 403 || error?.code === 401 || error?.code === 403) {
        throw new Error(`Google Drive authentication failed: ${error?.message || 'Invalid credentials'}`);
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Helper for 409 DRIVE_NOT_INITIALIZED. Use when getMetadataFolder returns null or content folder not found.
   */
  private driveNotInitialized(res: express.Response): express.Response {
    return res.status(409).json({
      error: 'Google Drive storage not initialized',
      code: 'DRIVE_NOT_INITIALIZED',
      message: 'Please connect and initialize Google Drive in your dashboard first.'
    });
  }

  /**
   * Initialize all content class folders (media, thoughts, collections)
   * This ensures the folder structure exists before any files are uploaded
   */
  private async initializeContentClassFolders(
    accessToken: string,
    metadataFolderId: string
  ): Promise<void> {
    const contentClassFolders = ['media', 'thoughts', 'collections'];
    
    for (const folderName of contentClassFolders) {
      try {
        // Check if folder already exists
        const folderQuery = `name='${folderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
        const searchResponse = await fetch(searchUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        let folderId: string | null = null;
        if (searchResponse.ok) {
          const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
          if (searchData.files && searchData.files.length > 0) {
            folderId = searchData.files[0].id;
            console.log(`[initializeContentClassFolders] Folder '${folderName}' already exists`);
            // Still initialize index files even if folder exists (they might not exist yet)
            await this.initializeContentClassIndexFiles(accessToken, folderId, folderName);
            continue;
          }
        }

        // Create folder if it doesn't exist
        const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [metadataFolderId]
          })
        });

        if (createResponse.ok) {
          const folderData = await createResponse.json() as { id: string };
          folderId = folderData.id;
          console.log(`[initializeContentClassFolders] Created folder '${folderName}' (ID: ${folderId})`);
          
          // Create content class-specific index files in this folder
          await this.initializeContentClassIndexFiles(accessToken, folderId, folderName);
        } else {
          const errorText = await createResponse.text();
          console.warn(`[initializeContentClassFolders] Failed to create folder '${folderName}': ${createResponse.status} ${errorText}`);
        }
      } catch (error: any) {
        console.error(`[initializeContentClassFolders] Error creating folder '${folderName}':`, error);
        // Don't throw - continue with other folders
      }
    }
  }

  /**
   * Initialize content class-specific index Sheets (public-file-index.xlsx, owner-file-index.xlsx) in a content class folder.
   * Get-only; on not-found create via createIndexSheet (sheets are created at connection only).
   */
  private async initializeContentClassIndexFiles(
    accessToken: string,
    folderId: string,
    folderName: string
  ): Promise<void> {
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
    const cc = folderName as 'media' | 'thoughts' | 'collections';
    try {
      try {
        await IndexSheetsService.getIndexSheet(accessToken, folderId, 'owner', cc);
      } catch (getError: any) {
        if (getError?.message?.includes('not found')) {
          await IndexSheetsService.createIndexSheet(accessToken, folderId, 'owner', cc);
        } else {
          throw getError;
        }
      }
      console.log(`[initializeContentClassIndexFiles] Initialized owner-file-index.xlsx in '${folderName}'`);
    } catch (e: any) {
      console.warn(`[initializeContentClassIndexFiles] Failed to init owner index in '${folderName}':`, e?.message || e);
    }
    try {
      let publicSheetId: string;
      try {
        publicSheetId = await IndexSheetsService.getIndexSheet(accessToken, folderId, 'public', cc);
      } catch (getError: any) {
        if (getError?.message?.includes('not found')) {
          publicSheetId = await IndexSheetsService.createIndexSheet(accessToken, folderId, 'public', cc);
        } else {
          throw getError;
        }
      }
      await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
      console.log(`[initializeContentClassIndexFiles] Initialized public-file-index.xlsx in '${folderName}'`);
    } catch (e: any) {
      console.warn(`[initializeContentClassIndexFiles] Failed to init public index in '${folderName}':`, e?.message || e);
    }
  }

  /**
   * Initialize root index files (public-file-index.xlsx and owner-file-index.xlsx).
   * Get-only; on not-found create via createIndexSheet (sheets are created at connection only).
   */
  private async initializeIndexFiles(
    accessToken: string,
    metadataFolderId: string,
    _pnIdentifier: string
  ): Promise<void> {
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');

    try {
      let publicSheetId: string;
      try {
        publicSheetId = await IndexSheetsService.getIndexSheet(accessToken, metadataFolderId, 'public');
      } catch (getError: any) {
        if (getError?.message?.includes('not found')) {
          publicSheetId = await IndexSheetsService.createIndexSheet(accessToken, metadataFolderId, 'public');
        } else {
          throw getError;
        }
      }
      try {
        const { google } = await import('googleapis');
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: 'v3', auth });
        await drive.permissions.create({
          fileId: publicSheetId,
          requestBody: { role: 'reader', type: 'anyone' }
        });
        console.log(`[initializeIndexFiles] Set public permissions on public-file-index.xlsx`);
      } catch (permError: any) {
        console.warn(`[initializeIndexFiles] Failed to set public permissions on public-file-index.xlsx:`, permError);
      }
      console.log(`[initializeIndexFiles] Initialized public-file-index.xlsx`);
    } catch (error: any) {
      console.error(`[initializeIndexFiles] Error creating public-file-index.xlsx:`, error);
    }

    try {
      try {
        await IndexSheetsService.getIndexSheet(accessToken, metadataFolderId, 'owner');
      } catch (getError: any) {
        if (getError?.message?.includes('not found')) {
          await IndexSheetsService.createIndexSheet(accessToken, metadataFolderId, 'owner');
        } else {
          throw getError;
        }
      }
      console.log(`[initializeIndexFiles] Initialized owner-file-index.xlsx`);
    } catch (error: any) {
      console.error(`[initializeIndexFiles] Error creating owner-file-index.xlsx:`, error);
    }
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // SECURITY FIX: Remove 'unsafe-inline' - use nonces or hashes for inline styles
          // Note: This may break some inline styles. If needed, use style-src 'self' 'nonce-{random}'
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration with security improvements
    // SECURITY FIX: Restrict no-origin requests to prevent CSRF attacks
    const publicNoOriginPaths = [
      '/health', 
      '/api/aggregator/metadata-index', 
      '/api/aggregator/nsfw-index',
      '/api/aggregator/fix-feeds',
      '/api/aggregator/metadata-index/debug'
    ];
    
    // Custom CORS middleware that checks path before allowing no-origin requests
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      const path = req.path || req.url?.split('?')[0] || '';
      const isPublicPath = publicNoOriginPaths.some(p => path === p || path.startsWith(p));
      
      // SECURITY FIX: In production, block no-origin requests except for public endpoints
      if (!origin && NODE_ENV === 'production' && !isPublicPath) {
        console.error(`[CORS] Blocked no-origin request to ${path} in production`);
        res.status(403).json({ error: 'Origin header required in production' });
        return;
      }
      
      // Continue to standard CORS middleware
      next();
    });
    
    this.app.use(cors({
      origin: (origin, callback) => {
        // SECURITY FIX: Only allow no-origin requests for specific public endpoints
        // This prevents CSRF-like attacks from tools that omit Origin header
        if (!origin) {
          // In development, allow no-origin but log it
          if (NODE_ENV === 'development') {
            console.warn(`[CORS] Allowing no-origin request (development mode)`);
          return callback(null, true);
        }
          
          // In production, this should have been handled by the middleware above
          // But as a fallback, block it here too
          return callback(new Error('Origin header required'));
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

    // Rate limiting - apply general limiter to most routes
    // Aggregator endpoints get a more lenient limiter (applied specifically)
    // Read-only endpoints (profile, feeds, engagement GET) get an even more lenient limiter
    // OAuth authentication endpoints are exempt (proof-of-work based, not server-intensive)
    this.app.use((req, res, next) => {
      // Skip rate limiting for aggregator endpoints (they get their own limiter)
      if (req.path.startsWith('/api/aggregator/')) {
        return next();
      }
      // Skip rate limiting for OAuth authentication endpoints (proof-of-work based)
      if (req.path === '/oauth/authorize/authenticate' && req.method === 'POST') {
        return next();
      }
      // Apply lenient limiter for read-only endpoints and bulk operations
      if (
        (req.method === 'GET' && (
          req.path.startsWith('/api/profile/') ||
          req.path.startsWith('/api/feeds') ||
          req.path.startsWith('/api/engagement/') ||
          req.path.startsWith('/api/notifications') ||
          req.path.startsWith('/api/activity-ledger') ||
          req.path.startsWith('/api/connections') ||
          req.path.startsWith('/api/messages')
        )) ||
        (req.method === 'POST' && (
          req.path === '/api/engagement/bulk-stats'
        ))
      ) {
        return readOnlyLimiter(req, res, next);
      }
      limiter(req, res, next);
    });

    // Body parsing - SECURITY FIX: Reduced limit to prevent DoS attacks
    // Large files should be uploaded via multipart/form-data with separate validation
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
   * Get owner file index (contains all files owned by the user)
   * Now uses Sheets instead of JSON
   */
  private async getOwnerFileIndex(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier: string
  ): Promise<any | null> {
    try {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      
      // Get or create owner index sheet
      const spreadsheetId = await IndexSheetsService.getIndexSheet(
        accessToken,
        metadataFolderId,
        'owner'
      );

      // Get all files from sheet
      const { files } = await IndexSheetsService.getFiles(accessToken, spreadsheetId);

      return {
        identifier: pnIdentifier,
        files,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[getOwnerFileIndex] Error getting owner index:', error);
      return {
        identifier: pnIdentifier,
        files: [],
        updatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Update owner file index (includes ALL files, regardless of visibility)
   * Now uses Sheets instead of JSON
   */
  private async updateOwnerFileIndex(
    accessToken: string,
    pnIdentifier: string,
    metadataFolderId: string,
    fileMetadata: any
  ): Promise<void> {
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
    
    // Get or create owner index sheet
    const spreadsheetId = await IndexSheetsService.getIndexSheet(
      accessToken,
      metadataFolderId,
      'owner'
    );

    // Determine contentClass from fileMetadata before creating index entry
    const { determineContentClass } = await import('./server/utils/fileTypeUtils');
    const metadataAny = fileMetadata as any;
    const contentClass = determineContentClass({
      fileType: metadataAny.fileType,
      collection: metadataAny.collection,
      textPost: metadataAny.textPost,
      thought: metadataAny.thought,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      isPartOfCollection: metadataAny.isPartOfCollection
    });

    // Convert companion metadata to index entry format
    const indexEntry: any = {
      fileId: fileMetadata.fileId,
      googleDriveFileId: fileMetadata.googleDriveFileId,
      fileName: fileMetadata.fileName,
      originalName: fileMetadata.originalName,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size,
      visibility: fileMetadata.visibility,
      uploadedAt: fileMetadata.uploadedAt,
      owner: fileMetadata.owner,
      tags: fileMetadata.tags || [],
      description: fileMetadata.description,
      thumbnail: fileMetadata.thumbnail,
      publicToken: fileMetadata.publicToken,
      engagement: fileMetadata.engagement,
      inReplyTo: fileMetadata.inReplyTo,
      repostOf: fileMetadata.repostOf,
      isPartOf: fileMetadata.isPartOf,
      indexingPermissions: fileMetadata.indexingPermissions,
      contentClass: contentClass,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      thought: metadataAny.thought,
      textPost: metadataAny.textPost,
      collection: metadataAny.collection
    };

    // Check if file already exists in index
    const existingEntry = await IndexSheetsService.getFileById(
      accessToken,
      spreadsheetId,
      fileMetadata.fileId
    );

    if (existingEntry) {
      // Merge with existing entry
      if (!indexEntry.publicToken && existingEntry.publicToken) {
        indexEntry.publicToken = existingEntry.publicToken;
      }
      
      if (existingEntry.engagement) {
        indexEntry.engagement = {
          views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
          likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
          comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
          shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
          lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt,
          engagementHistory: [
            ...(existingEntry.engagement.engagementHistory || []),
            ...(indexEntry.engagement?.engagementHistory || [])
          ]
        };
      }
      
      // Update existing entry
      await IndexSheetsService.updateFile(accessToken, spreadsheetId, fileMetadata.fileId, indexEntry);
    } else {
      // Add new entry
      await IndexSheetsService.addFile(accessToken, spreadsheetId, indexEntry);
    }

    // Also update content class-specific owner index (map thought→thoughts, collection→collections)
    const contentTypeFolderName = indexEntry.contentClass === 'thought' ? 'thoughts' : indexEntry.contentClass === 'collection' ? 'collections' : indexEntry.contentClass;
    let contentTypeFolderId: string | null = null;
    const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const contentTypeFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (contentTypeFolderResponse.ok) {
      const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
      if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
        contentTypeFolderId = contentTypeFolderData.files[0].id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: contentTypeFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [metadataFolderId] })
        });
        if (createRes.ok) {
          const createData = await createRes.json() as { id: string };
          contentTypeFolderId = createData.id;
          console.log(`[updateOwnerFileIndex] Created content-class folder '${contentTypeFolderName}'`);
        }
      }
    }

    if (contentTypeFolderId) {
        // Get or create content class-specific owner index
        const contentClassOwnerIndex = await this.getContentClassOwnerIndex(accessToken, contentTypeFolderId, pnIdentifier, contentTypeFolderName as 'media' | 'thoughts' | 'collections');
        const contentClassIndex = contentClassOwnerIndex || {
          identifier: pnIdentifier,
          files: [],
          updatedAt: new Date().toISOString()
        };

        // Update content class-specific index with same logic
        const contentClassFileIndex = contentClassIndex.files.findIndex(
          (f: any) => f.googleDriveFileId === fileMetadata.googleDriveFileId
        );

        if (contentClassFileIndex >= 0) {
          contentClassIndex.files[contentClassFileIndex] = indexEntry;
        } else {
          contentClassIndex.files.push(indexEntry);
        }

        contentClassIndex.updatedAt = new Date().toISOString();
        const ownerSheetId = await IndexSheetsService.getIndexSheet(accessToken, contentTypeFolderId, 'owner', contentTypeFolderName as 'media' | 'thoughts' | 'collections');
        await IndexSheetsService.setAllFiles(accessToken, ownerSheetId, contentClassIndex.files, contentClassIndex.updatedAt);
    }
  }

  /**
   * Get public file index
   * Now uses Sheets instead of JSON
   */
  private async getPublicFileIndex(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier: string
  ): Promise<any | null> {
    try {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      
      // Get or create public index sheet
      const spreadsheetId = await IndexSheetsService.getIndexSheet(
        accessToken,
        metadataFolderId,
        'public'
      );

      // Get only public files
      const { files } = await IndexSheetsService.getFiles(accessToken, spreadsheetId, {
        visibility: 'public'
      });

      return {
        identifier: pnIdentifier,
        files,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('[getPublicFileIndex] Error getting public index:', error);
      return {
        identifier: pnIdentifier,
        files: [],
        updatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Convert companion metadata to public metadata (simplified semantic web format)
   */
  private companionToPublicMetadata(companion: any, creatorDid?: string): any {
    const fileType = getFileTypeFromMime(companion.mimeType);
    const schemaType = 
      fileType === 'image' ? 'ImageObject' :
      fileType === 'video' ? 'VideoObject' :
      fileType === 'audio' ? 'AudioObject' :
      'CreativeWork';
    
    const resourceUri = `https://parnoir.com/resource/${companion.fileId}`;
    const didUri = creatorDid || companion.owner.did || `did:key:${companion.owner.identifier}`;
    
    const SEMANTIC_CONTEXTS = [
      'https://schema.org/',
      'http://purl.org/dc/terms/',
      'http://www.w3.org/ns/prov#',
      'http://xmlns.com/foaf/0.1/',
      'https://www.w3.org/ns/activitystreams#',
      'https://parnoir.com/ns/v1#'
    ];
    
    return {
      '@context': SEMANTIC_CONTEXTS,
      '@type': schemaType,
      '@id': resourceUri,
      fileId: companion.fileId,
      backend: 'google_drive',
      backendFileId: companion.googleDriveFileId,
      name: companion.originalName || companion.fileName,
      description: companion.description || '',
      keywords: companion.tags || [],
      uploadDate: companion.uploadedAt,
      datePublished: companion.uploadedAt,
      fileType: fileType,
      creator: {
        '@type': 'Person',
        '@id': didUri,
        identifier: {
          '@type': 'PropertyValue',
          name: 'DID',
          value: didUri
        }
      },
      author: {
        did: didUri
      },
      engagement: {
        views: companion.engagement?.views || 0,
        likes: companion.engagement?.likes || 0,
        comments: companion.engagement?.comments || 0,
        shares: companion.engagement?.shares || 0,
        lastUpdated: companion.engagement?.lastUpdated || companion.uploadedAt,
        engagementHistory: companion.engagement?.engagementHistory || []
      },
      publicToken: companion.publicToken,
      isPublic: companion.visibility === 'public',
      indexingPermissions: companion.indexingPermissions
    };
  }

  /**
   * Remove file from owner index
   */
  private async removeFromOwnerIndex(
    accessToken: string,
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string
  ): Promise<void> {
    // Get existing owner index
    const index = await this.getOwnerFileIndex(accessToken, metadataFolderId, pnIdentifier);
    
    if (!index || !index.files) {
      // No index or no files, nothing to remove
      return;
    }
    
    // Find the file to determine its contentClass
    const fileEntry = index.files.find((f: any) => f.googleDriveFileId === fileId || f.fileId === fileId);
    let contentClass: string | null = null;
    if (fileEntry) {
      // Try to determine contentClass from file entry
      const metadataAny = fileEntry as any;
      if (metadataAny.collection?.collectionFileIds?.length) {
        contentClass = 'collection';
      } else if (metadataAny.isThoughtThumbnail || metadataAny.thought || metadataAny.textPost) {
        contentClass = 'thought';
      } else {
        contentClass = 'media';
      }
    }
    
    // Remove file from root index
    const initialLength = index.files.length;
    index.files = index.files.filter((f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId);
    
    if (index.files.length === initialLength) {
      // File wasn't in the index, nothing to do
      return;
    }
    
    index.updatedAt = new Date().toISOString();
    
    // Save updated root index (Sheets)
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
    const ownerSheetId = await IndexSheetsService.getIndexSheet(accessToken, metadataFolderId, 'owner');
    await IndexSheetsService.setAllFiles(accessToken, ownerSheetId, index.files, index.updatedAt);
    
    // Also remove from content class-specific index if we know the contentClass (thought→thoughts, collection→collections)
    if (contentClass) {
      const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
      const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const contentTypeFolderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (contentTypeFolderResponse.ok) {
        const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
        if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
          const contentTypeFolderId = contentTypeFolderData.files[0].id;
          
          // Get content class-specific owner index
          const contentClassIndex = await this.getContentClassOwnerIndex(accessToken, contentTypeFolderId, pnIdentifier, contentTypeFolderName as 'media' | 'thoughts' | 'collections');
          if (contentClassIndex && contentClassIndex.files) {
            const contentClassInitialLength = contentClassIndex.files.length;
            contentClassIndex.files = contentClassIndex.files.filter(
              (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
            );
            
            if (contentClassIndex.files.length !== contentClassInitialLength) {
              contentClassIndex.updatedAt = new Date().toISOString();
              const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
              const ownerSheetId = await IndexSheetsService.getIndexSheet(accessToken, contentTypeFolderId, 'owner', contentTypeFolderName as 'media' | 'thoughts' | 'collections');
              await IndexSheetsService.setAllFiles(accessToken, ownerSheetId, contentClassIndex.files, contentClassIndex.updatedAt);
            }
          }
        }
      }
    }
  }

  /**
   * Remove file from public index
   */
  private async removeFromPublicIndex(
    accessToken: string,
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string
  ): Promise<void> {
    // Get existing public index to find the file and determine contentClass
    const index = await this.getPublicFileIndex(accessToken, metadataFolderId, pnIdentifier);
    
    if (!index || !index.files) {
      // No index or no files, nothing to remove
      return;
    }
    
    // Find the file to determine its contentClass
    const fileEntry = index.files.find((f: any) => f.googleDriveFileId === fileId || f.fileId === fileId);
    let contentClass: string | null = null;
    if (fileEntry) {
      // Try to determine contentClass from file entry
      const metadataAny = fileEntry as any;
      if (metadataAny.collection?.collectionFileIds?.length) {
        contentClass = 'collection';
      } else if (metadataAny.isThoughtThumbnail || metadataAny.thought || metadataAny.textPost) {
        contentClass = 'thought';
      } else {
        contentClass = 'media';
      }
    }
    
    // Remove file from root index
    const initialLength = index.files.length;
    index.files = index.files.filter((f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId);
    
    if (index.files.length === initialLength) {
      // File wasn't in the index, nothing to do
      return;
    }
    
    index.updatedAt = new Date().toISOString();
    
    // Save updated root index (Sheets) and ensure public permission
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
    const publicSheetId = await IndexSheetsService.getIndexSheet(accessToken, metadataFolderId, 'public');
    await IndexSheetsService.setAllFiles(accessToken, publicSheetId, index.files, index.updatedAt);
    await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
    
    // Also remove from content class-specific index if we know the contentClass (thought→thoughts, collection→collections)
    if (contentClass) {
      const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
      const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const contentTypeFolderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (contentTypeFolderResponse.ok) {
        const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
        if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
          const contentTypeFolderId = contentTypeFolderData.files[0].id;
          
          // Get content class-specific public index
          const contentClassIndex = await this.getContentClassPublicIndex(accessToken, contentTypeFolderId, pnIdentifier, contentTypeFolderName as 'media' | 'thoughts' | 'collections');
          if (contentClassIndex && contentClassIndex.files) {
            const contentClassInitialLength = contentClassIndex.files.length;
            contentClassIndex.files = contentClassIndex.files.filter(
              (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
            );
            
            if (contentClassIndex.files.length !== contentClassInitialLength) {
              contentClassIndex.updatedAt = new Date().toISOString();
              const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
              const publicSheetId = await IndexSheetsService.getIndexSheet(accessToken, contentTypeFolderId, 'public', contentTypeFolderName as 'media' | 'thoughts' | 'collections');
              await IndexSheetsService.setAllFiles(accessToken, publicSheetId, contentClassIndex.files, contentClassIndex.updatedAt);
              await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
            }
          }
        }
      }
    }
  }

  /**
   * Update public file index
   */
  private async updatePublicFileIndex(
    accessToken: string,
    pnIdentifier: string,
    metadataFolderId: string,
    pnFolderId: string,
    fileMetadata: any
  ): Promise<void> {
    let index = await this.getPublicFileIndex(accessToken, metadataFolderId, pnIdentifier);
    
    if (!index) {
      index = {
        identifier: pnIdentifier,
        files: [],
        updatedAt: new Date().toISOString()
      };
    }

    // Update or add file entry
    const fileIndex = index.files.findIndex(
      (f: any) => f.googleDriveFileId === fileMetadata.googleDriveFileId
    );

    if (fileMetadata.visibility === 'public') {
      // Convert companion metadata to public metadata (semantic web format)
      const publicMetadata = this.companionToPublicMetadata(fileMetadata, fileMetadata.owner.did);
      
      // Create index entry with full semantic metadata
      const indexEntry: any = {
        ...publicMetadata,
        // Keep legacy fields for compatibility
        fileId: fileMetadata.fileId,
        googleDriveFileId: fileMetadata.googleDriveFileId,
        fileName: fileMetadata.fileName,
        originalName: fileMetadata.originalName,
        mimeType: fileMetadata.mimeType,
        size: fileMetadata.size,
        visibility: fileMetadata.visibility,
        uploadedAt: fileMetadata.uploadedAt,
        owner: fileMetadata.owner,
        tags: fileMetadata.tags || [],
        description: fileMetadata.description,
        thumbnail: fileMetadata.thumbnail,
        publicToken: fileMetadata.publicToken,
        indexingPermissions: fileMetadata.indexingPermissions
      };

      const isNewPublicFile = fileIndex < 0;
      
      if (fileIndex >= 0) {
        // Update existing entry, preserve fields if new ones not provided
        const existingEntry = index.files[fileIndex] as any;
        
        // Preserve publicToken if new one not provided
        if (!indexEntry.publicToken && existingEntry.publicToken) {
          indexEntry.publicToken = existingEntry.publicToken;
        }
        
        // Merge engagement metrics
        if (existingEntry.engagement) {
          indexEntry.engagement = {
            views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
            likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
            comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
            shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
            lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt,
            engagementHistory: [
              ...(existingEntry.engagement.engagementHistory || []),
              ...(indexEntry.engagement?.engagementHistory || [])
            ]
          };
        }
        
        index.files[fileIndex] = indexEntry;
      } else {
        // Only add to index if public
        index.files.push(indexEntry);
      }

      // Share folder with service account when file becomes public (first time only)
      if (isNewPublicFile) {
        try {
          const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
          if (serviceAccountEmail) {
            // Check if permission already exists
            const permissionsResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions?fields=permissions(emailAddress)`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );

            let hasPermission = false;
            if (permissionsResponse.ok) {
              const permissionsData = await permissionsResponse.json() as { permissions?: Array<{ emailAddress?: string }> };
              hasPermission = permissionsData.permissions?.some(
                (p: any) => p.emailAddress === serviceAccountEmail
              ) ?? false;
            }

            if (!hasPermission) {
              // Share folder with service account
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    role: 'reader',
                    type: 'user',
                    emailAddress: serviceAccountEmail
                  })
                }
              );
            }
          }
        } catch (shareError: any) {
          // Not critical, just log
          console.warn(`[Upload] Failed to share folder with service account:`, shareError?.message || shareError);
        }
      }
    } else {
      // Remove from index if not public (cleanup)
      if (fileIndex >= 0) {
        index.files.splice(fileIndex, 1);
      }
    }

    index.updatedAt = new Date().toISOString();

    // Save root public index (Sheets) and ensure public permission
    const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
    const publicSheetId = await IndexSheetsService.getIndexSheet(accessToken, metadataFolderId, 'public');
    await IndexSheetsService.setAllFiles(accessToken, publicSheetId, index.files, index.updatedAt);
    await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
    
    // Also update content class-specific public index
    // Determine contentClass from fileMetadata
    const { determineContentClass } = await import('./server/utils/fileTypeUtils');
    const metadataAny = fileMetadata as any;
    const contentClass = determineContentClass({
      fileType: metadataAny.fileType,
      collection: metadataAny.collection,
      textPost: metadataAny.textPost,
      thought: metadataAny.thought,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      isPartOfCollection: metadataAny.isPartOfCollection
    });
    const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
    console.log(`[updatePublicFileIndex] determineContentClass: contentClass=${contentClass} folder=${contentTypeFolderName} isThoughtThumbnail=${!!metadataAny.isThoughtThumbnail} thought=${!!metadataAny.thought} textPost=${!!metadataAny.textPost}`);

    // Get or create content class folder (map contentClass to folder name: thought→thoughts, collection→collections)
    let contentTypeFolderId: string | null = null;

    const contentTypeFolderQuery = `name='${contentTypeFolderName}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const contentTypeFolderResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(contentTypeFolderQuery)}&fields=files(id)&pageSize=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (contentTypeFolderResponse.ok) {
      const contentTypeFolderData = await contentTypeFolderResponse.json() as { files?: Array<{ id: string }> };
      if (contentTypeFolderData.files && contentTypeFolderData.files.length > 0) {
        contentTypeFolderId = contentTypeFolderData.files[0].id;
      } else {
        // Folder missing (e.g. connected before content-class folders existed): create it
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: contentTypeFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [metadataFolderId]
          })
        });
        if (createRes.ok) {
          const createData = await createRes.json() as { id: string };
          contentTypeFolderId = createData.id;
          console.log(`[updatePublicFileIndex] Created content-class folder '${contentTypeFolderName}'`);
        }
      }
    }
    console.log(`[updatePublicFileIndex] Content-class folder: ${contentTypeFolderId ?? 'content-class folder missing'}`);

    if (contentTypeFolderId) {
        const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
        const contentClassPublicSheetId = await IndexSheetsService.getIndexSheet(accessToken, contentTypeFolderId, 'public', contentTypeFolderName as 'media' | 'thoughts' | 'collections');
        const { files } = await IndexSheetsService.getFiles(accessToken, contentClassPublicSheetId);
        const contentClassIndex = {
          identifier: pnIdentifier,
          files: Array.isArray(files) ? [...files] : [],
          updatedAt: new Date().toISOString()
        };
        if (!Array.isArray(contentClassIndex.files)) contentClassIndex.files = [];

        const contentClassFileIndex = contentClassIndex.files.findIndex(
          (f: any) => f && (f.googleDriveFileId === fileMetadata.googleDriveFileId)
        );

        if (fileMetadata.visibility === 'public') {
          const publicMetadata = this.companionToPublicMetadata(fileMetadata, fileMetadata.owner.did);
          const contentClassIndexEntry: any = {
            ...publicMetadata,
            fileId: fileMetadata.fileId,
            googleDriveFileId: fileMetadata.googleDriveFileId,
            fileName: fileMetadata.fileName,
            originalName: fileMetadata.originalName,
            mimeType: fileMetadata.mimeType,
            size: fileMetadata.size,
            visibility: fileMetadata.visibility,
            uploadedAt: fileMetadata.uploadedAt,
            owner: fileMetadata.owner,
            tags: fileMetadata.tags || [],
            description: fileMetadata.description,
            thumbnail: fileMetadata.thumbnail,
            publicToken: fileMetadata.publicToken,
            indexingPermissions: fileMetadata.indexingPermissions
          };

          if (contentClassFileIndex >= 0) {
            const existingEntry = contentClassIndex.files[contentClassFileIndex] as any;
            if (!contentClassIndexEntry.publicToken && existingEntry.publicToken) {
              contentClassIndexEntry.publicToken = existingEntry.publicToken;
            }
            if (existingEntry.engagement) {
              contentClassIndexEntry.engagement = {
                views: contentClassIndexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
                likes: contentClassIndexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
                comments: contentClassIndexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
                shares: contentClassIndexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
                lastUpdated: contentClassIndexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt,
                engagementHistory: [
                  ...(existingEntry.engagement.engagementHistory || []),
                  ...(contentClassIndexEntry.engagement?.engagementHistory || [])
                ]
              };
            }
            contentClassIndex.files[contentClassFileIndex] = contentClassIndexEntry;
          } else {
            contentClassIndex.files.push(contentClassIndexEntry);
          }
        } else {
          if (contentClassFileIndex >= 0) {
            contentClassIndex.files.splice(contentClassFileIndex, 1);
          }
        }

        contentClassIndex.updatedAt = new Date().toISOString();
        try {
          console.log(`[updatePublicFileIndex] Content-class before setAllFiles: ${contentTypeFolderName} sheetId=${contentClassPublicSheetId} files.length=${contentClassIndex.files.length}`);
          await IndexSheetsService.setAllFiles(accessToken, contentClassPublicSheetId, contentClassIndex.files, contentClassIndex.updatedAt);
          await this.setPublicPermissionOnDriveFile(accessToken, contentClassPublicSheetId);
        } catch (contentClassErr: any) {
          console.error(`[updatePublicFileIndex] Content-class public index (${contentTypeFolderName}) failed sheetId=${contentClassPublicSheetId}:`, contentClassErr?.message || contentClassErr, contentClassErr?.stack);
          throw contentClassErr;
        }
    }
  }

  /**
   * Set public (anyone reader) permission on a Drive file (e.g. public index Sheet).
   */
  private async setPublicPermissionOnDriveFile(accessToken: string, fileId: string): Promise<void> {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });
    } catch (e: any) {
      console.warn('[setPublicPermissionOnDriveFile]', e?.message || e);
    }
  }

  /**
   * Save index file to a specific folder in Google Drive (helper method)
   * @deprecated Unused. Root and content-class indexes use IndexSheetsService. No callers; safe to remove in a future cleanup.
   */
  private async saveIndexFileToFolder(
    accessToken: string,
    folderId: string,
    fileName: string,
    index: any,
    isPublic: boolean = false
  ): Promise<void> {
    const indexContent = JSON.stringify(index, null, 2);

    // Check if index file exists
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      throw new Error('Failed to search for index file');
    }

    const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
    
    if (searchData.files && searchData.files.length > 0) {
      // Update existing index
      const fileId = searchData.files[0].id;

      const updateResponse = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8'
          },
          body: indexContent
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update index file: ${errorText}`);
      }

      // Make index file publicly readable if it's a public index
      if (isPublic) {
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
              })
            }
          );
        } catch (permError: any) {
          // Permission might already exist, ignore
          console.warn(`[saveIndexFileToFolder] Failed to set public permissions:`, permError?.message || permError);
        }
      }
    } else {
      // Create new index using multipart upload
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: fileName,
        parents: [folderId]
      });
      
      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="index.json"',
        'Content-Type: application/json',
        '',
        indexContent,
        `--${boundary}--`
      ].join('\r\n');
      
      const createResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: multipartBody
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create index file: ${errorText}`);
      }

      const fileData = await createResponse.json() as { id: string };
      
      // Make index file publicly readable if it's a public index
      if (isPublic) {
        try {
          await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
              })
            }
          );
        } catch (permError: any) {
          console.warn(`[saveIndexFileToFolder] Failed to set public permissions:`, permError?.message || permError);
        }
      }
    }
  }

  /**
   * Get content class-specific public index (Sheets)
   */
  private async getContentClassPublicIndex(
    accessToken: string,
    folderId: string,
    pnIdentifier: string,
    contentClass: 'media' | 'thoughts' | 'collections'
  ): Promise<any | null> {
    try {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      const spreadsheetId = await IndexSheetsService.getIndexSheet(accessToken, folderId, 'public', contentClass);
      const { files } = await IndexSheetsService.getFiles(accessToken, spreadsheetId);
      const updatedAt = await IndexSheetsService.getUpdatedAt(accessToken, spreadsheetId);
      return {
        identifier: pnIdentifier,
        files,
        updatedAt: updatedAt || new Date().toISOString()
      };
    } catch (e) {
      console.warn('[getContentClassPublicIndex]', e);
      return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
    }
  }

  /**
   * Get content class-specific owner index (Sheets)
   */
  private async getContentClassOwnerIndex(
    accessToken: string,
    folderId: string,
    pnIdentifier: string,
    contentClass: 'media' | 'thoughts' | 'collections'
  ): Promise<any | null> {
    try {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      const spreadsheetId = await IndexSheetsService.getIndexSheet(accessToken, folderId, 'owner', contentClass);
      const { files } = await IndexSheetsService.getFiles(accessToken, spreadsheetId);
      const updatedAt = await IndexSheetsService.getUpdatedAt(accessToken, spreadsheetId);
      return {
        identifier: pnIdentifier,
        files,
        updatedAt: updatedAt || new Date().toISOString()
      };
    } catch (e) {
      console.warn('[getContentClassOwnerIndex]', e);
      return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
    }
  }

  private async setupRoutes(): Promise<void> {
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

    // Public config: client ID for dashboard Google Drive OAuth (no auth; client ID is not secret)
    this.app.get('/api/public-config', (_req, res) => {
      res.json({
        googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID || ''
      });
    });

    // Debug endpoint to check OAuth configuration (without exposing secrets)
    this.app.get('/api/debug/oauth-config', (req, res) => {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
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
    // OAuth token endpoint has its own more lenient limiter, so exclude it
    this.app.use('/api/auth', (req, res, next) => {
      if (req.method === 'OPTIONS') {
        return next(); // Skip rate limiting for OPTIONS requests
      }
      // Skip rate limiting for OAuth token endpoint (it has its own limiter)
      if (req.path === '/api/auth/google-oauth/token' && req.method === 'POST') {
        return next();
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
    // Use very lenient metadataIndexReadLimiter for public discovery (GET metadata-index, nsfw-index)
    // so shared IPs and pre-unlock loads don't hit 429. Other /api/aggregator use aggregatorLimiter.
    this.app.use('/api/aggregator', (req, res, next) => {
      const p = (req.path || req.url?.split('?')[0] || '');
      if (req.method === 'GET' && (p === '/api/aggregator/metadata-index' || p === '/api/aggregator/nsfw-index')) {
        return metadataIndexReadLimiter(req, res, next);
      }
      return aggregatorLimiter(req, res, next);
    });

    // GET /api/aggregator/metadata-index - Query public metadata
    this.app.get('/api/aggregator/metadata-index', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const fileType = req.query.fileType as string | undefined;
        const contentClass = req.query.contentClass as 'media' | 'thought' | 'collection' | undefined;
        const authorDid = req.query.authorDid as string | undefined;
        const indexerId = req.query.indexerId as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
        const debug = req.query.debug === 'true';

        const response = await service.getIndexResponse({
          tags,
          fileType,
          contentClass,
          authorDid,
          indexerId,
          limit,    // SCALABILITY: Pagination support
          offset    // SCALABILITY: Pagination support
        });

        if (debug) {
          // Debug mode: return additional info
          const db = (await import('./server/utils/database')).getDatabasePool();
          // Query all three tables for debug info
          const allTables = ['aggregator_media', 'aggregator_thoughts', 'aggregator_collections'];
          const debugQueries = allTables.map(table =>
            db.query(`
              SELECT file_id, metadata->>'isPublic' as is_public, metadata->>'name' as name, updated_at, '${table}' as table_name
              FROM ${table}
              ORDER BY updated_at DESC
              LIMIT 100
            `)
          );
          const debugResults = await Promise.all(debugQueries);
          const allFiles = { rows: debugResults.flatMap(r => r.rows) };
          
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
        return res.json(response);
      } catch (error: any) {
        console.error('❌ [GET /api/aggregator/metadata-index] Error:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch metadata index',
          message: error.message 
        });
      }
    });

    // GET /api/aggregator/nsfw-index - Query NSFW metadata
    this.app.get('/api/aggregator/nsfw-index', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const fileType = req.query.fileType as string | undefined;
        const authorDid = req.query.authorDid as string | undefined;
        const indexerId = req.query.indexerId as string | undefined;
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
        const debug = req.query.debug === 'true';

        const response = await service.getNSFWIndexResponse({
          tags,
          fileType,
          authorDid,
          indexerId,
          limit,    // SCALABILITY: Pagination support
          offset    // SCALABILITY: Pagination support
        });

        if (debug) {
          // Debug mode: return additional info
          const db = (await import('./server/utils/database')).getDatabasePool();
          const allFiles = await db.query(`
            SELECT file_id, metadata->>'isPublic' as is_public, metadata->>'isNSFW' as is_nsfw, metadata->>'name' as name, updated_at
            FROM aggregator_metadata
            WHERE metadata->>'isPublic' = 'true' AND metadata->>'isNSFW' = 'true'
            ORDER BY updated_at DESC
            LIMIT 100
          `);
          
          return res.json({
            ...response,
            debug: {
              totalInDatabase: allFiles.rows.length,
              nsfwInDatabase: allFiles.rows.filter((r: any) => r.is_nsfw === 'true').length,
              sampleFiles: allFiles.rows.slice(0, 10).map((r: any) => ({
                fileId: r.file_id,
                isPublic: r.is_public,
                isNSFW: r.is_nsfw,
                name: r.name,
                updatedAt: r.updated_at
              }))
            }
          });
        }

        console.log(`📤 [GET /api/aggregator/nsfw-index] Returning ${response.files.length} NSFW files`);
        return res.json(response);
      } catch (error: any) {
        console.error('❌ [GET /api/aggregator/nsfw-index] Error:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch NSFW metadata index',
          message: error.message 
        });
      }
    });

    // GET /api/aggregator/my-files - Get ALL files (public + private) for authenticated user
    this.app.get('/api/aggregator/my-files', async (req, res) => {
      try {
        // Require authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'Missing pnIdentifier in token'
          });
        }

        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const fileType = req.query.fileType as string | undefined;

        const files = await service.getAllFilesForUser(pnIdentifier, {
          tags,
          fileType
        });

        console.log(`📤 [GET /api/aggregator/my-files] Returning ${files.length} files for user ${pnIdentifier}`);
        return res.json({
          files,
          updatedAt: new Date().toISOString(),
          totalFiles: files.length
        });
      } catch (error: any) {
        console.error('❌ [GET /api/aggregator/my-files] Error:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch user files',
          message: error.message 
        });
      }
    });

    // POST /api/aggregator/cleanup - Cleanup disabled (was removing all posts from feeds)
    this.app.post('/api/aggregator/cleanup', async (req, res) => {
      return res.status(410).json({ 
        error: 'Cleanup disabled',
        message: 'Cleanup logic has been disabled as it was removing all posts from feeds. Manual cleanup is no longer available.' 
      });
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
          isPublic: metadata.isPublic === true, // Default to false (private) if not explicitly set to true
          fileType: metadata.fileType || getFileTypeFromMime(metadata.mimeType) || 'other'
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/src/server.ts:1606',message:'Submitting metadata',data:{fileId:validatedMetadata.fileId,isPublic:validatedMetadata.isPublic,pnIdentifier},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Submit metadata to central index
        await service.submitMetadata(validatedMetadata, pnIdentifier);

        // Also update Google Drive index (source of truth) if file is public
        if (validatedMetadata.isPublic === true && pnIdentifier) {
          try {
            const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
            
            // Get user's credentials
            const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
            if (credentialsRecord?.credentials) {
              const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
              if (!out) {
                return this.driveNotInitialized(res);
              }
              const metadataFolder = out.metadataFolderId;
              
              // Get or create public-file-index.xlsx
              const spreadsheetId = await IndexSheetsService.getIndexSheet(
                credentialsRecord.credentials.access_token,
                metadataFolder,
                'public'
              );
              
              // Convert metadata to IndexFileEntry format
              const indexEntry: any = {
                fileId: validatedMetadata.fileId,
                googleDriveFileId: validatedMetadata.backendFileId || validatedMetadata.fileId,
                fileName: validatedMetadata.name || validatedMetadata.title,
                originalName: validatedMetadata.name || validatedMetadata.title,
                mimeType: (validatedMetadata as any).mimeType,
                visibility: 'public',
                uploadedAt: validatedMetadata.uploadDate || new Date().toISOString(),
                owner: validatedMetadata.creator ? {
                  did: validatedMetadata.creator['@id'] || validatedMetadata.creator.identifier?.value,
                  identifier: validatedMetadata.creator.identifier?.value || validatedMetadata.creator['@id']
                } : (validatedMetadata.author ? {
                  did: validatedMetadata.author.did,
                  identifier: validatedMetadata.author.did
                } : undefined),
                tags: validatedMetadata.tags || validatedMetadata.keywords || [],
                description: validatedMetadata.description,
                thumbnail: (validatedMetadata as any).thumbnail,
                publicToken: validatedMetadata.publicToken,
                engagement: validatedMetadata.engagement,
                contentClass: (validatedMetadata as any).contentClass,
                isThoughtThumbnail: (validatedMetadata as any).isThoughtThumbnail,
                thought: validatedMetadata.thought,
                textPost: validatedMetadata.textPost,
                collection: validatedMetadata.collection
              };
              
              // Check if file exists in index, update or add accordingly
              try {
                await IndexSheetsService.updateFile(
                  credentialsRecord.credentials.access_token,
                  spreadsheetId,
                  validatedMetadata.fileId,
                  indexEntry
                );
                console.log(`✅ [${requestId}] Updated Google Drive public-file-index.xlsx for ${validatedMetadata.fileId}`);
              } catch (updateError: any) {
                // If update fails (file not found), try adding it
                if (updateError.message?.includes('not found')) {
                  await IndexSheetsService.addFile(
                    credentialsRecord.credentials.access_token,
                    spreadsheetId,
                    indexEntry
                  );
                  console.log(`✅ [${requestId}] Added to Google Drive public-file-index.xlsx for ${validatedMetadata.fileId}`);
                } else {
                  throw updateError;
                }
              }
            }
          } catch (driveError: any) {
            console.warn(`⚠️ [${requestId}] Failed to update Google Drive index (non-critical):`, driveError?.message || driveError);
            // Don't fail the request - database cache is updated
          }
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/src/server.ts:1611',message:'Metadata submitted successfully',data:{fileId:validatedMetadata.fileId,isPublic:validatedMetadata.isPublic},timestamp:Date.now(),sessionId:'debug-session',runId:'pre-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
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

    // POST /api/aggregator/metadata-index/cleanup-orphaned - Remove orphaned metadata entries (metadata without corresponding Google Drive files)
    // Also run automatically every 5 minutes via runCleanupOrphaned.
    // MUST be before /:fileId route to avoid route conflict
    this.app.post('/api/aggregator/metadata-index/cleanup-orphaned', async (req, res) => {
      try {
        const { runCleanupOrphaned } = await import('./server/jobs/cleanupOrphanedJob');
        const { checked, removed } = await runCleanupOrphaned();
        return res.json({
          success: true,
          checked,
          removed,
          message: `Checked ${checked} file(s), removed ${removed} orphaned metadata entry/entries`
        });
      } catch (error: any) {
        console.error('[CleanupOrphaned] Error:', error);
        console.error('[CleanupOrphaned] Error stack:', error?.stack);
        return res.status(500).json({
          error: 'Failed to cleanup orphaned metadata',
          message: error?.message || String(error),
          errorType: error?.constructor?.name,
          stack: error?.stack
        });
      }
    });

    // POST /api/aggregator/metadata-index/cleanup-tables - Clear all database entries (for fresh start)
    // MUST be before /:fileId route to avoid route conflict
    this.app.post('/api/aggregator/metadata-index/cleanup-tables', async (req, res) => {
      try {
        const db = (await import('./server/utils/database')).getDatabasePool();
        await db.query('DELETE FROM aggregator_media');
        await db.query('DELETE FROM aggregator_thoughts');
        await db.query('DELETE FROM aggregator_collections');
        try {
          await db.query('DELETE FROM feed_posts');
        } catch (e) {
          // Ignore if table doesn't exist
        }
        return res.json({ success: true, message: 'Cleared all aggregator tables' });
      } catch (error: any) {
        console.error('Error in cleanup-tables endpoint:', error);
        return res.status(500).json({ 
          error: 'Failed to cleanup database',
          message: error?.message || String(error)
        });
      }
    });


    // DELETE /api/aggregator/metadata-index/:fileId - Remove public metadata and delete files
    // DELETE /api/aggregator/metadata-index/user/:pnIdentifier - Remove all metadata for a user
    this.app.delete('/api/aggregator/metadata-index/user/:pnIdentifier', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();
        
        const removedCount = await service.removeAllMetadataForUser(pnIdentifier);
        
        return res.json({
          success: true,
          message: `Removed ${removedCount} file(s) from aggregator database`,
          removedCount
        });
      } catch (error: any) {
        console.error('Error removing all metadata for user:', error);
        return res.status(500).json({
          error: 'Failed to remove user metadata',
          error_description: error.message || 'Failed to remove user metadata'
        });
      }
    });

    this.app.delete('/api/aggregator/metadata-index/:fileId', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { fileId } = req.params;
        const accountId = req.query.accountId as string | undefined;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        // STEP 0: Validate token and get user identifier
        const authHeader = req.headers.authorization;
        let tokenPayload = null;
        let userIdentifier: string | null = null;
        let pnIdentifier: string | null = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const { PNOAuthService } = await import('./server/modules/pnOAuthService');
          tokenPayload = PNOAuthService.validateAccessToken(token);
          if (tokenPayload) {
            userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
            pnIdentifier = tokenPayload.pnIdentifier || null;
          } else {
            return res.status(401).json({
              error: 'unauthorized',
              error_description: 'Invalid or expired access token'
            });
          }
        } else {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        // CRITICAL: Only thumbnails have metadata
        // If fileId is a main file, find the thumbnail that references it
        let current = await service.getFileMetadata(fileId);
        let actualFileId = fileId; // The fileId we'll actually operate on (might be thumbnail if fileId was main file)
        
        if (!current) {
          try {
            const db = (await import('./server/utils/database')).getDatabasePool();
            // Search for thumbnail with mainFileId = fileId across all content type tables
            const thumbnailQuery = await db.query(
              `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
               WHERE metadata->>'mainFileId' = $1 
               LIMIT 1`,
              [fileId]
            );
            
            if (thumbnailQuery.rows.length > 0) {
              const thumbnailRow = thumbnailQuery.rows[0];
              actualFileId = thumbnailRow.file_id;
              current = {
                fileId: thumbnailRow.file_id,
                metadata: typeof thumbnailRow.metadata === 'string' 
                  ? JSON.parse(thumbnailRow.metadata) 
                  : thumbnailRow.metadata,
                submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
                pnIdentifier: thumbnailRow.pn_identifier
              };
              console.log(`[MetadataIndex DELETE] Resolved main file ${fileId} to thumbnail ${actualFileId}`);
            }
          } catch (lookupError: any) {
            console.warn(`[MetadataIndex DELETE] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
          }
        }
        
        // CRITICAL: OWNERSHIP VERIFICATION - Only owner can delete metadata
        if (!current) {
          return res.status(404).json({ error: 'File not found in index' });
        }

        const fileOwnerDid = current.metadata.creator?.identifier?.value || 
                           current.metadata.creator?.["@id"] || 
                           current.metadata.author?.did ||
                           current.pnIdentifier;
        
        if (fileOwnerDid !== userIdentifier && current.pnIdentifier !== userIdentifier) {
          console.error(`[MetadataIndex DELETE] UNAUTHORIZED: Attempt to delete metadata for file ${fileId} by non-owner. Owner: ${fileOwnerDid}, Requesting: ${userIdentifier}`);
          return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Only the file owner can delete metadata'
          });
        }

        // STEP 1: Collect all files to delete
        const filesToDelete: string[] = [];
        const metadata = current.metadata;

        // Add thumbnail file (actualFileId)
        filesToDelete.push(actualFileId);

        // Add main file if it exists
        if (metadata.mainFileId) {
          filesToDelete.push(metadata.mainFileId);
          console.log(`[MetadataIndex DELETE] Will delete main file: ${metadata.mainFileId}`);
        }

        // For collections, add all page thumbnails
        if (metadata.collection?.collectionFileIds && Array.isArray(metadata.collection.collectionFileIds)) {
          for (const pageThumbnailId of metadata.collection.collectionFileIds) {
            if (pageThumbnailId && !filesToDelete.includes(pageThumbnailId)) {
              filesToDelete.push(pageThumbnailId);
              console.log(`[MetadataIndex DELETE] Will delete collection page thumbnail: ${pageThumbnailId}`);
            }
          }
        }

        // STEP 2: Delete files from Google Drive
        if (userIdentifier && filesToDelete.length > 0) {
          const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
          
          for (const driveFileId of filesToDelete) {
            try {
              await googleDriveProxyService.deleteFile(userIdentifier, driveFileId, accountId);
              console.log(`✅ [MetadataIndex DELETE] Deleted file ${driveFileId} from Google Drive`);
            } catch (driveError: any) {
              const errorMsg = driveError?.message || String(driveError);
              // 404 is okay - file might already be deleted
              if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
                console.error(`❌ [MetadataIndex DELETE] Failed to delete ${driveFileId} from Google Drive:`, errorMsg);
              } else {
                console.log(`ℹ️ [MetadataIndex DELETE] File ${driveFileId} not found in Google Drive (may already be deleted)`);
              }
            }
          }
        }

        // STEP 3: Delete companion metadata spreadsheet
        if (userIdentifier && pnIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId);
            
            // Get metadata folder
            const pnFolderName = `par Noir - ${pnIdentifier}`;
            const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
            
            const folderResponse = await fetch(folderSearchUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (folderResponse.ok) {
              const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
              if (folderData.files && folderData.files.length > 0) {
                const pnFolderId = folderData.files[0].id;
                
                // Get metadata folder
                const metadataFolderName = '_metadata';
                const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                
                const metadataFolderResponse = await fetch(metadataSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (metadataFolderResponse.ok) {
                  const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                    const metadataFolderId = metadataFolderData.files[0].id;
                    
                    // Find companion metadata spreadsheet
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      actualFileId
                    );
                    
                    if (spreadsheetId) {
                      try {
                        await googleDriveProxyService.deleteFile(userIdentifier, spreadsheetId, accountId);
                        console.log(`✅ [MetadataIndex DELETE] Deleted companion metadata spreadsheet: ${spreadsheetId}`);
                      } catch (spreadsheetError: any) {
                        const errorMsg = spreadsheetError?.message || String(spreadsheetError);
                        if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
                          console.error(`❌ [MetadataIndex DELETE] Failed to delete companion metadata spreadsheet:`, errorMsg);
                        } else {
                          console.log(`ℹ️ [MetadataIndex DELETE] Companion metadata spreadsheet not found (may already be deleted)`);
                        }
                      }
                    } else {
                      console.log(`ℹ️ [MetadataIndex DELETE] Companion metadata spreadsheet not found for ${actualFileId}`);
                    }
                  }
                }
              }
            }
          } catch (companionError: any) {
            console.warn(`⚠️ [MetadataIndex DELETE] Failed to delete companion metadata:`, companionError?.message || companionError);
            // Continue even if companion metadata deletion fails
          }
        }

        // STEP 4: Remove thumbnail metadata from database (actualFileId is already resolved to thumbnail)
        const removed = await service.removeMetadata(actualFileId);

        if (removed) {
          return res.json({ 
            success: true, 
            fileId: actualFileId,
            deletedFiles: filesToDelete.length,
            deletedFromDrive: filesToDelete
          });
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

    // GET /api/aggregator/metadata-index/debug - Debug endpoint to check database state
    this.app.get('/api/aggregator/metadata-index/debug', async (req, res) => {
      try {
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Get all files with their isPublic status
        const allFiles = await db.query(`
          SELECT 
            file_id, 
            metadata->>'isPublic' as is_public, 
            metadata->>'isPublic'::boolean as is_public_bool,
            metadata->>'name' as name,
            metadata->>'fileType' as file_type,
            metadata->>'publicToken' as has_public_token,
            metadata->>'backendFileId' as backend_file_id,
            metadata->>'backend' as backend,
            CASE 
              WHEN metadata->>'textPost' IS NOT NULL OR metadata->>'thought' IS NOT NULL THEN 'thought'
              ELSE metadata->>'fileType'
            END as detected_type,
            updated_at
          FROM aggregator_metadata
          ORDER BY updated_at DESC
        `);
        
        const publicFiles = allFiles.rows.filter((r: any) => 
          r.is_public === 'true' || r.is_public_bool === true
        );
        const privateFiles = allFiles.rows.filter((r: any) => 
          (r.is_public === 'false' || r.is_public === null) && r.is_public_bool !== true
        );
        const filesWithTokenButNotPublic = allFiles.rows.filter((r: any) => 
          r.is_public !== 'true' && r.is_public_bool !== true && r.has_public_token
        );
        const googleDriveFiles = allFiles.rows.filter((r: any) => r.backend === 'google_drive');
        
        // Count by file type
        const thoughts = allFiles.rows.filter((r: any) => 
          r.file_type === 'thought' || r.file_type === 'text' || r.detected_type === 'thought'
        );
        const publicThoughts = thoughts.filter((r: any) => 
          r.is_public === 'true' || r.is_public_bool === true
        );
        
        // Check feed_posts status
        const feedPostsCheck = await db.query(`
          SELECT 
            COUNT(DISTINCT am.file_id) as public_files_total,
            COUNT(DISTINCT fp.file_id) as public_files_in_feeds,
            COUNT(DISTINCT am.file_id) - COUNT(DISTINCT fp.file_id) as public_files_not_in_feeds
          FROM aggregator_metadata am
          LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
          WHERE (am.metadata->>'isPublic' = 'true' OR (am.metadata->>'isPublic')::boolean = true)
        `);
        
        const feedStats = feedPostsCheck.rows[0];

        return res.json({
          totalFiles: allFiles.rows.length,
          publicFiles: publicFiles.length,
          privateFiles: privateFiles.length,
          filesWithTokenButNotPublic: filesWithTokenButNotPublic.length,
          googleDriveFiles: googleDriveFiles.length,
          feedStats: {
            publicFilesTotal: parseInt(feedStats.public_files_total || '0', 10),
            publicFilesInFeeds: parseInt(feedStats.public_files_in_feeds || '0', 10),
            publicFilesNotInFeeds: parseInt(feedStats.public_files_not_in_feeds || '0', 10)
          },
          samplePublicFiles: publicFiles.slice(0, 10).map((r: any) => ({
            fileId: r.file_id,
            name: r.name,
            backendFileId: r.backend_file_id,
            backend: r.backend,
            updatedAt: r.updated_at
          })),
          samplePrivateFiles: privateFiles.slice(0, 5).map((r: any) => ({
            fileId: r.file_id,
            name: r.name,
            isPublic: r.is_public,
            hasPublicToken: !!r.has_public_token,
            backend: r.backend,
            updatedAt: r.updated_at
          })),
          note: 'The public feed (no feedId) shows ALL public files. Specific feeds (with feedId) only show files in feed_posts table.'
        });
      } catch (error: any) {
        console.error('Error in debug endpoint:', error);
        return res.status(500).json({ 
          error: 'Failed to fetch debug info',
          message: error.message 
        });
      }
    });

    // POST /api/aggregator/metadata-index/invalidate-cache - Invalidate index cache
    this.app.post('/api/aggregator/metadata-index/invalidate-cache', async (req, res) => {
      try {
        const { invalidateIndexCache } = await import('./server/utils/cache');
        await invalidateIndexCache();
        return res.json({ 
          success: true, 
          message: 'Index cache invalidated successfully' 
        });
      } catch (error: any) {
        console.error('Error invalidating cache:', error);
        return res.status(500).json({ 
          error: 'Failed to invalidate cache',
          message: error.message 
        });
      }
    });

    // GET /api/aggregator/fix-feeds - Diagnostic and fix endpoint for feed issues
    this.app.get('/api/aggregator/fix-feeds', async (req, res) => {
      try {
        const db = (await import('./server/utils/database')).getDatabasePool();
        const { invalidateIndexCache } = await import('./server/utils/cache');
        
        // 1. Check current state - handle JSONB boolean values safely
        const stateCheck = await db.query(`
          SELECT 
            COUNT(*) as total_files,
            COUNT(*) FILTER (WHERE 
              jsonb_typeof(metadata->'isPublic') = 'boolean' AND (metadata->'isPublic')::boolean = true
              OR jsonb_typeof(metadata->'isPublic') = 'string' AND (metadata->>'isPublic') = 'true'
            ) as public_files,
            COUNT(*) FILTER (WHERE 
              jsonb_typeof(metadata->'isPublic') = 'boolean' AND (metadata->'isPublic')::boolean = false
              OR jsonb_typeof(metadata->'isPublic') = 'string' AND (metadata->>'isPublic') = 'false'
              OR metadata->'isPublic' IS NULL
            ) as private_files
          FROM aggregator_metadata
        `);
        
        const feedPostsCheck = await db.query(`
          SELECT 
            COUNT(DISTINCT am.file_id) as public_files_total,
            COUNT(DISTINCT fp.file_id) as public_files_in_feeds
          FROM aggregator_metadata am
          LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
          WHERE (
            jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true
            OR jsonb_typeof(am.metadata->'isPublic') = 'string' AND (am.metadata->>'isPublic') = 'true'
          )
        `);
        
        // 2. Get sample public files
        const samplePublic = await db.query(`
          SELECT 
            am.file_id,
            am.metadata->>'name' as name,
            CASE 
              WHEN jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true THEN 'true'
              WHEN jsonb_typeof(am.metadata->'isPublic') = 'string' AND am.metadata->>'isPublic' = 'true' THEN 'true'
              ELSE 'false'
            END as is_public,
            COUNT(fp.feed_id) as feed_count
          FROM aggregator_metadata am
          LEFT JOIN feed_posts fp ON am.file_id = fp.file_id
          WHERE (
            jsonb_typeof(am.metadata->'isPublic') = 'boolean' AND (am.metadata->'isPublic')::boolean = true
            OR jsonb_typeof(am.metadata->'isPublic') = 'string' AND (am.metadata->>'isPublic') = 'true'
          )
          GROUP BY am.file_id, am.metadata->>'name', am.metadata->'isPublic'
          ORDER BY am.updated_at DESC
          LIMIT 10
        `);
        
        // 3. Invalidate cache
        await invalidateIndexCache();
        
        const stats = stateCheck.rows[0];
        const feedStats = feedPostsCheck.rows[0];
        
        return res.json({
          success: true,
          message: 'Diagnostic complete and cache cleared',
          database: {
            totalFiles: parseInt(stats.total_files || '0', 10),
            publicFiles: parseInt(stats.public_files || '0', 10),
            privateFiles: parseInt(stats.private_files || '0', 10),
            publicFilesInFeeds: parseInt(feedStats.public_files_in_feeds || '0', 10),
            publicFilesNotInFeeds: parseInt(feedStats.public_files_total || '0', 10) - parseInt(feedStats.public_files_in_feeds || '0', 10)
          },
          samplePublicFiles: samplePublic.rows.map((r: any) => ({
            fileId: r.file_id,
            name: r.name,
            isPublic: r.is_public,
            inFeeds: parseInt(r.feed_count || '0', 10)
          })),
          note: 'Public feed (no feedId) shows ALL public files. Specific feeds only show files in feed_posts table. Cache has been cleared.'
        });
      } catch (error: any) {
        console.error('Error in fix-feeds endpoint:', error);
        return res.status(500).json({ 
          error: 'Failed to run diagnostic',
          message: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });

    // GET /api/aggregator/metadata-index/:fileId/companion-check - Check companion metadata visibility vs database isPublic
    this.app.get('/api/aggregator/metadata-index/:fileId/companion-check', async (req, res) => {
      try {
        const { fileId } = req.params;
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Get auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        if (!tokenPayload) {
          return res.status(401).json({ error: 'Invalid or expired access token' });
        }

        const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
        const identifierCandidates: string[] = [];
        if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
        if (tokenPayload.did) {
          identifierCandidates.push(tokenPayload.did);
          if (tokenPayload.did.startsWith('did:key:')) {
            const keyPart = tokenPayload.did.substring(8);
            if (keyPart) identifierCandidates.push(keyPart);
          }
        }

        // Get database metadata
        const dbMetadata = await service.getFileMetadata(fileId);
        if (!dbMetadata) {
          return res.status(404).json({ error: 'File not found in database' });
        }

        // Try to read companion metadata
        const accountId = req.query.accountId as string | undefined;
        const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
        const backendFileId = dbMetadata.metadata.backendFileId || fileId;
        
        const driveResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        let companionMetadata = null;
        let companionError = null;
        if (driveResponse.ok) {
          const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
          if (driveData.files && driveData.files.length > 0) {
            const spreadsheetId = driveData.files[0].id;
            try {
              companionMetadata = await CompanionMetadataSheets.readMetadata(accessToken, spreadsheetId);
            } catch (error: any) {
              companionError = error.message;
            }
          }
        }

        return res.json({
          fileId,
          database: {
            isPublic: dbMetadata.metadata.isPublic,
            backend: dbMetadata.metadata.backend,
            backendFileId: dbMetadata.metadata.backendFileId
          },
          companionMetadata: companionMetadata ? {
            visibility: companionMetadata.visibility,
            fileId: companionMetadata.fileId,
            googleDriveFileId: companionMetadata.googleDriveFileId
          } : null,
          companionError,
          mismatch: companionMetadata ? (companionMetadata.visibility === 'public') !== dbMetadata.metadata.isPublic : null,
          recommendation: companionMetadata && (companionMetadata.visibility === 'public') !== dbMetadata.metadata.isPublic
            ? `Database has isPublic=${dbMetadata.metadata.isPublic} but companion metadata has visibility=${companionMetadata.visibility}. They should match.`
            : companionMetadata ? 'Values match' : 'Could not read companion metadata'
        });
      } catch (error: any) {
        console.error('❌ Companion check error:', error);
        return res.status(500).json({ error: 'Failed to check companion metadata', message: error.message });
      }
    });

    // GET /api/aggregator/metadata-index/:fileId/inspect - Deep inspection of a specific file's metadata
    this.app.get('/api/aggregator/metadata-index/:fileId/inspect', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();
        const { fileId } = req.params;
        
        const entry = await service.getFileMetadata(fileId);
        if (!entry) {
          return res.json({ 
            exists: false,
            fileId,
            message: 'File not found in database'
          });
        }
        
        const metadata = entry.metadata as any;
        const hasTextPost = !!metadata.textPost;
        const hasThought = !!metadata.thought;
        const textPostContent = metadata.textPost?.content;
        const thoughtContent = metadata.thought?.content;
        const isJustFilename = /^thought-\d+\.(thought|png)/i.test(textPostContent || thoughtContent || '');
        
        return res.json({
          exists: true,
          fileId,
          isPublic: metadata.isPublic === true || metadata.isPublic === 'true',
          fileType: metadata.fileType,
          name: metadata.name,
          hasTextPost,
          hasThought,
          textPostContent: textPostContent ? (textPostContent.length > 100 ? textPostContent.substring(0, 100) + '...' : textPostContent) : null,
          thoughtContent: thoughtContent ? (thoughtContent.length > 100 ? thoughtContent.substring(0, 100) + '...' : thoughtContent) : null,
          isJustFilename,
          hasPublicToken: !!metadata.publicToken,
          metadataKeys: Object.keys(metadata),
          fullMetadata: metadata // Include full metadata for inspection
        });
      } catch (error: any) {
        console.error('Error inspecting file metadata:', error);
        return res.status(500).json({ 
          error: 'Failed to inspect file metadata',
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

    // GET /api/search - Search public metadata
    this.app.get('/api/search', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        // Parse query parameters
        const query = req.query.q as string | undefined;
        const sortBy = (req.query.sort as 'relevance' | 'date' | 'popularity') || 'relevance';
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const fileType = req.query.fileType as string | undefined;
        const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
        const authorDid = req.query.authorDid as string | undefined;
        const feedId = req.query.feedId as string | undefined;
        const feedCategory = req.query.feedCategory as string | undefined;
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const maxRating = req.query.maxRating as string | undefined;

        if (!query || !query.trim()) {
          return res.status(400).json({
            error: 'Query parameter "q" is required',
            files: [],
            total: 0,
            hasMore: false
          });
        }

        const result = await service.searchMetadata(query.trim(), {
          sortBy,
          limit,
          offset,
          fileType,
          tags,
          authorDid,
          feedId,
          feedCategory,
          dateFrom,
          dateTo,
          maxRating
        });

        // Convert to IndexedFile format expected by frontend
        const files = result.files.map(entry => ({
          metadata: entry.metadata,
          thumbnail: undefined // Thumbnails are generated client-side
        }));

        console.log(`🔍 [GET /api/search] Query: "${query}", Found ${files.length} files (total: ${result.total})`);
        return res.json({
          files,
          total: result.total,
          hasMore: result.hasMore
        });
      } catch (error: any) {
        console.error('❌ [GET /api/search] Error:', error);
        return res.status(500).json({
          error: 'Search failed',
          message: error.message,
          files: [],
          total: 0,
          hasMore: false
        });
      }
    });

    // API Routes (v1) - OAuth, Data Points, Content Portability
    const { setupOAuthRoutes, setupDataPointRoutes, setupContentPortabilityRoutes } = await import('./server/modules/apiRoutes');
    setupOAuthRoutes(this.app);
    setupDataPointRoutes(this.app);
    setupContentPortabilityRoutes(this.app);

    // Feed Routes - Posts, Subscriptions, Payment Webhooks
    const { setupFeedRoutes } = await import('./server/modules/feedRoutes');
    setupFeedRoutes(this.app);

    // Widget Routes - Feed Widgets and Public Index
    const { setupWidgetRoutes } = await import('./server/modules/widgetRoutes');
    setupWidgetRoutes(this.app);

    // Subdomain Routes
    const { setupSubdomainRoutes } = await import('./server/modules/subdomainRoutes');
    setupSubdomainRoutes(this.app);

    // Coinbase Commerce Webhook Handler
    const { CoinbaseWebhookHandler } = await import('./server/modules/coinbaseWebhookHandler');
    this.app.post('/api/webhooks/coinbase', express.raw({ type: 'application/json' }), async (req, res) => {
      await CoinbaseWebhookHandler.handleWebhook(req as any, res as any);
    });

    // Migration endpoint removed - feed system migration completed successfully
    // Tables created: feed_payments, feed_delegations

    // GET /api/aggregator/metadata-index/:fileId - Get metadata for a specific file
    this.app.get('/api/aggregator/metadata-index/:fileId', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { fileId } = req.params;
        console.log(`[MetadataIndex GET] Request received for fileId: ${fileId}`);

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        // Check if metadata entry exists
        let metadata = await service.getFileMetadata(fileId);
        console.log(`[MetadataIndex GET] Existing entry check for ${fileId}: ${metadata ? 'found' : 'not found'}`);

        // If not found, fileId might be a main file - try to find thumbnail that references it
        if (!metadata) {
          try {
            const db = (await import('./server/utils/database')).getDatabasePool();
            // Search for thumbnail with mainFileId = fileId across all content type tables
            const thumbnailQuery = await db.query(
              `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
               WHERE metadata->>'mainFileId' = $1 
               LIMIT 1`,
              [fileId]
            );
            
            if (thumbnailQuery.rows.length > 0) {
              const thumbnailRow = thumbnailQuery.rows[0];
              metadata = {
                fileId: thumbnailRow.file_id,
                metadata: typeof thumbnailRow.metadata === 'string' 
                  ? JSON.parse(thumbnailRow.metadata) 
                  : thumbnailRow.metadata,
                submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
                pnIdentifier: thumbnailRow.pn_identifier
              };
              console.log(`[MetadataIndex GET] Found thumbnail ${thumbnailRow.file_id} for main file ${fileId}`);
            }
          } catch (lookupError: any) {
            console.warn(`[MetadataIndex GET] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
          }
        }

        if (!metadata) {
          return res.status(404).json({ error: 'File not found in index' });
        }

        return res.json({ metadata: metadata.metadata || metadata });
      } catch (error: any) {
        console.error('Error getting metadata:', error);
        return res.status(500).json({
          error: 'Failed to get metadata',
          message: error.message
        });
      }
    });

    // PUT /api/aggregator/metadata-index/:fileId - Update metadata (creates entry if doesn't exist)
    this.app.put('/api/aggregator/metadata-index/:fileId', async (req, res) => {
      try {
        const { fileId } = req.params;
        console.log(`[MetadataIndex PUT] Request received for fileId: ${fileId}, isPublic: ${req.body.isPublic}`);
        
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();

        const { 
          name, 
          title,
          description, 
          keywords, 
          tags,
          genre,
          category,
          locationCreated,
          license,
          inLanguage,
          isPublic,
          publicToken,
          isTopPost,
          textPost,
          thought,
          collection, // Collection data with collectionFileIds
          fileType,
          isNSFW,
          subjects,
          feedCategories,
          thumbnailFileId,
          isThoughtThumbnail, // Flag indicating this is a thumbnail of a thought
          isPartOfCollection, // Flag indicating this file is part of a collection
          mainFileId // Reference to the source file (for thumbnails)
        } = req.body;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        // Check if metadata entry exists BEFORE creating/updating (to detect new files)
        let current = await service.getFileMetadata(fileId);
        let actualFileId = fileId; // The fileId we'll actually operate on (might be thumbnail if fileId was main file)
        
        // If fileId has no metadata, it might be a main file - try to find thumbnail that references it
        if (!current) {
          try {
            const db = (await import('./server/utils/database')).getDatabasePool();
            // Search for thumbnail with mainFileId = fileId across all content type tables
            const thumbnailQuery = await db.query(
              `SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_media 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_thoughts 
               WHERE metadata->>'mainFileId' = $1 
               UNION ALL
               SELECT file_id, metadata, submitted_at, pn_identifier FROM aggregator_collections 
               WHERE metadata->>'mainFileId' = $1 
               LIMIT 1`,
              [fileId]
            );
            
            if (thumbnailQuery.rows.length > 0) {
              const thumbnailRow = thumbnailQuery.rows[0];
              actualFileId = thumbnailRow.file_id;
              current = {
                fileId: thumbnailRow.file_id,
                metadata: typeof thumbnailRow.metadata === 'string' 
                  ? JSON.parse(thumbnailRow.metadata) 
                  : thumbnailRow.metadata,
                submittedAt: thumbnailRow.submitted_at ? (thumbnailRow.submitted_at instanceof Date ? thumbnailRow.submitted_at.toISOString() : thumbnailRow.submitted_at) : new Date().toISOString(),
                pnIdentifier: thumbnailRow.pn_identifier
              };
              console.log(`[MetadataIndex PUT] Resolved main file ${fileId} to thumbnail ${actualFileId}`);
            }
          } catch (lookupError: any) {
            console.warn(`[MetadataIndex PUT] Failed to lookup thumbnail for main file ${fileId}:`, lookupError?.message || lookupError);
          }
        }
        
        const fileExistedBefore = !!current;
        console.log(`[MetadataIndex PUT] Existing entry check for ${fileId} (actualFileId: ${actualFileId}): ${current ? 'found' : 'not found'}, existedBefore: ${fileExistedBefore}`);
        
        // Get auth token for operations (needed for both new and existing files)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // Define userIdentifier for use in both new file creation and companion metadata reading
        const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
        
        if (!current) {
          // Create new metadata entry - fetch file info from Google Drive
          const identifierCandidates: string[] = [];
          if (tokenPayload.pnIdentifier) {
            identifierCandidates.push(tokenPayload.pnIdentifier);
          }
          if (tokenPayload.did) {
            identifierCandidates.push(tokenPayload.did);
            if (tokenPayload.did.startsWith('did:key:')) {
              const keyPart = tokenPayload.did.substring(8);
              if (keyPart) {
                identifierCandidates.push(keyPart);
              }
            }
          }

          // Fetch file info from Google Drive
          const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
          const accountId = req.query.accountId as string | undefined;
          
          try {
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
            const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });

            if (!driveResponse.ok) {
              const errorText = await driveResponse.text().catch(() => 'Unknown error');
              console.error(`[MetadataIndex PUT] Failed to fetch file info from Google Drive for ${fileId}:`, driveResponse.status, errorText);
              throw new Error(`Failed to fetch file info: ${driveResponse.status} ${errorText}`);
            }

            const driveFile = await driveResponse.json() as { name?: string; mimeType?: string; createdTime?: string };
            console.log(`[MetadataIndex PUT] Successfully fetched file info from Google Drive for ${fileId}:`, {
              name: driveFile.name,
              mimeType: driveFile.mimeType,
              hasCreatedTime: !!driveFile.createdTime
            });
            
            // Create initial metadata entry
            // IMPORTANT: Default isPublic to true for text posts, false for other files
            const defaultIsPublic = (textPost || thought) ? true : false;
            // Determine fileType using centralized utility (handles collection, textPost, thought, MIME type)
            const determinedFileType = determineFileType({
              fileType,
              collection,
              textPost,
              thought,
              mimeType: driveFile.mimeType,
              isThoughtThumbnail,
              isPartOfCollection
            });
            const initialMetadata: any = {
              fileId: fileId,
              backendFileId: fileId,
              backend: 'google_drive',
              name: name || driveFile.name?.replace(/\.encrypted$/i, '') || fileId,
              ...(title && { title }),
              fileType: determinedFileType,
              uploadDate: driveFile.createdTime || new Date().toISOString(),
              isPublic: isPublic !== undefined ? isPublic : defaultIsPublic,
              ...(publicToken && { publicToken }),
              ...(textPost && { textPost }),
              ...(thought && { thought }),
              ...(collection && { collection }), // Include collection data if provided
              ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
              ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }), // Thumbnails inherit classification from source
              ...(isPartOfCollection !== undefined && { isPartOfCollection }), // Collection files inherit collection classification
              ...(mainFileId && { mainFileId }), // Reference to source file for thumbnails
              ...(thumbnailFileId && { thumbnailFileId }), // Reference to thumbnail file
              "@context": ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
              "@id": `https://parnoir.com/resource/${fileId}`,
              engagement: {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                lastUpdated: new Date().toISOString()
              }
            };

            // Submit initial metadata - ONLY for public files
            // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
            if (initialMetadata.isPublic === true) {
              try {
                // CRITICAL: Pass ownerDid for ownership verification if isPublic is being set
                await service.submitMetadata(initialMetadata, tokenPayload.pnIdentifier, tokenPayload.did || tokenPayload.pnIdentifier);
                console.log(`[MetadataIndex] Created metadata entry for ${fileId}`);
                
                // Also add to Google Drive index (root + content-class e.g. thoughts-public) if file is public
                try {
                  const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
                  const pnIdentifier = tokenPayload.pnIdentifier;
                  if (pnIdentifier) {
                    const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
                    if (credentialsRecord?.credentials) {
                      const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                        (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                      if (googleDriveAccounts.length > 0) {
                        const account = googleDriveAccounts[0];
                        const accountId = this.extractAccountId(account);
                        const token = {
                          access_token: account.access_token || account.accessToken,
                          refresh_token: account.refresh_token || account.refreshToken,
                          expires_at: account.expires_at,
                          expires_in: account.expires_in
                        };
                        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
                      if (!out) {
                        return this.driveNotInitialized(res);
                      }
                      const fileMetadataForIndex = {
                        fileId: initialMetadata.fileId,
                        googleDriveFileId: initialMetadata.backendFileId || fileId,
                        fileName: (driveFile as any).name || initialMetadata.name || initialMetadata.title || fileId,
                        originalName: initialMetadata.name || initialMetadata.title || (driveFile as any).name,
                        mimeType: (driveFile as any).mimeType || 'application/octet-stream',
                        size: parseInt((driveFile as any).size || '0', 10),
                        visibility: 'public' as const,
                        uploadedAt: initialMetadata.uploadDate || new Date().toISOString(),
                        owner: { did: tokenPayload.did || tokenPayload.pnIdentifier, identifier: pnIdentifier },
                        tags: initialMetadata.tags || initialMetadata.keywords || [],
                        description: initialMetadata.description,
                        publicToken: initialMetadata.publicToken,
                        engagement: initialMetadata.engagement,
                        thought: initialMetadata.thought,
                        textPost: initialMetadata.textPost,
                        isThoughtThumbnail: (initialMetadata as any).isThoughtThumbnail,
                        collection: initialMetadata.collection,
                        isPartOfCollection: (initialMetadata as any).isPartOfCollection
                      };
                      await this.updateOwnerFileIndex(credentialsRecord.credentials.access_token, pnIdentifier, out.metadataFolderId, fileMetadataForIndex);
                      await this.updatePublicFileIndex(
                        credentialsRecord.credentials.access_token,
                        pnIdentifier,
                        out.metadataFolderId,
                        out.pnFolderId,
                        fileMetadataForIndex
                      );
                      console.log(`✅ [MetadataIndex] Added new file to Google Drive public index (root + content-class): ${fileId}`);
                    }
                  }
                } catch (driveError: any) {
                  console.warn(`⚠️ [MetadataIndex] Failed to add new file to Google Drive index (non-critical):`, driveError?.message || driveError);
                  // Don't fail the request - database cache is updated
                }
              } catch (submitError: any) {
                console.error(`[MetadataIndex] Failed to submit initial metadata for ${fileId}:`, submitError);
                console.error(`[MetadataIndex] Submit error details:`, {
                  message: submitError?.message,
                  stack: submitError?.stack,
                  metadata: initialMetadata,
                  pnIdentifier: tokenPayload.pnIdentifier,
                  ownerDid: tokenPayload.did || tokenPayload.pnIdentifier
                });
                throw submitError; // Re-throw to be caught by outer catch
              }
            } else {
              console.log(`[MetadataIndex] File ${fileId} is private - skipping database submission (private files only exist in Google Drive + companion metadata)`);
            }
          } catch (driveError: any) {
            console.error(`[MetadataIndex] Failed to fetch file info for ${fileId}:`, driveError);
            // Continue anyway - create entry with minimal info
            // IMPORTANT: Default isPublic to true for text posts, false for other files
            const defaultIsPublic = (textPost || thought) ? true : false;
            // Determine fileType using centralized utility (handles collection, textPost, thought)
            const determinedFileType = determineFileType({
              fileType,
              collection,
              textPost,
              thought,
              isThoughtThumbnail,
              isPartOfCollection
            });
            const minimalMetadata: any = {
              fileId: fileId,
              backendFileId: fileId,
              backend: 'google_drive',
              name: name || fileId,
              ...(title && { title }),
              fileType: determinedFileType,
              uploadDate: new Date().toISOString(),
              isPublic: isPublic !== undefined ? isPublic : defaultIsPublic,
              ...(textPost && { textPost }),
              ...(thought && { thought }),
              ...(collection && { collection }), // Include collection data if provided
              ...(isNSFW !== undefined && { isNSFW: isNSFW === true }),
              ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }), // Thumbnails inherit classification from source
              ...(isPartOfCollection !== undefined && { isPartOfCollection }), // Collection files inherit collection classification
              ...(mainFileId && { mainFileId }), // Reference to source file for thumbnails
              ...(thumbnailFileId && { thumbnailFileId }), // Reference to thumbnail file
              "@context": ['https://schema.org/', 'https://parnoir.com/ns/v1#'],
              "@id": `https://parnoir.com/resource/${fileId}`,
              engagement: {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                lastUpdated: new Date().toISOString()
              }
            };
            // Submit minimal metadata - ONLY for public files
            // Private files should NOT be in the database (they only exist in Google Drive + companion metadata)
            if (minimalMetadata.isPublic === true) {
              try {
                // CRITICAL: Pass ownerDid for ownership verification if isPublic is being set
                await service.submitMetadata(minimalMetadata, tokenPayload.pnIdentifier, tokenPayload.did || tokenPayload.pnIdentifier);
                console.log(`[MetadataIndex] Created minimal metadata entry for ${fileId}`);
                
                // Also add to Google Drive index (root + content-class e.g. thoughts-public) if file is public
                try {
                  const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
                  const pnIdentifier = tokenPayload.pnIdentifier;
                  if (pnIdentifier) {
                    const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
                    if (credentialsRecord?.credentials) {
                      const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                        (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                      if (googleDriveAccounts.length > 0) {
                        const account = googleDriveAccounts[0];
                        const accountId = this.extractAccountId(account);
                        const token = {
                          access_token: account.access_token || account.accessToken,
                          refresh_token: account.refresh_token || account.refreshToken,
                          expires_at: account.expires_at,
                          expires_in: account.expires_in
                        };
                        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
                      if (!out) {
                        return this.driveNotInitialized(res);
                      }
                      const fileMetadataForIndex = {
                        fileId: minimalMetadata.fileId,
                        googleDriveFileId: minimalMetadata.backendFileId || fileId,
                        fileName: minimalMetadata.name || minimalMetadata.title || fileId,
                        originalName: minimalMetadata.name || minimalMetadata.title || fileId,
                        mimeType: 'application/octet-stream',
                        size: 0,
                        visibility: 'public' as const,
                        uploadedAt: minimalMetadata.uploadDate || new Date().toISOString(),
                        owner: { did: tokenPayload.did || tokenPayload.pnIdentifier, identifier: pnIdentifier },
                        tags: minimalMetadata.tags || minimalMetadata.keywords || [],
                        description: minimalMetadata.description,
                        publicToken: minimalMetadata.publicToken,
                        engagement: minimalMetadata.engagement,
                        thought: minimalMetadata.thought,
                        textPost: minimalMetadata.textPost,
                        isThoughtThumbnail: (minimalMetadata as any).isThoughtThumbnail,
                        collection: minimalMetadata.collection,
                        isPartOfCollection: (minimalMetadata as any).isPartOfCollection
                      };
                      await this.updateOwnerFileIndex(credentialsRecord.credentials.access_token, pnIdentifier, out.metadataFolderId, fileMetadataForIndex);
                      await this.updatePublicFileIndex(
                        credentialsRecord.credentials.access_token,
                        pnIdentifier,
                        out.metadataFolderId,
                        out.pnFolderId,
                        fileMetadataForIndex
                      );
                      console.log(`✅ [MetadataIndex] Added new file (minimal) to Google Drive public index (root + content-class): ${fileId}`);
                    }
                  }
                } catch (driveError: any) {
                  console.warn(`⚠️ [MetadataIndex] Failed to add new file (minimal) to Google Drive index (non-critical):`, driveError?.message || driveError);
                  // Don't fail the request - database cache is updated
                }
              } catch (minimalSubmitError: any) {
                console.error(`[MetadataIndex] Failed to submit minimal metadata for ${fileId}:`, minimalSubmitError);
                console.error(`[MetadataIndex] Minimal submit error details:`, {
                  message: minimalSubmitError?.message,
                  stack: minimalSubmitError?.stack,
                  metadata: minimalMetadata
                });
                // Don't throw - we'll check if entry exists after and handle accordingly
                // But log extensively so we can debug
              }
            } else {
              console.log(`[MetadataIndex] File ${fileId} is private (minimal) - skipping database submission (private files only exist in Google Drive + companion metadata)`);
            }
          }
        }

        // Refetch to ensure entry exists (in case it was just created)
        // BUT: Private files should NOT be in the database, so skip refetch for private files
        // Determine if file is private by checking isPublic with defaults
        const defaultIsPublicForRefetch = (textPost || thought) ? true : false;
        const actualIsPublicForRefetch = isPublic !== undefined ? isPublic : defaultIsPublicForRefetch;
        
        if (actualIsPublicForRefetch === true) {
          // Only refetch for public files (or files being made public)
          // Add a small delay for database consistency if this was a new file
          if (!fileExistedBefore) {
            // Small delay to allow database transaction to commit
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          current = await service.getFileMetadata(fileId);
          console.log(`[MetadataIndex PUT] After upsert, refetch for ${fileId}: ${current ? 'found' : 'not found'}, existedBefore: ${fileExistedBefore}`);
          
          // If still not found after delay, try one more time
          if (!current && !fileExistedBefore) {
            await new Promise(resolve => setTimeout(resolve, 200));
            current = await service.getFileMetadata(fileId);
            console.log(`[MetadataIndex PUT] Second refetch attempt for ${fileId}: ${current ? 'found' : 'not found'}`);
          }
          
          if (!current) {
            console.error(`[MetadataIndex PUT] Failed to create/find metadata entry for ${fileId}`);
            console.error(`[MetadataIndex PUT] Debug info:`, {
              fileId,
              fileExistedBefore,
              requestBody: {
                name,
                fileType,
                isPublic,
                mainFileId,
                isThoughtThumbnail,
                hasTextPost: !!textPost,
                hasThought: !!thought
              }
            });
            
            // If this was a new file creation that failed, try to provide more helpful error
            if (!fileExistedBefore) {
              return res.status(500).json({ 
                error: 'Failed to create metadata entry',
                message: 'Metadata creation appeared to succeed but entry was not found in database. This may be a database consistency issue.',
                fileId
              });
            }
            
            return res.status(404).json({ error: 'File not found in index' });
          }
        } else {
          // Private file - should not be in database, so don't refetch
          console.log(`[MetadataIndex PUT] File ${fileId} is private - skipping database refetch (private files only exist in Google Drive + companion metadata)`);
          current = null; // Ensure current is null for private files
        }

        // CRITICAL: If isPublic is not explicitly provided, read from companion metadata
        // Companion metadata is the source of truth for visibility
        // IMPORTANT: If isPublic is undefined, we should preserve the existing value OR read from companion metadata
        // Only set to false if explicitly provided as false
        // NOTE: For private files, current will be null (they're not in database), so skip companion metadata reading
        let finalIsPublic = isPublic;
        if (isPublic === undefined && current && current.metadata.backend === 'google_drive') {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.ts:2100',message:'Reading companion metadata for isPublic',data:{fileId,currentIsPublic:current.metadata.isPublic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
          // #endregion
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
            const accountId = req.query.accountId as string | undefined;
            const identifierCandidates: string[] = [];
            if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
            if (tokenPayload.did) {
              identifierCandidates.push(tokenPayload.did);
              if (tokenPayload.did.startsWith('did:key:')) {
                const keyPart = tokenPayload.did.substring(8);
                if (keyPart) identifierCandidates.push(keyPart);
              }
            }
            
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier || tokenPayload.pnIdentifier || tokenPayload.did, accountId, identifierCandidates);
            const backendFileId = current.metadata.backendFileId || fileId;
            
            // Find companion metadata file
            const driveResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (driveResponse.ok) {
              const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
              if (driveData.files && driveData.files.length > 0) {
                const spreadsheetId = driveData.files[0].id;
                const companionMetadata = await CompanionMetadataSheets.readMetadata(accessToken, spreadsheetId);
                if (companionMetadata) {
                  finalIsPublic = companionMetadata.visibility === 'public';
                  // #region agent log
                  fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.ts:2131',message:'Companion metadata read result',data:{fileId,visibility:companionMetadata.visibility,finalIsPublic,currentIsPublic:current.metadata.isPublic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
                  // #endregion
                  console.log(`[MetadataIndex PUT] Read isPublic from companion metadata: ${finalIsPublic} (visibility: ${companionMetadata.visibility})`);
                }
              }
            }
          } catch (companionError: any) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.ts:2136',message:'Failed to read companion metadata',data:{fileId,error:companionError.message,currentIsPublic:current.metadata.isPublic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
            // #endregion
            console.warn(`[MetadataIndex PUT] Failed to read companion metadata for ${fileId}:`, companionError.message);
            // If companion metadata read failed, preserve existing isPublic value (don't change it)
            if (finalIsPublic === undefined && current) {
              finalIsPublic = current.metadata.isPublic;
              console.log(`[MetadataIndex PUT] Preserving existing isPublic value: ${finalIsPublic}`);
            }
          }
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/e9725a07-b703-47ab-ba6c-a54c252a4988',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.ts:2142',message:'Updating metadata with isPublic',data:{fileId,isPublicProvided:isPublic,finalIsPublic,currentIsPublic:current?.metadata.isPublic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion

        // CRITICAL: OWNERSHIP VERIFICATION - Only owner can update metadata
        if (current) {
          const fileOwnerDid = current.metadata.creator?.identifier?.value || 
                             current.metadata.creator?.["@id"] || 
                             current.metadata.author?.did ||
                             current.pnIdentifier;
          const requestingUserDid = tokenPayload.pnIdentifier || tokenPayload.did;
          
          if (fileOwnerDid !== requestingUserDid && current.pnIdentifier !== requestingUserDid) {
            console.error(`[MetadataIndex PUT] UNAUTHORIZED: Attempt to update metadata for file ${fileId} by non-owner. Owner: ${fileOwnerDid}, Requesting: ${requestingUserDid}`);
            return res.status(403).json({ 
              error: 'Forbidden',
              message: 'Only the file owner can update metadata'
            });
          }
        }

        // Determine fileType using centralized utility (auto-sets collection fileType when collection data is provided)
        const determinedFileTypeForUpdate = determineFileType({
          fileType,
          collection,
          textPost,
          thought,
          isThoughtThumbnail,
          isPartOfCollection
        });

        // Create companion metadata file for ALL files at upload/creation time (just like share tokens)
        // Companion metadata is created regardless of public/private status - it's just metadata storage
        // This matches the behavior of share tokens which are generated at upload time
        // ARCHITECTURAL: Companion metadata is created FIRST (source of truth) before database update (cache)
        const shouldCreateCompanionMetadata = !fileExistedBefore; // Only create on initial upload, not on updates
        
        if (shouldCreateCompanionMetadata) {
          // Determine final visibility status from req.body - companion metadata is source of truth
          let finalVisibility: 'public' | 'private' = 'private';
          if (isPublic !== undefined || textPost || thought) {
            const finalIsPublic = isPublic !== undefined ? isPublic : ((textPost || thought) ? true : false);
            finalVisibility = finalIsPublic ? 'public' : 'private';
          }
          
          console.log(`[MetadataIndex PUT] Companion metadata creation check for ${fileId}:`, {
            fileExistedBefore,
            shouldCreateCompanionMetadata,
            finalVisibility,
            hasAuthHeader: !!(req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
          });
          
          console.log(`[MetadataIndex PUT] File ${fileId} is new - creating companion metadata (visibility=${finalVisibility})...`);
          try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              const { PNOAuthService } = await import('./server/modules/pnOAuthService');
              const tokenPayload = PNOAuthService.validateAccessToken(token);
              
              if (tokenPayload) {
                const pnIdentifier = tokenPayload.pnIdentifier;
                if (!pnIdentifier) {
                  console.error(`[MetadataIndex PUT] Missing pnIdentifier in token payload`);
                  throw new Error('Missing pnIdentifier in token');
                }
                const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
                const identifierCandidates: string[] = [];
                if (tokenPayload.pnIdentifier) {
                  identifierCandidates.push(tokenPayload.pnIdentifier);
                }
                if (tokenPayload.did) {
                  identifierCandidates.push(tokenPayload.did);
                  if (tokenPayload.did.startsWith('did:key:')) {
                    const keyPart = tokenPayload.did.substring(8);
                    if (keyPart) {
                      identifierCandidates.push(keyPart);
                    }
                  }
                }
                
                const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
                const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
                const accountId = req.query.accountId as string | undefined;
                
                // Get credentials to build token object
                const credentialsRecord = await storageCredentialsService.getCredentials(userIdentifier);
                if (!credentialsRecord?.credentials) {
                  throw new Error('Google Drive not connected');
                }
                const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                  (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                if (googleDriveAccounts.length === 0) {
                  throw new Error('Google Drive not connected');
                }
                const account = googleDriveAccounts[0];
                const actualAccountId = accountId || this.extractAccountId(account);
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const accessToken = token.access_token; // Keep for fetch calls
                
                // Fetch file info from Google Drive
                const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (!driveResponse.ok) {
                  const errorText = await driveResponse.text().catch(() => 'Unknown error');
                  console.error(`[MetadataIndex PUT] Failed to fetch file info: ${driveResponse.status} ${driveResponse.statusText} - ${errorText}`);
                  throw new Error(`Failed to fetch file info: ${driveResponse.status}`);
                }
                
                const driveFile = await driveResponse.json() as { name?: string; mimeType?: string; size?: string; createdTime?: string };
                const originalFileName = driveFile.name?.replace(/\.encrypted$/i, '') || fileId;
                const originalMimeType = driveFile.mimeType || 'application/octet-stream';
                
                const out = await this.getMetadataFolder(token, pnIdentifier, actualAccountId);
                if (!out) {
                  return this.driveNotInitialized(res);
                }
                const { metadataFolderId, pnFolderId } = out;
                
                const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
                      
                      // Check if companion metadata already exists
                      const existingSpreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                        accessToken,
                        metadataFolderId,
                        fileId
                      );
                      
                      if (!existingSpreadsheetId) {
                        // Companion metadata doesn't exist - create it
                        console.log(`[MetadataIndex PUT] Companion metadata not found for file ${fileId} - creating (visibility=${finalVisibility})...`);
                        
                        // Use publicToken from req.body - companion metadata is source of truth
                        const tokenToUse = publicToken;
                        
                        console.log(`[MetadataIndex PUT] Companion metadata for file ${fileId}:`, {
                          hasPublicTokenInRequest: !!publicToken,
                          usingToken: !!tokenToUse,
                          hasMainFileId: !!mainFileId,
                          mainFileId: mainFileId,
                          isThoughtThumbnail: isThoughtThumbnail
                        });
                        
                        // Determine fileType and contentClass from req.body values - companion metadata is source of truth
                        const determinedFileType = determineFileType({
                          fileType: fileType,
                          collection: collection,
                          textPost: textPost,
                          thought: thought,
                          mimeType: originalMimeType,
                          isThoughtThumbnail: isThoughtThumbnail,
                          isPartOfCollection: isPartOfCollection
                        });
                        const determinedContentClass = determineContentClass({
                          fileType: determinedFileType,
                          collection: collection,
                          textPost: textPost,
                          thought: thought,
                          isThoughtThumbnail: isThoughtThumbnail,
                          isPartOfCollection: isPartOfCollection
                        });
                        
                        const companionMetadata = {
                          fileId: fileId,
                          googleDriveFileId: fileId,
                          fileName: driveFile.name || fileId,
                          originalName: originalFileName,
                          mimeType: originalMimeType,
                          fileType: determinedFileType,
                          contentClass: determinedContentClass,
                          size: parseInt(driveFile.size || '0', 10),
                          visibility: finalVisibility,
                          uploadedAt: driveFile.createdTime || new Date().toISOString(),
                          owner: {
                            did: tokenPayload.did,
                            identifier: pnIdentifier
                          },
                          tags: [],
                          ...(thumbnailFileId && { thumbnailFileId }),
                          mainFileId: mainFileId,
                          ...(textPost && { textPost }),
                          ...(thought && { thought }),
                          ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                          ...(collection && { collection }),
                          ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                          engagement: {
                            views: 0,
                            likes: 0,
                            comments: 0,
                            shares: 0,
                            lastUpdated: new Date().toISOString(),
                            engagementHistory: []
                          }
                        };
                        
                        console.log(`[MetadataIndex PUT] Companion metadata object before creating spreadsheet:`, {
                          fileId: companionMetadata.fileId,
                          hasMainFileId: !!companionMetadata.mainFileId,
                          mainFileId: companionMetadata.mainFileId,
                          isThoughtThumbnail: isThoughtThumbnail
                        });
                        
                        // Create new metadata spreadsheet
                        const spreadsheetId = await CompanionMetadataSheets.createSpreadsheet(
                          accessToken,
                          metadataFolderId,
                          fileId,
                          companionMetadata
                        );
                        console.log(`[MetadataIndex PUT] ✅ Created new companion metadata spreadsheet for ${fileId}: ${spreadsheetId}`);
                      } else {
                        // Companion metadata exists - update it if needed
                        console.log(`[MetadataIndex PUT] Companion metadata already exists for ${fileId} - updating if needed...`);
                        
                        const currentMetadata = await service.getFileMetadata(fileId);
                        const existingPublicToken = currentMetadata?.metadata?.publicToken;
                        const tokenToUse = publicToken || existingPublicToken;
                        const metadataForUpdate = (currentMetadata?.metadata || {}) as any;
                        const mainFileIdForUpdate = mainFileId || metadataForUpdate.mainFileId;
                        const thumbnailFileIdForUpdate = thumbnailFileId || metadataForUpdate.thumbnailFileId;
                        
                        const companionMetadata = {
                          fileId: fileId,
                          googleDriveFileId: fileId,
                          fileName: driveFile.name || fileId,
                          originalName: originalFileName,
                          mimeType: originalMimeType,
                          size: parseInt(driveFile.size || '0', 10),
                          visibility: finalVisibility,
                          uploadedAt: driveFile.createdTime || new Date().toISOString(),
                          owner: {
                            did: tokenPayload.did,
                            identifier: pnIdentifier
                          },
                          tags: [],
                          ...(thumbnailFileIdForUpdate && { thumbnailFileId: thumbnailFileIdForUpdate }),
                          mainFileId: mainFileIdForUpdate,
                          ...(textPost && { textPost }),
                          ...(thought && { thought }),
                          ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                          ...(collection && { collection }),
                          ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                          engagement: {
                            views: 0,
                            likes: 0,
                            comments: 0,
                            shares: 0,
                            lastUpdated: new Date().toISOString(),
                            engagementHistory: []
                          }
                        };
                        
                        await CompanionMetadataSheets.updateMetadata(
                          accessToken,
                          existingSpreadsheetId,
                          companionMetadata
                        );
                        console.log(`[MetadataIndex PUT] ✅ Updated existing companion metadata spreadsheet for ${fileId}`);
                      }
                      
                      // Use req.body values for index updates - companion metadata is source of truth
                      const tokenToUseForIndex = publicToken;
                      const mainFileIdForIndex = mainFileId;
                      const thumbnailFileIdForIndex = thumbnailFileId;
                      
                      const companionMetadataForIndex = {
                        fileId: fileId,
                        googleDriveFileId: fileId,
                        fileName: driveFile.name || fileId,
                        originalName: originalFileName,
                        mimeType: originalMimeType,
                        size: parseInt(driveFile.size || '0', 10),
                        visibility: finalVisibility,
                        uploadedAt: driveFile.createdTime || new Date().toISOString(),
                        owner: {
                          did: tokenPayload.did,
                          identifier: pnIdentifier
                        },
                        tags: [],
                        ...(thumbnailFileIdForIndex && { thumbnailFileId: thumbnailFileIdForIndex }),
                        ...(mainFileIdForIndex && { mainFileId: mainFileIdForIndex }),
                        ...(tokenToUseForIndex && { publicToken: tokenToUseForIndex }),
                        ...(textPost && { textPost }),
                        ...(thought && { thought }),
                        ...(isThoughtThumbnail !== undefined && { isThoughtThumbnail }),
                        ...(collection && { collection }),
                        ...(isPartOfCollection !== undefined && { isPartOfCollection }),
                        engagement: {
                          views: 0,
                          likes: 0,
                          comments: 0,
                          shares: 0,
                          lastUpdated: new Date().toISOString(),
                          engagementHistory: []
                        }
                      };
                      
                      // Update owner index (contains ALL files for the owner)
                      try {
                        await this.updateOwnerFileIndex(
                          accessToken,
                          pnIdentifier,
                          metadataFolderId,
                          companionMetadataForIndex
                        );
                      } catch (ownerIndexError: any) {
                        console.warn(`[MetadataIndex] Failed to update owner index (non-critical):`, ownerIndexError?.message || ownerIndexError);
                      }
                      
                      // Update public file index (only if file is public)
                      if (finalVisibility === 'public') {
                        if (!companionMetadataForIndex.publicToken) {
                          console.warn(`[MetadataIndex] No publicToken found for public file ${fileId} - file may not load in public feed`);
                        } else {
                          console.log(`[MetadataIndex] Using publicToken for public file index update: ${fileId}`);
                        }
                        
                        try {
                          await this.updatePublicFileIndex(
                            accessToken,
                            pnIdentifier,
                            metadataFolderId,
                            pnFolderId,
                            companionMetadataForIndex
                          );
                          console.log(`[MetadataIndex] Successfully updated public file index for file ${fileId}`);
                        } catch (indexError: any) {
                          console.error(`[MetadataIndex] Failed to update public file index:`, indexError?.message || indexError);
                          console.error(`[MetadataIndex] Stack trace:`, indexError?.stack);
                        }
                      } else {
                        console.log(`[MetadataIndex] File ${fileId} is private - skipping public index update`);
                      }
                }
              }
          } catch (metadataError: any) {
            const msg = metadataError?.message || String(metadataError);
            if (msg.includes('DRIVE_NOT_INITIALIZED')) {
              return this.driveNotInitialized(res);
            }
            console.error(`[MetadataIndex] Failed to create companion metadata file for ${fileId}:`, msg);
            console.error(`[MetadataIndex] Stack trace:`, metadataError?.stack);
          }
        } else {
          console.log(`[MetadataIndex PUT] File ${fileId} already existed (fileExistedBefore=${fileExistedBefore}) - skipping companion metadata creation`);
        }

        // ARCHITECTURAL FIX: Update companion metadata FIRST (source of truth), then database (cache)
        // This ensures companion metadata is always authoritative for metadata fields
        if (name || description || keywords || tags || genre || category || locationCreated || license) {
          try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              const { PNOAuthService } = await import('./server/modules/pnOAuthService');
              const tokenPayload = PNOAuthService.validateAccessToken(token);
              
              if (tokenPayload) {
                const pnIdentifier = tokenPayload.pnIdentifier;
                if (pnIdentifier) {
                  const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
                  const identifierCandidates: string[] = [];
                  if (tokenPayload.pnIdentifier) {
                    identifierCandidates.push(tokenPayload.pnIdentifier);
                  }
                  if (tokenPayload.did) {
                    identifierCandidates.push(tokenPayload.did);
                    if (tokenPayload.did.startsWith('did:key:')) {
                      const keyPart = tokenPayload.did.substring(8);
                      if (keyPart) {
                        identifierCandidates.push(keyPart);
                      }
                    }
                  }
                  
                  const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
                  const accountId = req.query.accountId as string | undefined;
                  const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
                  
                  // Get pN folder and metadata folder
                  const pnFolderName = `par Noir - pn-${pnIdentifier}`;
                  const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const folderResponse = await fetch(folderSearchUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  let pnFolderId: string | null = null;
                  if (folderResponse.ok) {
                    const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (folderData.files && folderData.files.length > 0) {
                      pnFolderId = folderData.files[0].id;
                    }
                  }
                  
                  if (pnFolderId) {
                    const metadataFolderName = '_metadata';
                    const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                    
                    const metadataFolderResponse = await fetch(metadataSearchUrl, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    let metadataFolderId: string | null = null;
                    if (metadataFolderResponse.ok) {
                      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                        metadataFolderId = metadataFolderData.files[0].id;
                      }
                    }
                    
                    if (metadataFolderId) {
                      const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
                      const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                        accessToken,
                        metadataFolderId,
                        actualFileId
                      );
                      
                      if (spreadsheetId) {
                        // Build partial update for companion metadata
                        const companionMetadataUpdate: Partial<any> = {};
                        if (description !== undefined) companionMetadataUpdate.description = description;
                        if (tags || keywords) companionMetadataUpdate.tags = tags || keywords || [];
                        // Note: category, genre, location, license may need to be stored in metadata field
                        // or added to CompanionMetadataSheets.updateMetadata() method
                        // For now, we update what we can (description and tags)
                        
                        await CompanionMetadataSheets.updateMetadata(
                          accessToken,
                          spreadsheetId,
                          companionMetadataUpdate
                        );
                        console.log(`[MetadataIndex PUT] Updated companion metadata FIRST (source of truth) for ${actualFileId} with metadata fields`);
                      } else {
                        console.log(`[MetadataIndex PUT] Companion metadata spreadsheet not found for ${actualFileId} - metadata fields will be saved to database only`);
                      }
                    }
                  }
                }
              }
            }
          } catch (companionMetadataError: any) {
            console.error(`[MetadataIndex PUT] CRITICAL: Failed to update companion metadata (source of truth) for ${fileId}:`, companionMetadataError?.message || companionMetadataError);
            // Since companion metadata is the source of truth, we should fail the request if it can't be updated
            // This prevents database and companion metadata from being out of sync
            return res.status(500).json({ 
              error: 'Failed to update companion metadata',
              message: 'Companion metadata update failed. This is the source of truth, so the update cannot proceed.'
            });
          }
        }

        // Update database metadata AFTER companion metadata (cache syncs from source of truth)
        // Use actualFileId (resolved to thumbnail if fileId was main file)
        const updated = await service.updateMetadata(actualFileId, {
          name,
          title,
          description,
          keywords: keywords || tags,
          tags: tags || keywords,
          genre,
          category,
          locationCreated,
          license,
          inLanguage,
          fileType: determinedFileTypeForUpdate,
          textPost,
          thought,
          collection, // Include collection data if provided
          isNSFW,
          // Only update isPublic if we have a value (either from request or companion metadata)
          // If undefined, updateMetadata will preserve existing value
          isPublic: finalIsPublic !== undefined ? finalIsPublic : isPublic,
          publicToken, // Include publicToken from request body (null = delete, undefined = preserve)
          subjects,
          feedCategories,
          thumbnailFileId,
          isThoughtThumbnail, // Thumbnails inherit classification from source
          isPartOfCollection, // Collection files inherit collection classification
          mainFileId // Reference to source file for thumbnails
        });

        // Also update Google Drive index (source of truth) if file is public
        const updatedIsPublic = finalIsPublic !== undefined ? finalIsPublic : (isPublic !== undefined ? isPublic : updated?.isPublic);
        if (updatedIsPublic === true && updated) {
          try {
            const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
            
            // Get user's credentials
            const pnIdentifier = tokenPayload.pnIdentifier;
            if (pnIdentifier) {
              const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
              if (credentialsRecord?.credentials) {
                const googleDriveAccounts = credentialsRecord.credentials.googleDriveAccounts || 
                  (credentialsRecord.credentials.googleDrive ? [credentialsRecord.credentials.googleDrive] : []);
                if (googleDriveAccounts.length > 0) {
                  const account = googleDriveAccounts[0];
                  const accountId = this.extractAccountId(account);
                  const token = {
                    access_token: account.access_token || account.accessToken,
                    refresh_token: account.refresh_token || account.refreshToken,
                    expires_at: account.expires_at,
                    expires_in: account.expires_in
                  };
                  const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
                  if (!out) {
                    return this.driveNotInitialized(res);
                  }
                  const metadataFolder = out.metadataFolderId;
                  
                  // Get or create public-file-index.xlsx
                  const spreadsheetId = await IndexSheetsService.getIndexSheet(
                    token,
                  metadataFolder,
                  'public'
                );
                
                // Convert metadata to IndexFileEntry format
                const indexEntry: any = {
                  fileId: actualFileId,
                  googleDriveFileId: updated.backendFileId || actualFileId,
                  fileName: updated.name || updated.title,
                  originalName: updated.name || updated.title,
                  mimeType: (updated as any).mimeType,
                  visibility: 'public',
                  uploadedAt: updated.uploadDate || new Date().toISOString(),
                  owner: updated.creator ? {
                    did: updated.creator['@id'] || updated.creator.identifier?.value,
                    identifier: updated.creator.identifier?.value || updated.creator['@id']
                  } : undefined,
                  tags: updated.tags || updated.keywords || [],
                  description: updated.description,
                  thumbnail: (updated as any).thumbnail,
                  publicToken: updated.publicToken,
                  engagement: updated.engagement,
                  contentClass: (updated as any).contentClass,
                  isThoughtThumbnail: (updated as any).isThoughtThumbnail,
                  thought: updated.thought,
                  textPost: updated.textPost,
                  collection: updated.collection
                };
                
                // Check if file exists in index, update or add accordingly
                try {
                  await IndexSheetsService.updateFile(
                    credentialsRecord.credentials.access_token,
                    spreadsheetId,
                    actualFileId,
                    indexEntry
                  );
                  console.log(`✅ [MetadataIndex PUT] Updated Google Drive public-file-index.xlsx for ${actualFileId}`);
                } catch (updateError: any) {
                  // If update fails (file not found), try adding it
                  if (updateError.message?.includes('not found')) {
                    await IndexSheetsService.addFile(
                      credentialsRecord.credentials.access_token,
                      spreadsheetId,
                      indexEntry
                    );
                    console.log(`✅ [MetadataIndex PUT] Added to Google Drive public-file-index.xlsx for ${actualFileId}`);
                  } else {
                    throw updateError;
                  }
                }
              }
            }
          } catch (driveError: any) {
            console.warn(`⚠️ [MetadataIndex PUT] Failed to update Google Drive index (non-critical):`, driveError?.message || driveError);
            // Don't fail the request - database cache is updated
          }
        }

        // Track if we successfully deleted the file (so we can return success even if file no longer exists)
        let fileWasDeleted = false;

        // If isPublic === false AND file existed before (was public), DELETE from public tables AFTER updating metadata
        // This ensures the file is completely removed from feeds when changing from public to private
        // BUT: Don't delete new files that are created as private - they should stay in the database
        // (only not appear in public feeds/indexes)
        if (isPublic === false && fileExistedBefore) {
          try {
            const removed = await service.removeMetadata(actualFileId);
            if (removed) {
              fileWasDeleted = true;
              console.log(`✅ [MetadataIndex PUT] Deleted file ${actualFileId} from public tables (isPublic: false)`);
              
              // Verify deletion
              const verifyDeleted = await service.getFileMetadata(actualFileId);
              if (verifyDeleted) {
                console.error(`❌ [MetadataIndex PUT] CRITICAL: File ${actualFileId} still exists after deletion!`);
              } else {
                console.log(`✅ [MetadataIndex PUT] Verified: File ${actualFileId} removed from database`);
              }
              
              // Invalidate cache immediately
              try {
                const { invalidateIndexCache } = await import('./server/utils/cache');
                await invalidateIndexCache();
                console.log(`✅ [MetadataIndex PUT] Cache invalidated after deletion`);
              } catch (cacheError: any) {
                console.warn(`⚠️ [MetadataIndex PUT] Cache invalidation failed:`, cacheError?.message);
              }
            } else {
              console.warn(`⚠️ [MetadataIndex PUT] File ${actualFileId} not found in database to delete`);
            }
          } catch (deleteError: any) {
            console.error(`❌ [MetadataIndex PUT] Failed to delete file ${actualFileId}:`, deleteError?.message || deleteError);
            // Continue - companion metadata will still be updated
          }
        }

        // Refetch current after updateMetadata() to get latest state (or null if deleted)
        current = await service.getFileMetadata(actualFileId);

        // SIMPLIFIED: Update companion metadata if isPublic is being changed
        // For private files, current might be null if we just deleted it, so use updated metadata from updateMetadata()
        if ((isPublic === false || isPublic === true)) {
          // Use current metadata if available, otherwise use updated metadata from updateMetadata() call
          const metadataForCompanion = current?.metadata || updated;
          try {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              const { PNOAuthService } = await import('./server/modules/pnOAuthService');
              const tokenPayload = PNOAuthService.validateAccessToken(token);
              
              if (tokenPayload) {
                const pnIdentifier = tokenPayload.pnIdentifier;
                if (!pnIdentifier) {
                  console.error(`[MetadataIndex PUT] Missing pnIdentifier in token payload`);
                  throw new Error('Missing pnIdentifier in token');
                }
                const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
                const identifierCandidates: string[] = [];
                if (tokenPayload.pnIdentifier) {
                  identifierCandidates.push(tokenPayload.pnIdentifier);
                }
                if (tokenPayload.did) {
                  identifierCandidates.push(tokenPayload.did);
                  if (tokenPayload.did.startsWith('did:key:')) {
                    const keyPart = tokenPayload.did.substring(8);
                    if (keyPart) {
                      identifierCandidates.push(keyPart);
                    }
                  }
                }
                
                const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
                const accountId = req.query.accountId as string | undefined;
                const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
                
                // Get pN folder and metadata folder
                const pnFolderName = `par Noir - pn-${pnIdentifier}`;
                const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                let pnFolderId: string | null = null;
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    pnFolderId = folderData.files[0].id;
                  }
                }
                
                if (pnFolderId) {
                  const metadataFolderName = '_metadata';
                  const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const metadataFolderResponse = await fetch(metadataSearchUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                  });
                  
                  let metadataFolderId: string | null = null;
                  if (metadataFolderResponse.ok) {
                    const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                      metadataFolderId = metadataFolderData.files[0].id;
                    }
                  }
                  
                  if (metadataFolderId) {
                    const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      actualFileId
                    );
                    
                    if (spreadsheetId) {
                      const visibility = isPublic === true ? 'public' : 'private';
                      
                      // Get metadata to determine contentClass and thumbnailFileId
                      // For private files, current might be null if already deleted, so use metadataForCompanion
                      const metadataForType = (metadataForCompanion || {}) as any;
                      
                      // Determine fileType and contentClass
                      const determinedFileType = determineFileType({
                        fileType: metadataForType.fileType,
                        collection: metadataForType.collection,
                        textPost: metadataForType.textPost,
                        thought: metadataForType.thought,
                        mimeType: metadataForType.mimeType,
                        isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                        isPartOfCollection: metadataForType.isPartOfCollection
                      });
                      const determinedContentClass = determineContentClass({
                        fileType: determinedFileType,
                        collection: metadataForType.collection,
                        textPost: metadataForType.textPost,
                        thought: metadataForType.thought,
                        isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                        isPartOfCollection: metadataForType.isPartOfCollection
                      });
                      
                      await CompanionMetadataSheets.updateMetadata(
                        accessToken,
                        spreadsheetId,
                        { 
                          visibility: visibility as 'public' | 'private',
                          fileType: determinedFileType,
                          contentClass: determinedContentClass,
                          thumbnailFileId: metadataForType.thumbnailFileId
                        }
                      );
                      console.log(`[MetadataIndex PUT] Updated companion metadata (source of truth) for ${actualFileId} to ${visibility} (contentClass: ${determinedContentClass})`);
                    } else {
                      console.log(`[MetadataIndex PUT] Companion metadata spreadsheet not found for ${fileId} - will be created in companion metadata creation block`);
                    }
                  }
                }
              }
            }
          } catch (companionMetadataError: any) {
            console.error(`[MetadataIndex PUT] CRITICAL: Failed to update companion metadata (source of truth) for ${fileId}:`, companionMetadataError?.message || companionMetadataError);
            // Since companion metadata is the source of truth, we should fail the request if it can't be updated
            // This prevents database and companion metadata from being out of sync
            return res.status(500).json({ 
              error: 'Failed to update companion metadata',
              message: 'Companion metadata update failed. This is the source of truth, so the update cannot proceed.'
            });
          }
        }
        
        // CRITICAL: Submit metadata to aggregator service so it appears in feeds
        // Only runs if file is public and exists in database
        if (isPublic === true && current) {
          try {
            // Get token payload for submitMetadata
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
              const token = authHeader.substring(7);
              const { PNOAuthService } = await import('./server/modules/pnOAuthService');
              const submitTokenPayload = PNOAuthService.validateAccessToken(token);
              
              if (submitTokenPayload) {
                // Determine fileType and contentClass from current metadata
                const metadataForType = (current.metadata || {}) as any;
                const determinedFileType = determineFileType({
                  fileType: metadataForType.fileType,
                  collection: metadataForType.collection,
                  textPost: metadataForType.textPost,
                  thought: metadataForType.thought,
                  mimeType: metadataForType.mimeType,
                  isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                  isPartOfCollection: metadataForType.isPartOfCollection
                });
                const determinedContentClass = determineContentClass({
                  fileType: determinedFileType,
                  collection: metadataForType.collection,
                  textPost: metadataForType.textPost,
                  thought: metadataForType.thought,
                  isThoughtThumbnail: metadataForType.isThoughtThumbnail,
                  isPartOfCollection: metadataForType.isPartOfCollection
                });
                
                const publicMetadata = {
                  ...current.metadata,
                  isPublic: true,
                  fileId: current.metadata.fileId || actualFileId,
                  // Ensure required fields are present
                  backend: current.metadata.backend || 'google_drive',
                  backendFileId: current.metadata.backendFileId || actualFileId,
                  name: current.metadata.name || current.metadata.title || actualFileId,
                  uploadDate: current.metadata.uploadDate || new Date().toISOString(),
                  fileType: determinedFileType,
                  contentClass: determinedContentClass,
                  thumbnailFileId: metadataForType.thumbnailFileId
                };
                
                await service.submitMetadata(
                  publicMetadata as any,
                  submitTokenPayload.pnIdentifier,
                  submitTokenPayload.did || submitTokenPayload.pnIdentifier
                );
                console.log(`[MetadataIndex PUT] Submitted metadata to aggregator for public file ${actualFileId}`);
              }
            }
          } catch (submitError: any) {
            console.error(`[MetadataIndex PUT] Failed to submit metadata to aggregator:`, submitError?.message || submitError);
            // Don't fail the request - metadata is updated, just not in aggregator yet
          }
        }
        

        // Handle isTopPost update
        if (isTopPost !== undefined) {
          current = await service.getFileMetadata(fileId);
          if (current) {
            // Get the file owner's pnIdentifier
            const ownerPnIdentifier = current.pnIdentifier || 
                                     current.metadata?.creator?.identifier?.value ||
                                     current.metadata?.author?.did;
            
            if (ownerPnIdentifier && isTopPost === true) {
              // If setting this file as top post, unset any other top posts by the same user
              const db = (await import('./server/utils/database')).getDatabasePool();
              
              // Find all files by this owner that have isTopPost: true
              const otherTopPostsResult = await db.query(`
                SELECT file_id, metadata
                FROM aggregator_metadata
                WHERE file_id != $1
                  AND pn_identifier = $2
                  AND metadata->>'isTopPost' = 'true'
              `, [fileId, ownerPnIdentifier]);
              
              // Unset isTopPost for all other files by this owner
              for (const row of otherTopPostsResult.rows) {
                const otherMetadata = typeof row.metadata === 'string' 
                  ? JSON.parse(row.metadata) 
                  : row.metadata;
                const updatedOtherMetadata = {
                  ...otherMetadata,
                  isTopPost: false
                };
                await db.query(
                  `UPDATE aggregator_metadata 
                   SET metadata = $1, updated_at = NOW()
                   WHERE file_id = $2`,
                  [JSON.stringify(updatedOtherMetadata), row.file_id]
                );
                console.log(`[MetadataIndex PUT] Unset isTopPost for file ${row.file_id} (owner: ${ownerPnIdentifier})`);
              }
            }
            
            // Update current file's isTopPost
            const updatedMetadata = {
              ...current.metadata,
              isTopPost: isTopPost
            };
            const db = (await import('./server/utils/database')).getDatabasePool();
            await db.query(
              `UPDATE aggregator_metadata 
               SET metadata = $1, updated_at = NOW()
               WHERE file_id = $2`,
              [JSON.stringify(updatedMetadata), fileId]
            );
            console.log(`[MetadataIndex PUT] Set isTopPost=${isTopPost} for file ${fileId}`);
            
            // Refetch after isTopPost update
            current = await service.getFileMetadata(fileId);
          }
        }

        // Return the updated metadata (or current if updateMetadata returned null)
        // If file was deleted (made private), return success even if file no longer exists in database
        const result = updated || current;
        
        // For new private files, return success even though they're not in database
        // Private files are only stored in Google Drive + companion metadata, not in the aggregator database
        const isNewPrivateFile = !fileExistedBefore && actualIsPublicForRefetch === false;
        if (isNewPrivateFile && !result && !fileWasDeleted) {
          // Return success - private files are only in Google Drive + companion metadata
          return res.json({ 
            success: true, 
            metadata: null, 
            private: true,
            message: 'Private file metadata created successfully (stored in Google Drive only)'
          });
        }
        
        if (!result && !fileWasDeleted) {
          return res.status(404).json({ error: 'File not found in index' });
        }

        // If file was deleted, return success with the metadata we had before deletion
        if (fileWasDeleted && !result) {
          return res.json({ success: true, metadata: updated || null, deleted: true });
        }

        return res.json({ success: true, metadata: result });
      } catch (error: any) {
        console.error('Error updating metadata:', error);
        return res.status(500).json({ 
          error: 'Failed to update metadata',
          message: error.message 
        });
      }
    });

    // GET /api/aggregator/subjects/popular - Get popular subjects
    this.app.get('/api/aggregator/subjects/popular', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 30;
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Query all metadata and extract subjects, count frequency
        const result = await db.query(`
          SELECT metadata->>'subjects' as subjects
          FROM aggregator_metadata
          WHERE metadata->>'subjects' IS NOT NULL
            AND metadata->>'isPublic' = 'true'
        `);
        
        const subjectCounts = new Map<string, number>();
        
        result.rows.forEach(row => {
          if (row.subjects) {
            try {
              const subjects = JSON.parse(row.subjects);
              if (Array.isArray(subjects)) {
                subjects.forEach((subject: string) => {
                  const normalized = subject.toLowerCase().trim();
                  if (normalized) {
                    subjectCounts.set(normalized, (subjectCounts.get(normalized) || 0) + 1);
                  }
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });
        
        // Sort by count and return top N
        const popular = Array.from(subjectCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([subject]) => subject);
        
        return res.json({ subjects: popular });
      } catch (error: any) {
        console.error('Error fetching popular subjects:', error);
        return res.status(500).json({ error: 'Failed to fetch popular subjects' });
      }
    });

    // GET /api/aggregator/subjects/search - Search subjects
    this.app.get('/api/aggregator/subjects/search', async (req, res) => {
      try {
        const query = (req.query.q as string)?.toLowerCase().trim() || '';
        if (!query) {
          return res.json({ subjects: [] });
        }
        
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Query all metadata and extract subjects
        const result = await db.query(`
          SELECT metadata->>'subjects' as subjects
          FROM aggregator_metadata
          WHERE metadata->>'subjects' IS NOT NULL
            AND metadata->>'isPublic' = 'true'
        `);
        
        const matchingSubjects = new Set<string>();
        
        result.rows.forEach(row => {
          if (row.subjects) {
            try {
              const subjects = JSON.parse(row.subjects);
              if (Array.isArray(subjects)) {
                subjects.forEach((subject: string) => {
                  const normalized = subject.toLowerCase().trim();
                  if (normalized.includes(query)) {
                    matchingSubjects.add(normalized);
                  }
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });
        
        return res.json({ subjects: Array.from(matchingSubjects).slice(0, 20) });
      } catch (error: any) {
        console.error('Error searching subjects:', error);
        return res.status(500).json({ error: 'Failed to search subjects' });
      }
    });

    // GET /api/aggregator/subjects/by-category - Get subjects by category
    this.app.get('/api/aggregator/subjects/by-category', async (req, res) => {
      try {
        const category = req.query.category as string;
        if (!category) {
          return res.json({ subjects: [] });
        }
        
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Query metadata with specific category
        const result = await db.query(`
          SELECT metadata->>'subjects' as subjects
          FROM aggregator_metadata
          WHERE metadata->'feedCategories' @> $1::jsonb
            AND metadata->>'isPublic' = 'true'
            AND metadata->>'subjects' IS NOT NULL
        `, [JSON.stringify([category])]);
        
        const subjectCounts = new Map<string, number>();
        
        result.rows.forEach(row => {
          if (row.subjects) {
            try {
              const subjects = JSON.parse(row.subjects);
              if (Array.isArray(subjects)) {
                subjects.forEach((subject: string) => {
                  const normalized = subject.toLowerCase().trim();
                  if (normalized) {
                    subjectCounts.set(normalized, (subjectCounts.get(normalized) || 0) + 1);
                  }
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        });
        
        // Sort by count and return
        const subjects = Array.from(subjectCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([subject]) => subject)
          .slice(0, 30);
        
        return res.json({ subjects });
      } catch (error: any) {
        console.error('Error fetching subjects by category:', error);
        return res.status(500).json({ error: 'Failed to fetch subjects by category' });
      }
    });

    // POST /api/aggregator/subjects/normalize - Normalize and check for similar subjects
    this.app.post('/api/aggregator/subjects/normalize', async (req, res) => {
      try {
        const { subject } = req.body;
        if (!subject || typeof subject !== 'string') {
          return res.status(400).json({ error: 'Subject is required' });
        }
        
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Get all existing subjects
        const result = await db.query(`
          SELECT DISTINCT jsonb_array_elements_text(metadata->'subjects') as subject
          FROM aggregator_metadata
          WHERE metadata->>'subjects' IS NOT NULL
            AND metadata->>'isPublic' = 'true'
        `);
        
        const existingSubjects = result.rows.map(r => r.subject.toLowerCase().trim()).filter(Boolean);
        const normalized = subject.toLowerCase().trim();
        
        // Simple similarity check (exact match or contains)
        const similar = existingSubjects.find(existing => {
          return existing === normalized || 
                 existing.includes(normalized) || 
                 normalized.includes(existing);
        });
        
        return res.json({
          normalized,
          similar: similar || null,
          isNew: !similar
        });
      } catch (error: any) {
        console.error('Error normalizing subject:', error);
        return res.status(500).json({ error: 'Failed to normalize subject' });
      }
    });

    // PUT /api/storage/credentials/:identityId - Save storage credentials (server encrypted)
    this.app.put('/api/storage/credentials/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;
        const { credentials, cid } = req.body;

        // SECURITY: Sanitize identityId in logs - never log pn names or short identifiers
        // CRITICAL: pn identifiers start with 'pn-' and are safe to log (they're hashes, not names)
        // Only redact if it's short AND doesn't start with 'pn-' or 'did:' or public key prefix
        const sanitizedIdentityId = identityId && identityId.length < 20 && !identityId.startsWith('pn-') && !identityId.startsWith('did:') && !identityId.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA')
          ? '[REDACTED - potential pn name]'
          : identityId?.substring(0, 50) + (identityId && identityId.length > 50 ? '...' : '');

        console.log(`[StorageCredentials PUT] Received request for identityId: ${sanitizedIdentityId}`);
        console.log(`[StorageCredentials PUT] Credentials structure:`, {
          hasGoogleDriveAccounts: !!credentials?.googleDriveAccounts,
          googleDriveAccountsLength: Array.isArray(credentials?.googleDriveAccounts) ? credentials.googleDriveAccounts.length : 0,
          hasGoogleDrive: !!credentials?.googleDrive,
          allKeys: Object.keys(credentials || {})
        });

        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize to pnIdentifier format
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        if (!credentials) {
          return res.status(400).json({ error: 'Missing credentials in request body' });
        }

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const record = await storageCredentialsService.upsertCredentials(pnIdentifier, credentials, cid);
        
        // SECURITY: Use sanitized identityId in logs
        console.log(`[StorageCredentials PUT] Successfully saved credentials for identityId: ${sanitizedIdentityId}`);

        let directoryBuilt = true;
        let folderInitError: string | null = null;

        // Initialize Google Drive folder structure if this is a new Google Drive connection
        const hasGoogleDrive = credentials?.googleDriveAccounts?.length > 0 || credentials?.googleDrive;
        if (hasGoogleDrive) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            
            // Get the first Google Drive account
            const googleDriveAccounts = credentials.googleDriveAccounts || 
              (credentials.googleDrive ? [credentials.googleDrive] : []);
            
            if (googleDriveAccounts.length > 0) {
              const account = googleDriveAccounts[0];
              const accountId = this.extractAccountId(account);
              
              // Get access token - use normalized pnIdentifier
              const accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
              
              // Initialize folder structure (creates pN folder and _metadata folder if they don't exist)
              console.log(`[StorageCredentials PUT] Initializing folder structure for identityId: ${sanitizedIdentityId}`);
              const metadataFolderId = await this.getOrCreateMetadataFolder(accessToken, pnIdentifier);
              
              // Get pN folder ID for messages folder creation
              const normalizedPn = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
              const pnFolderName = `par Noir - ${normalizedPn}`;
              const pnFolderQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const pnFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderQuery)}&fields=files(id)&pageSize=1`;
              const pnFolderResponse = await fetch(pnFolderUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              
              let pnFolderId: string | null = null;
              if (pnFolderResponse.ok) {
                const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
                if (pnFolderData.files && pnFolderData.files.length > 0) {
                  pnFolderId = pnFolderData.files[0].id;
                }
              }
              
              // Initialize messages folder (in pN folder, not _metadata)
              if (pnFolderId) {
                try {
                  const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
                  const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(accessToken, pnFolderId);
                  console.log(`[StorageCredentials PUT] Initialized messages folder for identityId: ${sanitizedIdentityId}`);
                  
                  // Initialize inbox sheet for fast conversation loading
                  try {
                    const inboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(accessToken, messagesFolderId);
                    console.log(`[StorageCredentials PUT] Initialized inbox sheet for identityId: ${sanitizedIdentityId}`);
                    
                    // Cache folder IDs for fast future access
                    const cachedFolderIds = {
                      inboxSheetId,
                      messagesFolderId,
                      metadataFolderId,
                      pnFolderId, // Cache pN folder ID - static, never changes
                      ...(credentials.cachedFolderIds || {})
                    };
                    credentials.cachedFolderIds = cachedFolderIds;
                    // Update credentials with cached folder IDs
                    try {
                      await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);
                      console.log(`[StorageCredentials PUT] Cached folder IDs for identityId: ${sanitizedIdentityId}`);
                    } catch (cacheErr: any) {
                      console.warn(`[StorageCredentials PUT] Failed to cache folder IDs:`, cacheErr?.message);
                    }
                  } catch (inboxError: any) {
                    console.warn(`[StorageCredentials PUT] Failed to initialize inbox sheet:`, inboxError?.message || inboxError);
                  }
                } catch (msgFolderError: any) {
                  console.warn(`[StorageCredentials PUT] Failed to initialize messages folder:`, msgFolderError?.message || msgFolderError);
                }
              }
              
              // Initialize all content class folders (media, thoughts, collections)
              console.log(`[StorageCredentials PUT] Initializing content class folders for identityId: ${sanitizedIdentityId}`);
              await this.initializeContentClassFolders(accessToken, metadataFolderId);
              
              // Initialize root index files (public-file-index.xlsx and owner-file-index.xlsx)
              console.log(`[StorageCredentials PUT] Initializing index files for identityId: ${sanitizedIdentityId}`);
              await this.initializeIndexFiles(accessToken, metadataFolderId, identityId);
              
              console.log(`[StorageCredentials PUT] Successfully initialized folder structure for identityId: ${sanitizedIdentityId}`);
              
              // Initialize all metadata files with default structures
              const { PreferencesService } = await import('./server/modules/preferencesService');
              const { EngagementDriveService } = await import('./server/modules/engagementDriveService');
              const { NotificationService } = await import('./server/modules/notificationService');
              const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
              const { ProfileService } = await import('./server/modules/profileService');
              const { ConnectionsService } = await import('./server/modules/connectionsService');
              const { MessagingLedgerService } = await import('./server/modules/messagingLedgerService');
              const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
              const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
              
              const now = new Date().toISOString();
              
              // Initialize preferences.json (for fast filtering) and preferences.xlsx (for history)
              try {
                // Initialize preferences.json (pass identityId for caching)
                const existingPreferences = await PreferencesService.getPreferencesFile(accessToken, metadataFolderId, identityId);
                if (!existingPreferences) {
                  await PreferencesService.updatePreferencesFile(accessToken, metadataFolderId, identityId, {
                    identifier: identityId,
                    updatedAt: now,
                    tagPreferences: []
                  });
                  console.log(`[StorageCredentials PUT] Initialized preferences.json for identityId: ${sanitizedIdentityId}`);
                }
                
                // Initialize preferences.xlsx (for interaction history logging)
                const { PreferencesSheetsService } = await import('./server/modules/preferencesSheetsService');
                try {
                  await PreferencesSheetsService.getPreferencesSheet(accessToken, metadataFolderId);
                } catch (prefSheetError: any) {
                  if (prefSheetError?.message?.includes('not found')) {
                    await PreferencesSheetsService.createPreferencesSheet(accessToken, metadataFolderId);
                  } else {
                    throw prefSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized preferences.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (prefError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize preferences:`, prefError?.message || prefError);
              }
              
              // Note: engagement.json is no longer initialized - we use engagement.xlsx (Sheets) instead
              
              // Initialize notifications.xlsx
              try {
                const { NotificationsSheetsService } = await import('./server/modules/notificationsSheetsService');
                try {
                  await NotificationsSheetsService.getNotificationsSheet(accessToken, metadataFolderId);
                } catch (notifSheetError: any) {
                  if (notifSheetError?.message?.includes('not found')) {
                    await NotificationsSheetsService.createNotificationsSheet(accessToken, metadataFolderId);
                  } else {
                    throw notifSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized notifications.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (notifError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize notifications.xlsx:`, notifError?.message || notifError);
              }
              
              // Initialize activity_ledger.xlsx
              try {
                const { ActivityLedgerSheetsService } = await import('./server/modules/activityLedgerSheetsService');
                try {
                  await ActivityLedgerSheetsService.getActivityLedgerSheet(accessToken, metadataFolderId);
                } catch (activitySheetError: any) {
                  if (activitySheetError?.message?.includes('not found')) {
                    await ActivityLedgerSheetsService.createActivityLedgerSheet(accessToken, metadataFolderId);
                  } else {
                    throw activitySheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized activity_ledger.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (activityError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize activity_ledger.xlsx:`, activityError?.message || activityError);
              }
              
              // Initialize connections.xlsx - ONLY create if truly doesn't exist
              try {
                const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
                try {
                  await ConnectionsSheetsService.getConnectionsSheet(accessToken, metadataFolderId);
                  console.log(`[StorageCredentials PUT] Found existing connections.xlsx for identityId: ${sanitizedIdentityId}`);
                } catch (getError: any) {
                  // CRITICAL: Only create if the sheet genuinely doesn't exist, not on any error
                  // This prevents accidentally overwriting existing connections due to transient errors
                  if (getError?.message?.includes('not found')) {
                    console.log(`[StorageCredentials PUT] connections.xlsx not found, creating new one for identityId: ${sanitizedIdentityId}`);
                    await ConnectionsSheetsService.createConnectionsSheet(accessToken, metadataFolderId);
                  } else {
                    // Don't create on auth errors, API errors, etc - these indicate a real problem
                    console.error(`[StorageCredentials PUT] Failed to access connections.xlsx (will NOT create new one):`, getError?.message || getError);
                    throw getError;
                  }
                }
              } catch (connError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize connections.xlsx:`, connError?.message || connError);
              }
              
              // Initialize engagement.xlsx
              try {
                const { EngagementSheetsService } = await import('./server/modules/engagementSheetsService');
                try {
                  await EngagementSheetsService.getEngagementSheet(accessToken, metadataFolderId);
                } catch (engSheetError: any) {
                  if (engSheetError?.message?.includes('not found')) {
                    await EngagementSheetsService.createEngagementSheet(accessToken, metadataFolderId);
                  } else {
                    throw engSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized engagement.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (engError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize engagement.xlsx:`, engError?.message || engError);
              }
              
              // Initialize messaging_ledger.xlsx
              try {
                const { MessagingLedgerSheetsService } = await import('./server/modules/messagingLedgerSheetsService');
                try {
                  await MessagingLedgerSheetsService.getMessagingLedgerSheet(accessToken, metadataFolderId);
                } catch (msgSheetError: any) {
                  if (msgSheetError?.message?.includes('not found')) {
                    await MessagingLedgerSheetsService.createMessagingLedgerSheet(accessToken, metadataFolderId);
                  } else {
                    throw msgSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized messaging_ledger.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (msgError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize messaging_ledger.xlsx:`, msgError?.message || msgError);
              }
              
              // Note: public-file-index.xlsx and owner-file-index.xlsx are initialized in initializeIndexFiles() above (line 4846)
              // Note: preferences.xlsx is already initialized above (line 4879) - no need to initialize again
              
              // Initialize profile.json
              try {
                const existingProfile = await ProfileService.getProfileFile(accessToken, metadataFolderId);
                if (!existingProfile) {
                  await ProfileService.updateProfileFile(accessToken, metadataFolderId, identityId, {
                    identifier: identityId,
                    updatedAt: now
                  });
                  console.log(`[StorageCredentials PUT] Initialized profile.json for identityId: ${sanitizedIdentityId}`);
                }
              } catch (profileError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize profile.json:`, profileError?.message || profileError);
              }
              
              // Note: connections.json is no longer initialized - we use connections.xlsx (Sheets) instead
              
              // Note: messaging_ledger.json is no longer initialized - we use messaging_ledger.xlsx (Sheets) instead
              
              // Initialize zkp-data-points.xlsx
              try {
                const { ZKPDataPointsSheetsService } = await import('./server/modules/zkpDataPointsSheetsService');
                try {
                  await ZKPDataPointsSheetsService.getZKPDataPointsSheet(accessToken, metadataFolderId);
                } catch (zkpSheetError: any) {
                  if (zkpSheetError?.message?.includes('not found')) {
                    await ZKPDataPointsSheetsService.createZKPDataPointsSheet(accessToken, metadataFolderId);
                  } else {
                    throw zkpSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized zkp-data-points.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (zkpError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize zkp-data-points.xlsx:`, zkpError?.message || zkpError);
              }

              // Initialize third-party-permissions.xlsx
              try {
                const { ThirdPartyPermissionsSheetsService } = await import('./server/modules/thirdPartyPermissionsSheetsService');
                try {
                  await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(accessToken, metadataFolderId);
                } catch (permSheetError: any) {
                  if (permSheetError?.message?.includes('not found')) {
                    await ThirdPartyPermissionsSheetsService.createThirdPartyPermissionsSheet(accessToken, metadataFolderId);
                  } else {
                    throw permSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized third-party-permissions.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (permError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize third-party-permissions.xlsx:`, permError?.message || permError);
              }

              // Initialize followers.xlsx and following.xlsx
              try {
                const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
                try {
                  await ConnectionsSheetsService.getFollowersSheet(accessToken, metadataFolderId);
                } catch (followersSheetError: any) {
                  if (followersSheetError?.message?.includes('not found')) {
                    await ConnectionsSheetsService.createFollowersSheet(accessToken, metadataFolderId);
                  } else {
                    throw followersSheetError;
                  }
                }
                try {
                  await ConnectionsSheetsService.getFollowingSheet(accessToken, metadataFolderId);
                } catch (followingSheetError: any) {
                  if (followingSheetError?.message?.includes('not found')) {
                    await ConnectionsSheetsService.createFollowingSheet(accessToken, metadataFolderId);
                  } else {
                    throw followingSheetError;
                  }
                }
                console.log(`[StorageCredentials PUT] Initialized followers.xlsx and following.xlsx for identityId: ${sanitizedIdentityId}`);
              } catch (ffError: any) {
                console.warn(`[StorageCredentials PUT] Failed to initialize followers/following:`, ffError?.message || ffError);
              }

              console.log(`[StorageCredentials PUT] Successfully initialized all metadata files for identityId: ${sanitizedIdentityId}`);
            }
          } catch (err: any) {
            // Don't fail the credential save if folder initialization fails
            // This is non-critical - folders will be created on-demand if needed
            directoryBuilt = false;
            folderInitError = err?.message || String(err);
            console.warn(`[StorageCredentials PUT] Failed to initialize folder structure for identityId: ${sanitizedIdentityId}`, folderInitError);
          }
        }

        return res.json({
          success: true,
          identityId: record.identityId,
          cid: record.cid ?? null,
          updatedAt: record.updatedAt,
          directoryBuilt,
          ...(folderInitError != null && { folderInitError })
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

        // Normalize to pnIdentifier format
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        let record = await storageCredentialsService.getCredentials(pnIdentifier);

        if (!record) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        // Proactively refresh expired access tokens so the client receives valid tokens.
        // getAccessToken() will refresh when expired and persist; we re-fetch to return the updated credentials.
        const credentials = record.credentials;
        const accounts = credentials?.googleDriveAccounts || (credentials?.googleDrive ? [credentials.googleDrive] : []);
        if (Array.isArray(accounts) && accounts.length > 0) {
          const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
          for (const account of accounts) {
            const accountId = (account as any)?.backendId || (account as any)?.keyPrefix || undefined;
            const hasRefresh = !!((account as any)?.refresh_token || (account as any)?.refreshToken);
            if (hasRefresh) {
              try {
                await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
              } catch {
                // Leave token as-is on refresh failure (e.g. revoked). Client will get 401 and may reconnect.
              }
            }
          }
          record = await storageCredentialsService.getCredentials(identityId);
        }

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

    // GET /api/storage/owner-index/:identityId - Read owner file index from Sheets (merged: content-class + root)
    this.app.get('/api/storage/owner-index/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');

        // Get user credentials to build token object
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }

        // Merged view: aggregate from content-class indices, fallback to root
        const contentTypes: Array<'media' | 'thoughts' | 'collections'> = ['media', 'thoughts', 'collections'];
        const allFiles: any[] = [];
        for (const contentType of contentTypes) {
          const folderQuery = `name='${contentType}' and '${out.metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (!folderRes.ok) continue;
          const folderData = await folderRes.json() as { files?: Array<{ id: string }> };
          if (!folderData.files?.length) continue;
          const idx = await this.getContentClassOwnerIndex(accessToken, folderData.files[0].id, identityId, contentType);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        // Fallback to root owner index
        const rootIndex = await this.getOwnerFileIndex(accessToken, out.metadataFolderId, identityId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[OwnerIndex] Error:', error?.message || error);
        return res.status(500).json({
          error: 'Failed to read owner index',
          message: error?.message || String(error)
        });
      }
    });

    // POST /api/storage/owner-index/:identityId/entries - Add/update entry in owner index (for dashboard)
    this.app.post('/api/storage/owner-index/:identityId/entries', async (req, res) => {
      try {
        const { identityId } = req.params;
        const entry = req.body?.entry;
        if (!identityId || !entry) {
          return res.status(400).json({ error: 'Missing identityId or body.entry' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        // Get user credentials to build token object
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await this.updateOwnerFileIndex(accessToken, identityId, out.metadataFolderId, entry);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[OwnerIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update owner index', message: error?.message || String(error) });
      }
    });

    // GET /api/storage/public-index/:identityId - Read public file index from Sheets (merged: content-class + root)
    this.app.get('/api/storage/public-index/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        // Get user credentials to build token object
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }

        // Merged view: aggregate from content-class public indices, fallback to root
        const contentTypes: Array<'media' | 'thoughts' | 'collections'> = ['media', 'thoughts', 'collections'];
        const allFiles: any[] = [];
        for (const contentType of contentTypes) {
          const folderQuery = `name='${contentType}' and '${out.metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          if (!folderRes.ok) continue;
          const folderData = await folderRes.json() as { files?: Array<{ id: string }> };
          if (!folderData.files?.length) continue;
          const idx = await this.getContentClassPublicIndex(accessToken, folderData.files[0].id, identityId, contentType);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        const rootIndex = await this.getPublicFileIndex(accessToken, out.metadataFolderId, identityId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[PublicIndex] Error:', error?.message || error);
        return res.status(500).json({
          error: 'Failed to read public index',
          message: error?.message || String(error)
        });
      }
    });

    // POST /api/storage/public-index/:identityId/entries - Add/update entry in public index (for dashboard)
    this.app.post('/api/storage/public-index/:identityId/entries', async (req, res) => {
      try {
        const { identityId } = req.params;
        const entry = req.body?.entry;
        if (!identityId || !entry) {
          return res.status(400).json({ error: 'Missing identityId or body.entry' });
        }

        // Normalize pn identifier
        const pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        // Get user credentials to build token object
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await this.updatePublicFileIndex(accessToken, identityId, out.metadataFolderId, out.pnFolderId, entry);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[PublicIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update public index', message: error?.message || String(error) });
      }
    });

    // GET /api/storage/accounts/:identityId - List available cloud storage accounts (without exposing tokens)
    this.app.get('/api/storage/accounts/:identityId', async (req, res) => {
      console.log(`[StorageAccounts] Endpoint called for identityId: ${req.params.identityId}`);
      try {
        const { identityId } = req.params;

        if (!identityId) {
          console.log(`[StorageAccounts] Missing identityId parameter`);
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        // CRITICAL: Normalize identityId to pn identifier format
        // Browser app may send DID, pn identifier hash, or full pn identifier
        // For storage accounts, we need the pn identifier (pn-{hash})
        let pnIdentifier: string;
        if (identityId.startsWith('pn-')) {
          // Already in correct format
          pnIdentifier = identityId;
        } else if (identityId.startsWith('did:key:')) {
          // DID format - we can't convert this to pn identifier without additional info
          // But credentials are stored under pn identifier, so we need to get it from the token
          // For now, try to get it from the Authorization header token
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            try {
              const { PNOAuthService } = await import('./server/modules/pnOAuthService');
              const tokenPayload = PNOAuthService.validateAccessToken(token);
              if (tokenPayload?.pnIdentifier) {
                pnIdentifier = tokenPayload.pnIdentifier;
              } else {
                // Fallback: return empty accounts if we can't determine pn identifier
                console.warn(`[StorageAccounts] Cannot determine pn identifier from DID: ${identityId}`);
                return res.json({ success: true, accounts: [] });
              }
            } catch (tokenError) {
              console.warn(`[StorageAccounts] Failed to validate token:`, tokenError);
              return res.json({ success: true, accounts: [] });
            }
          } else {
            // No token provided, can't determine pn identifier
            console.warn(`[StorageAccounts] No Authorization header provided for DID: ${identityId}`);
            return res.json({ success: true, accounts: [] });
          }
        } else {
          // Assume it's a pn identifier hash (without 'pn-' prefix)
          pnIdentifier = `pn-${identityId}`;
        }

        console.log(`[StorageAccounts] Normalized identityId ${identityId} to pn identifier: ${pnIdentifier}`);
        console.log(`[StorageAccounts] Fetching credentials for: ${pnIdentifier}`);
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const record = await storageCredentialsService.getCredentials(pnIdentifier);
        console.log(`[StorageAccounts] Credentials service returned:`, record ? 'record found' : 'null');

        if (!record) {
          console.log(`[StorageAccounts] No credentials record found for identityId: ${identityId}`);
          return res.json({
            success: true,
            accounts: []
          });
        }

        const credentials = record.credentials;
        console.log(`[StorageAccounts] Found credentials record for ${pnIdentifier}`);
        console.log(`[StorageAccounts] Credentials keys:`, Object.keys(credentials || {}));
        console.log(`[StorageAccounts] Credentials structure (full):`, JSON.stringify(credentials, null, 2));
        
        const accounts: Array<{ provider: string; accountId: string; email?: string; displayName?: string }> = [];

        // Extract Google Drive accounts (support both single googleDrive and googleDriveAccounts array)
        let googleDriveAccounts = credentials?.googleDriveAccounts;
        
        // If googleDriveAccounts doesn't exist, try single googleDrive object
        if (!googleDriveAccounts) {
          if (credentials?.googleDrive) {
            googleDriveAccounts = [credentials.googleDrive];
          } else {
            googleDriveAccounts = [];
          }
        }
        
        // Ensure it's an array
        if (!Array.isArray(googleDriveAccounts)) {
          console.warn(`[StorageAccounts] googleDriveAccounts is not an array, type: ${typeof googleDriveAccounts}`);
          googleDriveAccounts = [];
        }
        
        console.log(`[StorageAccounts] Found ${googleDriveAccounts.length} Google Drive account(s)`);
        if (googleDriveAccounts.length > 0) {
          console.log(`[StorageAccounts] First account structure:`, JSON.stringify(googleDriveAccounts[0], null, 2));
        } else {
          console.warn(`[StorageAccounts] No Google Drive accounts found. Credentials structure:`, {
            hasGoogleDriveAccounts: !!credentials?.googleDriveAccounts,
            hasGoogleDrive: !!credentials?.googleDrive,
            credentialsType: typeof credentials,
            allKeys: Object.keys(credentials || {})
          });
        }

        // Process each Google Drive account
        for (let i = 0; i < googleDriveAccounts.length; i++) {
          const account = googleDriveAccounts[i];
          const accountId = account?.backendId || account?.keyPrefix || `${pnIdentifier}_${i}`;
          
          console.log(`[StorageAccounts] Processing account ${i + 1}:`, {
            accountId,
            hasBackendId: !!account?.backendId,
            hasKeyPrefix: !!account?.keyPrefix,
            hasAccessToken: !!((account as any)?.access_token || (account as any)?.accessToken),
            hasEmail: !!(account as any)?.email,
            accountKeys: Object.keys(account || {})
          });
          
          // Try to get user info from Google Drive API to get email
          try {
            // Get access token for this specific account (support both camelCase and snake_case)
            const accessToken = (account as any)?.access_token || (account as any)?.accessToken;
            
            if (accessToken) {
              // Fetch user info from Google
              const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });

              if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json() as { email?: string; name?: string };
                accounts.push({
                  provider: 'google_drive',
                  accountId: accountId,
                  email: userInfo.email,
                  displayName: userInfo.name || userInfo.email || `Google Drive ${i + 1}`
                });
              } else {
                // Fallback: use account identifier or index
                const displayName = (account as any)?.email || (account as any)?.keyPrefix || `Google Drive ${i + 1}`;
                accounts.push({
                  provider: 'google_drive',
                  accountId: accountId,
                  email: (account as any)?.email,
                  displayName: displayName
                });
              }
            } else {
              // No access token, but account exists - still include it
              const displayName = (account as any)?.email || (account as any)?.keyPrefix || `Google Drive ${i + 1}`;
              accounts.push({
                provider: 'google_drive',
                accountId: accountId,
                email: (account as any)?.email,
                displayName: displayName
              });
            }
          } catch (error: any) {
            console.error(`[StorageAccounts] Error processing account ${i + 1}:`, error);
            // If we can't fetch user info, still include the account
            const displayName = (account as any)?.email || (account as any)?.keyPrefix || `Google Drive ${i + 1}`;
            accounts.push({
              provider: 'google_drive',
              accountId: accountId,
              email: (account as any)?.email,
              displayName: displayName
            });
          }
        }
        
        console.log(`[StorageAccounts] Returning ${accounts.length} account(s) for ${identityId}`);

        // Add other cloud providers here as they're added (Cloudflare R2, etc.)

        return res.json({
          success: true,
          accounts
        });
      } catch (error: any) {
        console.error('Error listing storage accounts:', error);
        return res.status(500).json({
          error: 'Failed to list storage accounts',
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
        const { userPnIdentifier } = req.body;

        if (!fileId) {
          return res.status(400).json({ error: 'Missing fileId parameter' });
        }

        if (!['like', 'view', 'share', 'comment'].includes(type)) {
          return res.status(400).json({ error: 'Invalid engagement type. Must be: like, view, share, or comment' });
        }

        const updated = await service.updateEngagement(
          fileId,
          type as 'like' | 'view' | 'share' | 'comment',
          userPnIdentifier
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
        const { EngagementDriveService } = await import('./server/modules/engagementDriveService');
        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { extractTagsFromMetadata } = await import('./server/utils/tagExtractor');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { fileId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials and metadata folder for Google Drive operations
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // 1. Update user's Google Drive engagement.xlsx (Sheets)
        const driveResult = await EngagementDriveService.toggleLike(
          pnIdentifier,
          fileId,
          userAccessToken,
          metadataFolderId
        );

        // 2. Update database public count (event-driven)
        await EngagementService.toggleLikePublicCount(fileId, pnIdentifier, driveResult.liked);

        // Get file metadata for tag extraction, activity logging, and other operations
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadata = await aggregator.getFileMetadata(fileId);
        const fileOwnerDid = fileMetadata?.pnIdentifier;

        // 3. Extract tags and save as preferences (only when liking, not unliking)
        if (driveResult.liked && fileMetadata?.metadata) {
          try {
            const tags = extractTagsFromMetadata(fileMetadata.metadata, {
              fileId
            });

            for (const tag of tags) {
              await PreferencesService.addTagPreference(
                userAccessToken,
                metadataFolderId,
                pnIdentifier,
                tag.id,
                'like',
                'swipe_like',
                {
                  sourceFileId: fileId,
                  confidence: 0.7,
                  metadata: {
                    fileType: fileMetadata.metadata.fileType,
                    category: fileMetadata.metadata.feedCategories?.[0],
                    subject: tag.displayName
                  }
                }
              );
            }
          } catch (tagError) {
            console.warn('Failed to extract and save tags:', tagError);
            // Don't fail the like operation if tag extraction fails
          }
        }

        // Get public count for response
        const publicStats = await EngagementService.getEngagementStats(fileId);
        const result = {
          liked: driveResult.liked,
          count: publicStats.likes
        };

        // Record activity and send notification (only when liking, not unliking)
        if (result.liked && fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
          try {
            const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
            const { NotificationService } = await import('./server/modules/notificationService');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

            // Get user's credentials and metadata folder
            const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                
                // Get full token object (not just access token string) for automatic refresh
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const userAccessToken = token.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const userMetadataFolderId = _g.metadataFolderId;

                // Record activity for liker
                await ActivityLedgerService.recordActivity(
                  userAccessToken,
                  userMetadataFolderId,
                  pnIdentifier,
                  'like',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    metadata: { fileOwnerDid }
                  }
                );
              }
            }

            // Get file owner's credentials and metadata folder
            const ownerPnIdentifier = fileOwnerDid.startsWith('pn-') ? fileOwnerDid : `pn-${fileOwnerDid}`;
            const ownerCredentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
            if (ownerCredentials?.credentials) {
              const ownerGoogleDriveAccounts = ownerCredentials.credentials.googleDriveAccounts || 
                (ownerCredentials.credentials.googleDrive ? [ownerCredentials.credentials.googleDrive] : []);
              
              if (ownerGoogleDriveAccounts.length > 0) {
                const ownerAccount = ownerGoogleDriveAccounts[0];
                const ownerAccountId = this.extractAccountId(ownerAccount);
                
                // Get full token object for owner (not just access token string) for automatic refresh
                const ownerToken = {
                  access_token: ownerAccount.access_token || ownerAccount.accessToken,
                  refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
                  expires_at: ownerAccount.expires_at,
                  expires_in: ownerAccount.expires_in
                };
                const ownerAccessToken = ownerToken.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(ownerToken, ownerPnIdentifier, ownerAccountId); if (!_g) return this.driveNotInitialized(res); const ownerMetadataFolderId = _g.metadataFolderId;

                // Record activity for file owner
                await ActivityLedgerService.recordActivity(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  ownerPnIdentifier,
                  'like',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    actorPnIdentifier: userPnIdentifier,
                    metadata: { fileId }
                  }
                );

                // Send notification to file owner
                await NotificationService.notifyFileLike(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  fileId,
                  userPnIdentifier,
                  ownerCredentials.identityId
                );
              }
            }
          } catch (error) {
            console.warn('Failed to record like activity/notification:', error);
            // Don't fail the operation if activity logging fails
          }
        }

        // Update engagement counts in database metadata (for aggregator metadata sync)
        if (fileMetadata) {
          // Get current engagement stats from engagement table to sync counts
          const engagementStats = await EngagementService.getEngagementStats(fileId);
          
          // Update database metadata with current counts
          const db = (await import('./server/utils/database')).getDatabasePool();
          const currentMeta = await aggregator.getFileMetadata(fileId);
          if (currentMeta) {
            const updatedMetadata = {
              ...currentMeta.metadata,
              engagement: {
                views: currentMeta.metadata.engagement?.views || 0,
                likes: engagementStats.likes || 0,
                comments: engagementStats.comments || 0,
                shares: engagementStats.shares || 0,
                saves: engagementStats.saves || 0,
                lastUpdated: new Date().toISOString(),
                engagementHistory: currentMeta.metadata.engagement?.engagementHistory || []
              }
            };
            
            await db.query(
              `UPDATE aggregator_metadata 
               SET metadata = $1, updated_at = NOW()
               WHERE file_id = $2`,
              [JSON.stringify(updatedMetadata), fileId]
            );
          }
        }
        
        // Also update companion metadata spreadsheet if file owner has one
        try {
          if (fileMetadata) {
            const ownerDid = fileMetadata.pnIdentifier || fileMetadata.metadata.creator?.["@id"] || fileMetadata.metadata.author?.did;
            if (ownerDid) {
              // Try to get owner's access token
              const identifierCandidates = [ownerDid];
              const ownerIdentifier = fileMetadata.metadata.creator?.identifier?.value;
              if (ownerIdentifier) {
                identifierCandidates.push(ownerIdentifier);
              }
              
              // Get first Google Drive account for owner
              const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
              const credentialsRecord = await storageCredentialsService.getCredentials(ownerDid);
              const credentials = credentialsRecord?.credentials;
              const googleDriveAccounts = credentials?.googleDriveAccounts || (credentials?.googleDrive ? [credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                const accessToken = await googleDriveProxyService.getAccessToken(ownerDid, accountId, identifierCandidates);
                
                // Find metadata folder
                const folderSearchQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id)&pageSize=1`;
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    const metadataFolderId = folderData.files[0].id;
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      fileId
                    );
                    
                    if (spreadsheetId) {
                      if (result.liked) {
                        // Add like to sheet
                        await CompanionMetadataSheets.appendLike(accessToken, spreadsheetId, {
                          fileId,
                          pnIdentifier: userPnIdentifier,
                          timestamp: new Date().toISOString()
                        });
                      } else {
                        // Remove like from sheet
                        await CompanionMetadataSheets.removeLike(accessToken, spreadsheetId, fileId, userPnIdentifier);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (sheetError: any) {
          // Non-critical - log but don't fail the request
          console.warn(`[Engagement] Failed to update companion metadata sheet for like:`, sheetError?.message || sheetError);
        }

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
        const { EngagementDriveService } = await import('./server/modules/engagementDriveService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { fileId } = req.params;
        const userPnIdentifier = req.query.userPnIdentifier;

        if (!userPnIdentifier || typeof userPnIdentifier !== 'string') {
          return res.status(400).json({ error: 'userPnIdentifier query parameter is required' });
        }

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ liked: false });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ liked: false });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Read from user's Google Drive engagement.xlsx (Sheets)
        const liked = await EngagementDriveService.isLiked(fileId, userAccessToken, metadataFolderId);

        return res.json({ liked });
      } catch (error: any) {
        console.error('Error checking like:', error);
        return res.status(500).json({ error: 'Failed to check like', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/dislike - Toggle dislike
    this.app.post('/api/engagement/:fileId/dislike', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { EngagementDriveService } = await import('./server/modules/engagementDriveService');
        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { extractTagsFromMetadata } = await import('./server/utils/tagExtractor');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { fileId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials and metadata folder for Google Drive operations
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // 1. Update user's Google Drive engagement.xlsx (Sheets)
        const driveResult = await EngagementDriveService.toggleDislike(
          pnIdentifier,
          fileId,
          userAccessToken,
          metadataFolderId
        );

        // 2. Update database public count (event-driven)
        await EngagementService.toggleDislikePublicCount(fileId, pnIdentifier, driveResult.disliked);

        // Get file metadata for tag extraction
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadata = await aggregator.getFileMetadata(fileId);

        // 3. Extract tags and save as preferences (only when disliking, not removing dislike)
        if (driveResult.disliked && fileMetadata?.metadata) {
          try {
            const tags = extractTagsFromMetadata(fileMetadata.metadata, {
              fileId
            });

            for (const tag of tags) {
              await PreferencesService.addTagPreference(
                userAccessToken,
                metadataFolderId,
                pnIdentifier,
                tag.id,
                'dislike',
                'swipe_dislike',
                {
                  sourceFileId: fileId,
                  confidence: 0.7,
                  metadata: {
                    fileType: fileMetadata.metadata.fileType,
                    category: fileMetadata.metadata.feedCategories?.[0],
                    subject: tag.displayName
                  }
                }
              );
            }
          } catch (tagError) {
            console.warn('Failed to extract and save tags:', tagError);
            // Don't fail the dislike operation if tag extraction fails
          }
        }

        // Get file owner for activity logging and notifications (fileMetadata already fetched above)
        const fileOwnerDid = fileMetadata?.pnIdentifier;

        // Get public count for response
        const publicStats = await EngagementService.getEngagementStats(fileId);
        const result = {
          disliked: driveResult.disliked,
          count: publicStats.likes // Note: dislikes count not currently tracked separately in stats
        };

        // Record activity and send notification (only when disliking, not removing dislike)
        if (result.disliked && fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
          try {
            const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
            const { NotificationService } = await import('./server/modules/notificationService');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

            // Get user's credentials and metadata folder
            const pnIdentifier = userPnIdentifier;
            const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                
                // Get full token object (not just access token string) for automatic refresh
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const userAccessToken = token.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const userMetadataFolderId = _g.metadataFolderId;

                // Record activity for disliker (optional - may not want to track dislikes in activity)
                // Uncomment if you want to track dislikes in activity ledger
                // await ActivityLedgerService.recordActivity(
                //   userAccessToken,
                //   userMetadataFolderId,
                //   userCredentials.identityId,
                //   'dislike',
                //   {
                //     targetType: 'file',
                //     targetId: fileId,
                //     metadata: { fileOwnerDid }
                //   }
                // );

              }
            }
          } catch (activityError) {
            console.error('Failed to record activity or send notification:', activityError);
            // Don't fail the request if activity/notification fails
          }
        }

        return res.json(result);
      } catch (error: any) {
        console.error('Failed to toggle dislike:', error);
        return res.status(500).json({
          error: 'Failed to toggle dislike',
          message: error.message 
        });
      }
    });

    // GET /api/engagement/:fileId/dislike - Check if disliked
    this.app.get('/api/engagement/:fileId/dislike', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        const { userPnIdentifier } = req.query;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier query parameter is required' });
        }

        const disliked = await EngagementService.isDisliked(fileId, userPnIdentifier as string);

        return res.json({ disliked });
      } catch (error: any) {
        console.error('Error checking dislike:', error);
        return res.status(500).json({ error: 'Failed to check dislike', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/comment - Add comment
    // File owner has the content, pN commentor references it
    this.app.post('/api/engagement/:fileId/comment', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { EngagementDriveService } = await import('./server/modules/engagementDriveService');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { fileId } = req.params;
        const { userPnIdentifier, content, authorName, fileOwnerDid, parentCommentId, postReply } = req.body;

        if (!userPnIdentifier || !content) {
          return res.status(400).json({ error: 'userPnIdentifier and content are required' });
        }

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials and metadata folder for Google Drive operations
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Get file owner if not provided
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadataForOwner = await aggregator.getFileMetadata(fileId);
        const ownerDid = fileMetadataForOwner?.pnIdentifier || fileOwnerDid;

        // 1. Store comment in database first (gets ID from database)
        const dbComment = await EngagementService.addComment(
          fileId, 
          pnIdentifier, 
          content, 
          authorName,
          ownerDid,
          parentCommentId,
          postReply
        );

        // 2. Store comment in user's Google Drive engagement.xlsx (Sheets) (with same ID from database)
        await EngagementDriveService.addComment(
          pnIdentifier,
          fileId,
          {
            commentId: dbComment.id,
            content: dbComment.content,
            authorName: dbComment.authorName,
            timestamp: dbComment.timestamp,
            parentCommentId: dbComment.parentCommentId,
            likes: dbComment.likes || [],
            postReply: dbComment.postReply
          },
          userAccessToken,
          metadataFolderId
        );

        // Note: Public comment count is updated automatically by EngagementService.addComment
        // which inserts a record in the engagement table. COUNT(*) queries will reflect the correct count.

        // Use database comment for response
        const comment = dbComment;

        // Record activity and send notification (only for top-level comments, not replies)
        // pnIdentifier, userCredentials, userAccessToken, and metadataFolderId already defined above
        if (ownerDid && ownerDid !== pnIdentifier && !parentCommentId) {
          try {
            const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
            const { NotificationService } = await import('./server/modules/notificationService');

            // Use already-fetched userCredentials
            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                
                // Get full token object (not just access token string) for automatic refresh
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const userAccessToken = token.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const userMetadataFolderId = _g.metadataFolderId;

                // Record activity for commenter
                await ActivityLedgerService.recordActivity(
                  userAccessToken,
                  userMetadataFolderId,
                  pnIdentifier,
                  'comment',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    metadata: { commentId: comment.id, fileOwnerDid: ownerDid }
                  }
                );
              }
            }

            // Get file owner's credentials and metadata folder
            const ownerPnIdentifier = ownerDid.startsWith('pn-') ? ownerDid : `pn-${ownerDid}`;
            const ownerCredentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
            if (ownerCredentials?.credentials) {
              const ownerGoogleDriveAccounts = ownerCredentials.credentials.googleDriveAccounts || 
                (ownerCredentials.credentials.googleDrive ? [ownerCredentials.credentials.googleDrive] : []);
              
              if (ownerGoogleDriveAccounts.length > 0) {
                const ownerAccount = ownerGoogleDriveAccounts[0];
                const ownerAccountId = this.extractAccountId(ownerAccount);
                
                // Get full token object for owner (not just access token string) for automatic refresh
                const ownerToken = {
                  access_token: ownerAccount.access_token || ownerAccount.accessToken,
                  refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
                  expires_at: ownerAccount.expires_at,
                  expires_in: ownerAccount.expires_in
                };
                const ownerAccessToken = ownerToken.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(ownerToken, ownerPnIdentifier, ownerAccountId); if (!_g) return this.driveNotInitialized(res); const ownerMetadataFolderId = _g.metadataFolderId;

                // Record activity for file owner
                await ActivityLedgerService.recordActivity(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  ownerPnIdentifier,
                  'comment',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    actorPnIdentifier: userPnIdentifier,
                    metadata: { commentId: comment.id, fileId }
                  }
                );

                // Send notification to file owner
                await NotificationService.notifyFileComment(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  fileId,
                  comment.id,
                  userPnIdentifier,
                  ownerCredentials.identityId
                );
              }
            }
          } catch (error) {
            console.warn('Failed to record comment activity/notification:', error);
            // Don't fail the operation if activity logging fails
          }
        }

        // Update engagement counts in database metadata
        // Get current engagement stats from engagement table to sync counts
        const engagementStats = await EngagementService.getEngagementStats(fileId);
        
        // Update database metadata with current counts (derive from engagement table)
        const db = (await import('./server/utils/database')).getDatabasePool();
        const fileMetadata = await aggregator.getFileMetadata(fileId);
        if (fileMetadata) {
          const updatedMetadata = {
            ...fileMetadata.metadata,
            engagement: {
              views: fileMetadata.metadata.engagement?.views || 0,
              likes: engagementStats.likes || 0,
              comments: engagementStats.comments || 0,
              shares: engagementStats.shares || 0,
              saves: engagementStats.saves || 0,
              lastUpdated: new Date().toISOString(),
              engagementHistory: fileMetadata.metadata.engagement?.engagementHistory || []
            }
          };
          
          await db.query(
            `UPDATE aggregator_metadata 
             SET metadata = $1, updated_at = NOW()
             WHERE file_id = $2`,
            [JSON.stringify(updatedMetadata), fileId]
          );
        }

        // Also update companion metadata spreadsheet if file owner has one
        try {
          if (fileMetadata) {
            const ownerDid = fileMetadata.pnIdentifier || fileMetadata.metadata.creator?.["@id"] || fileMetadata.metadata.author?.did;
            if (ownerDid) {
              // Try to get owner's access token
              const identifierCandidates = [ownerDid];
              const ownerIdentifier = fileMetadata.metadata.creator?.identifier?.value;
              if (ownerIdentifier) {
                identifierCandidates.push(ownerIdentifier);
              }
              
              // Get first Google Drive account for owner
              const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
              const credentialsRecord = await storageCredentialsService.getCredentials(ownerDid);
              const credentials = credentialsRecord?.credentials;
              const googleDriveAccounts = credentials?.googleDriveAccounts || (credentials?.googleDrive ? [credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                const accessToken = await googleDriveProxyService.getAccessToken(ownerDid, accountId, identifierCandidates);
                
                // Find metadata folder
                const folderSearchQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id)&pageSize=1`;
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    const metadataFolderId = folderData.files[0].id;
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      fileId
                    );
                    
                    if (spreadsheetId) {
                      // Add comment to sheet
                      await CompanionMetadataSheets.appendComment(accessToken, spreadsheetId, {
                        fileId,
                        commentId: comment.id,
                        pnIdentifier: userPnIdentifier,
                        authorName: comment.authorName || userPnIdentifier.substring(0, 8),
                        content: comment.content,
                        timestamp: comment.timestamp
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (sheetError: any) {
          // Non-critical - log but don't fail the request
          console.warn(`[Engagement] Failed to update companion metadata sheet for comment:`, sheetError?.message || sheetError);
        }

        return res.status(201).json({
          ...comment,
          note: 'File owner owns content; commentor references it'
        });
      } catch (error: any) {
        console.error('Error adding comment:', error);
        return res.status(500).json({ error: 'Failed to add comment', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/comment/:commentId/like - Like a comment
    this.app.post('/api/engagement/:fileId/comment/:commentId/like', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId, commentId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const result = await EngagementService.likeComment(fileId, commentId, userPnIdentifier);

        return res.json({
          liked: result.liked,
          likes: result.likes,
          likeCount: result.likes.length
        });
      } catch (error: any) {
        console.error('Error liking comment:', error);
        return res.status(500).json({ error: 'Failed to like comment', message: error.message });
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

    // DELETE /api/engagement/comments - Delete all comments (cleanup)
    this.app.delete('/api/engagement/comments', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        
        const result = await EngagementService.deleteAllComments();

        return res.json({
          success: true,
          deletedCount: result.deletedCount,
          message: `Deleted ${result.deletedCount} comments`
        });
      } catch (error: any) {
        console.error('Error deleting comments:', error);
        return res.status(500).json({ error: 'Failed to delete comments', message: error.message });
      }
    });

    // GET /api/recommendations/content - Get personalized content recommendations
    this.app.get('/api/recommendations/content', async (req, res) => {
      try {
        const { RecommendationService } = await import('./server/modules/recommendationService');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        
        const userPnIdentifier = req.query.userPnIdentifier as string | undefined;
        const feedId = req.query.feedId as string | 'public' | 'curated' | 'me';
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const recencyWeight = req.query.recencyWeight ? parseFloat(req.query.recencyWeight as string) : 0.3;
        const engagementWeight = req.query.engagementWeight ? parseFloat(req.query.engagementWeight as string) : 0.7;
        
        // Get base content
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        let baseFiles: { files: any[]; total: number; hasMore: boolean };
        
        if (feedId === 'public' || !feedId) {
          baseFiles = await aggregator.getPublicMetadata({ limit: limit * 2, offset: 0 });
        } else if (feedId === 'curated') {
          // For curated, we'd need to apply user preferences first
          baseFiles = await aggregator.getPublicMetadata({ limit: limit * 2, offset: 0 });
        } else {
          // Specific feed
          const { FeedService } = await import('./server/modules/feedService');
          const fileIds = await FeedService.getFeedPosts(feedId);
          const files: any[] = [];
          for (const fileId of fileIds.slice(0, limit * 2)) {
            const metadata = await aggregator.getFileMetadata(fileId);
            if (metadata) {
              files.push({
                fileId: metadata.fileId,
                metadata: metadata.metadata,
                submittedAt: metadata.submittedAt,
                pnIdentifier: metadata.pnIdentifier
              });
            }
          }
          baseFiles = { files, total: files.length, hasMore: false };
        }
        
        // Apply recommendation algorithm
        const result = await RecommendationService.getRecommendedContent(
          baseFiles.files,
          {
            userPnIdentifier,
            feedId,
            limit,
            offset,
            recencyWeight,
            engagementWeight
          }
        );
        
        res.json({
          files: result.files,
          scores: Array.from(result.scores.entries()).map(([fileId, score]) => ({
            fileId,
            score: score.score,
            reasons: score.reasons
          })),
          total: baseFiles.total,
          hasMore: baseFiles.hasMore
        });
      } catch (error: any) {
        console.error('Error getting recommendations:', error);
        res.status(500).json({ error: 'Failed to get recommendations', message: error.message });
      }
    });

    // GET /api/engagement/user/:userPnIdentifier - Get all likes and comments for a user
    this.app.get('/api/engagement/user/:userPnIdentifier', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { userPnIdentifier } = req.params;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Use userPnIdentifier directly (already normalized)
        // Engagement table stores pn identifier
        const withPrefix = userPnIdentifier;
        const withoutPrefix = userPnIdentifier.startsWith('pn-') ? userPnIdentifier.substring(3) : userPnIdentifier;
        
        // Get all files the user has liked (check both formats for legacy data)
        const likedResult = await db.query(`
          SELECT DISTINCT file_id 
          FROM engagement 
          WHERE (user_did = $1 OR user_did = $2) AND type = 'like'
        `, [withPrefix, withoutPrefix]);
        
        // Get all files the user has commented on (check both formats for legacy data)
        const commentedResult = await db.query(`
          SELECT DISTINCT file_id 
          FROM engagement 
          WHERE (user_did = $1 OR user_did = $2) AND type = 'comment'
        `, [withPrefix, withoutPrefix]);

        const likedFileIds = likedResult.rows.map(row => row.file_id);
        const commentedFileIds = commentedResult.rows.map(row => row.file_id);

        console.log(`📊 User engagement query: userPnIdentifier=${userPnIdentifier}, found ${likedFileIds.length} likes, ${commentedFileIds.length} comments`);

        return res.json({
          likedFileIds,
          commentedFileIds,
          likedCount: likedFileIds.length,
          commentedCount: commentedFileIds.length
        });
      } catch (error: any) {
        console.error('Error getting user engagement:', error);
        return res.status(500).json({ error: 'Failed to get user engagement', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/share - Record share
    this.app.post('/api/engagement/:fileId/share', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { fileId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const count = await EngagementService.recordShare(fileId, userPnIdentifier);

        // Get file owner for activity logging and notifications
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadataForOwner = await aggregator.getFileMetadata(fileId);
        const fileOwnerDid = fileMetadataForOwner?.pnIdentifier;

        // Record activity and send notification
        if (fileOwnerDid && fileOwnerDid !== userPnIdentifier) {
          try {
            const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
            const { NotificationService } = await import('./server/modules/notificationService');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

            // Get user's credentials and metadata folder
            const pnIdentifier = userPnIdentifier;
            const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                
                // Get full token object (not just access token string) for automatic refresh
                const token = {
                  access_token: account.access_token || account.accessToken,
                  refresh_token: account.refresh_token || account.refreshToken,
                  expires_at: account.expires_at,
                  expires_in: account.expires_in
                };
                const userAccessToken = token.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const userMetadataFolderId = _g.metadataFolderId;

                // Record activity for sharer
                await ActivityLedgerService.recordActivity(
                  userAccessToken,
                  userMetadataFolderId,
                  pnIdentifier,
                  'share',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    metadata: { fileOwnerDid }
                  }
                );
              }
            }

            // Get file owner's credentials and metadata folder
            const ownerPnIdentifier = fileOwnerDid.startsWith('pn-') ? fileOwnerDid : `pn-${fileOwnerDid}`;
            const ownerCredentials = await storageCredentialsService.getCredentials(ownerPnIdentifier);
            if (ownerCredentials?.credentials) {
              const ownerGoogleDriveAccounts = ownerCredentials.credentials.googleDriveAccounts || 
                (ownerCredentials.credentials.googleDrive ? [ownerCredentials.credentials.googleDrive] : []);
              
              if (ownerGoogleDriveAccounts.length > 0) {
                const ownerAccount = ownerGoogleDriveAccounts[0];
                const ownerAccountId = this.extractAccountId(ownerAccount);
                
                // Get full token object for owner (not just access token string) for automatic refresh
                const ownerToken = {
                  access_token: ownerAccount.access_token || ownerAccount.accessToken,
                  refresh_token: ownerAccount.refresh_token || ownerAccount.refreshToken,
                  expires_at: ownerAccount.expires_at,
                  expires_in: ownerAccount.expires_in
                };
                const ownerAccessToken = ownerToken.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(ownerToken, ownerPnIdentifier, ownerAccountId); if (!_g) return this.driveNotInitialized(res); const ownerMetadataFolderId = _g.metadataFolderId;

                // Record activity for file owner
                await ActivityLedgerService.recordActivity(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  ownerPnIdentifier,
                  'share',
                  {
                    targetType: 'file',
                    targetPnIdentifier: fileId, // For files, this is the file ID, not a pn-identifier
                    actorPnIdentifier: userPnIdentifier,
                    metadata: { fileId }
                  }
                );

                // Send notification (shares are reposts in this context)
                await NotificationService.notifyRepost(
                  ownerAccessToken,
                  ownerMetadataFolderId,
                  fileId,
                  userPnIdentifier,
                  ownerCredentials.identityId
                );
              }
            }
          } catch (error) {
            console.warn('Failed to record share activity/notification:', error);
            // Don't fail the operation if activity logging fails
          }
        }

        // Update engagement counts in database metadata
        // Get current engagement stats from engagement table to sync counts
        const engagementStats = await EngagementService.getEngagementStats(fileId);
        
        // Update database metadata with current counts (derive from engagement table)
        const db = (await import('./server/utils/database')).getDatabasePool();
        const fileMetadata = await aggregator.getFileMetadata(fileId);
        if (fileMetadata) {
          const updatedMetadata = {
            ...fileMetadata.metadata,
            engagement: {
              views: fileMetadata.metadata.engagement?.views || 0,
              likes: engagementStats.likes || 0,
              comments: engagementStats.comments || 0,
              shares: engagementStats.shares || 0,
              saves: engagementStats.saves || 0,
              lastUpdated: new Date().toISOString(),
              engagementHistory: fileMetadata.metadata.engagement?.engagementHistory || []
            }
          };
          
          await db.query(
            `UPDATE aggregator_metadata 
             SET metadata = $1, updated_at = NOW()
             WHERE file_id = $2`,
            [JSON.stringify(updatedMetadata), fileId]
          );
        }

        // Also update companion metadata spreadsheet if file owner has one
        try {
          if (fileMetadata) {
            const ownerDid = fileMetadata.pnIdentifier || fileMetadata.metadata.creator?.["@id"] || fileMetadata.metadata.author?.did;
            if (ownerDid) {
              // Try to get owner's access token
              const identifierCandidates = [ownerDid];
              const ownerIdentifier = fileMetadata.metadata.creator?.identifier?.value;
              if (ownerIdentifier) {
                identifierCandidates.push(ownerIdentifier);
              }
              
              // Get first Google Drive account for owner
              const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
              const credentialsRecord = await storageCredentialsService.getCredentials(ownerDid);
              const credentials = credentialsRecord?.credentials;
              const googleDriveAccounts = credentials?.googleDriveAccounts || (credentials?.googleDrive ? [credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                const accessToken = await googleDriveProxyService.getAccessToken(ownerDid, accountId, identifierCandidates);
                
                // Find metadata folder
                const folderSearchQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id)&pageSize=1`;
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    const metadataFolderId = folderData.files[0].id;
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      fileId
                    );
                    
                    if (spreadsheetId) {
                      // Add share to sheet
                      await CompanionMetadataSheets.appendShare(accessToken, spreadsheetId, {
                        fileId,
                        pnIdentifier: userPnIdentifier,
                        timestamp: new Date().toISOString()
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (sheetError: any) {
          // Non-critical - log but don't fail the request
          console.warn(`[Engagement] Failed to update companion metadata sheet for share:`, sheetError?.message || sheetError);
        }

        return res.json({
          success: true,
          count
        });
      } catch (error: any) {
        console.error('Error recording share:', error);
        return res.status(500).json({ error: 'Failed to record share', message: error.message });
      }
    });

    // POST /api/engagement/:fileId/save - Toggle save
    this.app.post('/api/engagement/:fileId/save', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { fileId } = req.params;
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const result = await EngagementService.toggleSave(fileId, userPnIdentifier);

        // Update engagement counts in database metadata
        const aggregator = AggregatorMetadataServiceDB.getInstance();
        const fileMetadata = await aggregator.getFileMetadata(fileId);
        
        if (fileMetadata) {
          // Update engagement counts in database metadata
          // Get current engagement stats from engagement table to sync counts
          const engagementStats = await EngagementService.getEngagementStats(fileId);
          
          // Update database metadata with current counts (not increment/decrement)
          const db = (await import('./server/utils/database')).getDatabasePool();
          const currentMeta = await aggregator.getFileMetadata(fileId);
          if (currentMeta) {
          const updatedMetadata = {
            ...currentMeta.metadata,
            engagement: {
              views: currentMeta.metadata.engagement?.views || 0,
              likes: engagementStats.likes || 0,
              comments: engagementStats.comments || 0,
              shares: engagementStats.shares || 0,
              saves: engagementStats.saves || 0,
              lastUpdated: new Date().toISOString(),
              engagementHistory: currentMeta.metadata.engagement?.engagementHistory || []
            }
          };
          
          await db.query(
            `UPDATE aggregator_metadata 
             SET metadata = $1, updated_at = NOW()
             WHERE file_id = $2`,
            [JSON.stringify(updatedMetadata), fileId]
          );
        }
        
        // Also update companion metadata spreadsheet if file owner has one
        try {
          const ownerDid = fileMetadata.pnIdentifier || fileMetadata.metadata.creator?.["@id"] || fileMetadata.metadata.author?.did;
          if (ownerDid) {
            // Try to get owner's access token
            const identifierCandidates = [ownerDid];
            const ownerIdentifier = fileMetadata.metadata.creator?.identifier?.value;
            if (ownerIdentifier) {
              identifierCandidates.push(ownerIdentifier);
            }
            
            // Get first Google Drive account for owner
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
            const credentialsRecord = await storageCredentialsService.getCredentials(ownerDid);
            const credentials = credentialsRecord?.credentials;
              const googleDriveAccounts = credentials?.googleDriveAccounts || (credentials?.googleDrive ? [credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
                const accessToken = await googleDriveProxyService.getAccessToken(ownerDid, accountId, identifierCandidates);
                
                // Find metadata folder
                const folderSearchQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id)&pageSize=1`;
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    const metadataFolderId = folderData.files[0].id;
                    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
                      accessToken,
                      metadataFolderId,
                      fileId
                    );
                    
                    if (spreadsheetId) {
                      if (result.saved) {
                        // Add save to sheet
                        await CompanionMetadataSheets.appendSave(accessToken, spreadsheetId, {
                          fileId,
                          pnIdentifier: userPnIdentifier,
                          timestamp: new Date().toISOString()
                        });
                      } else {
                        // Remove save from sheet
                        await CompanionMetadataSheets.removeSave(accessToken, spreadsheetId, fileId, userPnIdentifier);
                      }
                    }
                  }
                }
              }
            }
          } catch (sheetError: any) {
            // Non-critical - log but don't fail the request
            console.warn(`[Engagement] Failed to update companion metadata sheet for save:`, sheetError?.message || sheetError);
          }
        }

        return res.json({
          success: true,
          saved: result.saved,
          count: result.count
        });
      } catch (error: any) {
        console.error('Error toggling save:', error);
        return res.status(500).json({ error: 'Failed to toggle save', message: error.message });
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
        const { fileIds, userPnIdentifier } = req.body;

        if (!fileIds || !Array.isArray(fileIds)) {
          return res.status(400).json({ error: 'fileIds array is required' });
        }

        const statsMap = await EngagementService.getBulkEngagementStats(fileIds);

        // Convert Map to object for JSON response
        const stats: Record<string, any> = {};
        statsMap.forEach((value, key) => {
          stats[key] = value;
        });

        // Also check which files the user has liked if userPnIdentifier is provided
        const likedFiles: string[] = [];
        if (userPnIdentifier && fileIds.length > 0) {
          const likedSet = await EngagementService.getBulkLikedFiles(fileIds, userPnIdentifier);
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

    // GET /api/engagement/:fileId/metrics - Get detailed engagement metrics (verified/unverified breakdown)
    this.app.get('/api/engagement/:fileId/metrics', async (req, res) => {
      try {
        const { EngagementService } = await import('./server/modules/engagementService');
        const { fileId } = req.params;
        
        const metrics = await EngagementService.getEngagementMetrics(fileId);
        return res.json(metrics);
      } catch (error: any) {
        console.error('Error getting engagement metrics:', error);
        return res.status(500).json({ error: 'Failed to get engagement metrics', message: error.message });
      }
    });

    // GET /api/engagement/:fileId/monetization - Get monetization metrics (verified-only)
    this.app.get('/api/engagement/:fileId/monetization', async (req, res) => {
      try {
        const { RecommendationService } = await import('./server/modules/recommendationService');
        const { fileId } = req.params;
        
        const metrics = await RecommendationService.getMonetizationMetrics(fileId);
        return res.json(metrics);
      } catch (error: any) {
        console.error('Error getting monetization metrics:', error);
        return res.status(500).json({ error: 'Failed to get monetization metrics', message: error.message });
      }
    });

    // POST /api/file-views - Track viewing behavior for bot detection
    this.app.post('/api/file-views', async (req, res) => {
      try {
        const { fileId, userPnIdentifier, viewDuration } = req.body;
        
        if (!fileId || !userPnIdentifier) {
          return res.status(400).json({ error: 'fileId and userPnIdentifier are required' });
        }
        
        const db = (await import('./server/utils/database')).getDatabasePool();
        
        // Try to insert first (optimistic path - most common case)
        try {
          await db.query(`
            INSERT INTO file_views (file_id, user_did, view_duration, viewed_at)
            VALUES ($1, $2, $3::DECIMAL, NOW())
          `, [fileId, userPnIdentifier, viewDuration || 0]);
        } catch (insertError: any) {
          // If unique constraint violation (23505), update instead
          // This handles race conditions where two requests try to insert simultaneously
          if (insertError.code === '23505') {
            await db.query(`
              UPDATE file_views 
              SET view_duration = GREATEST(view_duration, $3::DECIMAL),
                  viewed_at = NOW()
              WHERE file_id = $1 
              AND user_did = $2 
              AND DATE(viewed_at) = DATE(NOW())
            `, [fileId, userPnIdentifier, viewDuration || 0]);
          } else {
            throw insertError; // Re-throw if it's a different error
          }
        }
        
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error recording file view (non-fatal):', error);
        // Return 200 so clients do not see 500 - viewing is best-effort; table may be missing or DB error
        return res.status(200).json({ success: false });
      }
    });

    // POST /api/verification/sync - Sync verification status to engagement system
    this.app.post('/api/verification/sync', async (req, res) => {
      try {
        const { VerificationIntegrationService } = await import('./server/modules/verificationIntegrationService');
        const { identityId, verificationId, verifiedAt } = req.body;
        
        if (!identityId || !verificationId || !verifiedAt) {
          return res.status(400).json({ error: 'identityId, verificationId, and verifiedAt are required' });
        }
        
        await VerificationIntegrationService.syncVerificationStatus(identityId, verificationId, verifiedAt);
        
        return res.json({ success: true, message: 'Verification status synced' });
      } catch (error: any) {
        console.error('Error syncing verification status:', error);
        return res.status(500).json({ error: 'Failed to sync verification status', message: error.message });
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
        const { 
          feedName, 
          feedCategory, 
          feedDescription, 
          creatorDid, 
          creatorTier, 
          branding,
          isPaid,
          monthlyPrice,
          annualPrice,
          subdomain
        } = req.body;

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
          // feedRatingRange removed - feeds accept all content
          branding
        });

        // Update feed with paid subscription info if provided
        if (isPaid !== undefined || monthlyPrice !== undefined || annualPrice !== undefined || subdomain) {
          const db = (await import('./server/utils/database')).getDatabasePool();
          const updates: string[] = [];
          const params: any[] = [];
          let paramCount = 0;

          if (isPaid !== undefined) {
            paramCount++;
            updates.push(`is_paid = $${paramCount}`);
            params.push(isPaid);
          }
          if (monthlyPrice !== undefined) {
            paramCount++;
            updates.push(`monthly_price = $${paramCount}`);
            params.push(monthlyPrice);
          }
          if (annualPrice !== undefined) {
            paramCount++;
            updates.push(`annual_price = $${paramCount}`);
            params.push(annualPrice);
          }
          if (subdomain !== undefined) {
            paramCount++;
            updates.push(`subdomain = $${paramCount}`);
            params.push(subdomain || null);
          }

          if (updates.length > 0) {
            paramCount++;
            updates.push(`updated_at = NOW()`);
            paramCount++;
            params.push(feed.feedId);
            
            await db.query(`
              UPDATE feeds 
              SET ${updates.join(', ')}
              WHERE feed_id = $${paramCount}
            `, params);

            // Reload feed to get updated data
            const updatedFeed = await FeedService.getFeedById(feed.feedId);
            if (updatedFeed) {
              return res.status(201).json({
                ...updatedFeed,
                isPaid: isPaid !== undefined ? isPaid : updatedFeed.isPaid,
                monthlyPrice: monthlyPrice !== undefined ? monthlyPrice : updatedFeed.monthlyPrice,
                annualPrice: annualPrice !== undefined ? annualPrice : updatedFeed.annualPrice,
                subdomain: subdomain !== undefined ? subdomain : updatedFeed.subdomain
              });
            }
          }
        }

        return res.status(201).json(feed);
      } catch (error: any) {
        console.error('Error creating feed:', error);
        return res.status(500).json({ error: 'Failed to create feed', message: error.message });
      }
    });

    // ============================================================================
    // Saved Feed APIs (Private curated feed for each user)
    // MUST come before /api/feeds/:feedId to avoid route conflict
    // ============================================================================

    // GET /api/feeds/saved?userPnIdentifier=... - Get user's saved posts (index query, not a feed)
    this.app.get('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        const db = (await import('./server/utils/database')).getDatabasePool();

        if (!userPnIdentifier || typeof userPnIdentifier !== 'string') {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Saved posts use feed_id format: "saved-{userPnIdentifier}"
        const savedFeedId = `saved-${userPnIdentifier}`;

        // Query saved posts directly - no need to create a feed entry
        const postsResult = await db.query(`
          SELECT file_id, added_at
          FROM feed_posts
          WHERE feed_id = $1
          ORDER BY added_at DESC
        `, [savedFeedId]);

        const fileIds = postsResult.rows.map(row => row.file_id);
        const latestAddedAt = postsResult.rows.length > 0 ? postsResult.rows[0].added_at : null;

        return res.json({
          feed: {
            feedId: savedFeedId,
            feedName: 'Saved',
            fileIds,
            createdAt: latestAddedAt || new Date().toISOString(),
            updatedAt: latestAddedAt || new Date().toISOString()
          }
        });
      } catch (error: any) {
        console.error('Error getting saved feed:', error);
        return res.status(500).json({ error: 'Failed to get saved feed', message: error.message });
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
        const { feedName, feedDescription, feedCategory, branding, creatorDid } = req.body;

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

    // GET/POST/DELETE /api/feeds/:feedId/posts are handled by feedRoutes (registered first)

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
        const { userPnIdentifier, creatorGoogleTokens } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // Note: creatorGoogleTokens is optional - if creator doesn't have Drive connected,
        // subscription is stored in database only and can sync to Drive later

        const success = await FeedService.subscribeToFeed(feedId, userPnIdentifier, creatorGoogleTokens);

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
        const { userPnIdentifier } = req.body;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const success = await FeedService.unsubscribeFromFeed(feedId, userPnIdentifier);

        if (!success) {
          return res.status(500).json({ error: 'Failed to unsubscribe from feed' });
        }

        return res.json({ success: true, message: 'Unsubscribed from feed' });
      } catch (error: any) {
        console.error('Error unsubscribing from feed:', error);
        return res.status(500).json({ error: 'Failed to unsubscribe from feed', message: error.message });
      }
    });

    // GET /api/users/:userPnIdentifier/subscriptions - Get user's subscriptions
    this.app.get('/api/users/:userPnIdentifier/subscriptions', async (req, res) => {
      try {
        const { FeedService } = await import('./server/modules/feedService');
        const { userPnIdentifier } = req.params;

        const feeds = await FeedService.getUserSubscriptions(userPnIdentifier);

        return res.json({
          userPnIdentifier,
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


    // POST /api/feeds/saved - Add file to saved feed
    this.app.post('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        const db = (await import('./server/utils/database')).getDatabasePool();

        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        const savedFeedId = `saved-${userPnIdentifier}`;

        // Check if saved feed exists, create if not
        let feedResult = await db.query(`
          SELECT feed_id, feed_name, created_at, updated_at
          FROM feeds
          WHERE feed_id = $1
        `, [savedFeedId]);

        if (feedResult.rows.length === 0) {
          // Create saved feed - rating_range must be JSON string for PostgreSQL JSON column
          await db.query(`
            INSERT INTO feeds (feed_id, feed_name, creator_did, creator_tier, rating_range)
            VALUES ($1, $2, $3, $4, $5::jsonb)
          `, [savedFeedId, 'Saved', userPnIdentifier, 'free', JSON.stringify(['GA', 'FF', 'T13+', 'YA16+', 'M18+', 'NSFW', 'X18+'])]);

          feedResult = await db.query(`
            SELECT feed_id, feed_name, created_at, updated_at
            FROM feeds
            WHERE feed_id = $1
          `, [savedFeedId]);
        }

        // Check if file is already in saved feed
        const existingPost = await db.query(`
          SELECT file_id
          FROM feed_posts
          WHERE feed_id = $1 AND file_id = $2
        `, [savedFeedId, fileId]);

        if (existingPost.rows.length > 0) {
          // File already saved, return existing feed
          const postsResult = await db.query(`
            SELECT file_id
            FROM feed_posts
            WHERE feed_id = $1
            ORDER BY added_at DESC
          `, [savedFeedId]);

          const fileIds = postsResult.rows.map(row => row.file_id);

          return res.json({
            feed: {
              feedId: feedResult.rows[0].feed_id,
              feedName: feedResult.rows[0].feed_name,
              fileIds,
              createdAt: feedResult.rows[0].created_at,
              updatedAt: feedResult.rows[0].updated_at
            }
          });
        }

        // Add file to saved feed
        await db.query(`
          INSERT INTO feed_posts (feed_id, file_id, added_by)
          VALUES ($1, $2, $3)
        `, [savedFeedId, fileId, userPnIdentifier]);

        // Update feed updated_at
        await db.query(`
          UPDATE feeds
          SET updated_at = NOW()
          WHERE feed_id = $1
        `, [savedFeedId]);

        // Get all file IDs
        const postsResult = await db.query(`
          SELECT file_id
          FROM feed_posts
          WHERE feed_id = $1
          ORDER BY added_at DESC
        `, [savedFeedId]);

        const fileIds = postsResult.rows.map(row => row.file_id);

        return res.json({
          feed: {
            feedId: feedResult.rows[0].feed_id,
            feedName: feedResult.rows[0].feed_name,
            fileIds,
            createdAt: feedResult.rows[0].created_at,
            updatedAt: new Date().toISOString()
          }
        });
      } catch (error: any) {
        console.error('Error saving to feed:', error);
        return res.status(500).json({ error: 'Failed to save to feed', message: error.message });
      }
    });

    // DELETE /api/feeds/saved - Remove file from saved feed
    this.app.delete('/api/feeds/saved', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        const db = (await import('./server/utils/database')).getDatabasePool();

        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        const savedFeedId = `saved-${userPnIdentifier}`;

        // Remove file from saved feed
        const result = await db.query(`
          DELETE FROM feed_posts
          WHERE feed_id = $1 AND file_id = $2
        `, [savedFeedId, fileId]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'File not found in saved feed' });
        }

        // Update feed updated_at
        await db.query(`
          UPDATE feeds
          SET updated_at = NOW()
          WHERE feed_id = $1
        `, [savedFeedId]);

        return res.json({ success: true, message: 'File removed from saved feed' });
      } catch (error: any) {
        console.error('Error removing from saved feed:', error);
        return res.status(500).json({ error: 'Failed to remove from saved feed', message: error.message });
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
        const { userPnIdentifier, limit = 10 } = req.query;

        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const feeds = await FeedService.getRecommendedFeeds({
          userPnIdentifier: userPnIdentifier as string,
          limit: limit ? parseInt(limit as string, 10) : 10
        });

        return res.json({
          feeds,
          count: feeds.length,
          userPnIdentifier
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

    // POST /api/aggregator/metadata-index/sync - DISABLED (Google Drive sync service removed)
    // Files are added/updated/removed via API calls only - no background sync needed
    this.app.post('/api/aggregator/metadata-index/sync', async (req, res) => {
      return res.status(410).json({
        error: 'Gone',
        message: 'Google Drive sync service has been removed. Files are managed via API calls only.',
        note: 'Use PUT /api/aggregator/metadata-index/:fileId to add/update files, or make files private to remove them.'
      });
    });

    // POST /api/aggregator/metadata-index/cleanup - Cleanup disabled (was removing all posts from feeds)
    this.app.post('/api/aggregator/metadata-index/cleanup', async (req, res) => {
      return res.status(410).json({ 
        error: 'Cleanup disabled',
        message: 'Cleanup logic has been disabled as it was removing all posts from feeds. Manual cleanup is no longer available.' 
      });
    });

    // POST /api/aggregator/metadata-index/sync-visibility - Sync isPublic from companion metadata files
    this.app.post('/api/aggregator/metadata-index/sync-visibility', async (req, res) => {
      try {
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
        const service = AggregatorMetadataServiceDB.getInstance();
        const db = (await import('./server/utils/database')).getDatabasePool();

        // Get auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Missing or invalid Authorization header' });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        if (!tokenPayload) {
          return res.status(401).json({ error: 'Invalid or expired access token' });
        }

        const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
        const identifierCandidates: string[] = [];
        if (tokenPayload.pnIdentifier) identifierCandidates.push(tokenPayload.pnIdentifier);
        if (tokenPayload.did) {
          identifierCandidates.push(tokenPayload.did);
          if (tokenPayload.did.startsWith('did:key:')) {
            const keyPart = tokenPayload.did.substring(8);
            if (keyPart) identifierCandidates.push(keyPart);
          }
        }

        // Get all files from database
        const allFiles = await db.query(`
          SELECT file_id, metadata->>'backendFileId' as backend_file_id, metadata->>'name' as name
          FROM aggregator_metadata
          WHERE metadata->>'backend' = 'google_drive'
        `);

        let updated = 0;
        let errors = 0;

        for (const row of allFiles.rows) {
          try {
            const fileId = row.file_id;
            const backendFileId = row.backend_file_id || fileId;

            // Get access token
            const accountId = req.query.accountId as string | undefined;
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);

            // Find companion metadata file
            const driveResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=name='${backendFileId}.metadata' and mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name)`,
              { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            if (!driveResponse.ok) continue;
            const driveData = await driveResponse.json() as { files?: Array<{ id: string }> };
            if (!driveData.files || driveData.files.length === 0) continue;

            const spreadsheetId = driveData.files[0].id;

            // Read companion metadata
            const companionMetadata = await CompanionMetadataSheets.readMetadata(accessToken, spreadsheetId);
            if (!companionMetadata) continue;

            // Update isPublic based on visibility
            const shouldBePublic = companionMetadata.visibility === 'public';
            const current = await service.getFileMetadata(fileId);
            if (current && current.metadata.isPublic !== shouldBePublic) {
              await service.updateMetadata(fileId, { isPublic: shouldBePublic });
              updated++;
              console.log(`✅ Updated ${fileId}: isPublic = ${shouldBePublic} (from visibility: ${companionMetadata.visibility})`);
            }
          } catch (error: any) {
            console.error(`❌ Failed to sync visibility for ${row.file_id}:`, error.message);
            errors++;
          }
        }

        return res.json({
          success: true,
          totalFiles: allFiles.rows.length,
          updated,
          errors,
          message: `Synced visibility for ${updated} file(s)`
        });
      } catch (error: any) {
        console.error('❌ Sync visibility error:', error);
        return res.status(500).json({ error: 'Failed to sync visibility', message: error.message });
      }
    });

    // POST /api/aggregator/metadata-index/refresh - DISABLED (Google Drive sync service removed)
    // Files are added/updated/removed via API calls only - no background sync needed
    this.app.post('/api/aggregator/metadata-index/refresh', async (req, res) => {
      return res.status(410).json({
        error: 'Gone',
        message: 'Google Drive sync service has been removed. Files are managed via API calls only.',
        note: 'Use PUT /api/aggregator/metadata-index/:fileId to add/update files, or make files private to remove them.'
      });
    });

    // POST /api/auth/google-oauth/token - Exchange authorization code for tokens
    // Use more lenient rate limiter for OAuth token exchange (users may connect multiple accounts)
    this.app.post('/api/auth/google-oauth/token', oauthTokenLimiter, async (req, res) => {
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

        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
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
        if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
          console.error('⚠️ GOOGLE_DRIVE_CLIENT_ID not configured or empty');
          return res.status(500).json({
            error: 'OAuth configuration error',
            message: 'Google OAuth client ID not configured on server. Please set GOOGLE_DRIVE_CLIENT_ID in Railway.',
          });
        }

        const tokenRequestBody = new URLSearchParams({
          code: String(code),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: String(redirectUri),
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
          process.env.GOOGLE_DRIVE_CLIENT_ID;
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
        if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
          console.error('⚠️ GOOGLE_DRIVE_CLIENT_ID not configured or empty for refresh flow');
          return res.status(500).json({
            error: 'OAuth configuration error',
            message: 'Google OAuth client ID not configured on server. Please set GOOGLE_DRIVE_CLIENT_ID in Railway.',
          });
        }

        const refreshRequestBody = new URLSearchParams({
          refresh_token: String(refreshToken),
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

    // Google Drive API Proxy Endpoints
    // These endpoints require pN OAuth authentication and proxy Google Drive operations
    this.app.get('/api/drive/files', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        // Dashboard's getStorageIdentityCandidates() returns only the pn identifier
        const pnIdentifier = tokenPayload.pnIdentifier; // Use pN identifier for folder search
        
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        
        // After validation, pnIdentifier is guaranteed to be defined
        const userIdentifier: string = pnIdentifier; // Use ONLY pn identifier for credential lookup
        
        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        // This prevents multiple API calls with different identifiers
        const identifierCandidates: string[] = [pnIdentifier];
        
        console.log(`[DriveFiles] Using pn identifier only: ${pnIdentifier}`);
        
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        const query = req.query.q as string | undefined;
        const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;
        const accountId = req.query.accountId as string | undefined;
        
        // If no query provided and we have a pN identifier, try to find files in the pN folder
        let finalQuery = query;
        if (!finalQuery && pnIdentifier && accountId) {
          // Try to find the pN folder first, then query files in it
          // Folder name format: "par Noir - pn-{hash}" where pnIdentifier already includes "pn-" prefix
          // pnIdentifier is already in format "pn-{hash}", so use it directly
          const pnFolderName = `par Noir - ${pnIdentifier}`;
          try {
            // Search for the folder - use a direct Google Drive API call to avoid credential lookup issues
            // Wrap in try-catch to handle credential errors gracefully
            let accessToken: string | null = null;
            try {
              accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId);
            } catch (tokenError: any) {
              console.warn(`[DriveFiles] Could not get access token for folder search:`, tokenError?.message || tokenError);
              // Continue without folder filter - will list all files and client will filter
            }
            
            if (accessToken) {
              // Search for the folder using Google Drive API directly
              const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
              
              console.log(`[DriveFiles] Searching for pN folder: "${pnFolderName}"`);
              console.log(`[DriveFiles] Folder search query: ${folderSearchQuery}`);
              
              const folderResponse = await fetch(folderSearchUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              
              console.log(`[DriveFiles] Folder search response status: ${folderResponse.status}`);
              
              if (folderResponse.ok) {
                const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                const folderFiles = folderData.files || [];
                
                console.log(`[DriveFiles] Folder search found ${folderFiles.length} folder(s)`);
                
                if (folderFiles.length > 0) {
                  const folderId = folderFiles[0].id;
                  // Query files in this folder
                  finalQuery = `'${folderId}' in parents and trashed=false`;
                  console.log(`[DriveFiles] ✅ Found pN folder "${pnFolderName}" (ID: ${folderId}), querying files in folder`);
                } else {
                  // Fallback: try without "pn-" prefix (using pN identifier, not DID)
                  const altFolderName = `par Noir - ${pnIdentifier}`;
                  const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                  
                  console.log(`[DriveFiles] Trying fallback folder name: "${altFolderName}"`);
                  
                  const altFolderResponse = await fetch(altFolderSearchUrl, {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`
                    }
                  });
                  
                  if (altFolderResponse.ok) {
                    const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    const altFolderFiles = altFolderData.files || [];
                    
                    console.log(`[DriveFiles] Fallback folder search found ${altFolderFiles.length} folder(s)`);
                    
                    if (altFolderFiles.length > 0) {
                      const folderId = altFolderFiles[0].id;
                      finalQuery = `'${folderId}' in parents and trashed=false`;
                      console.log(`[DriveFiles] ✅ Found pN folder "${altFolderName}" (ID: ${folderId}), querying files in folder`);
                    } else {
                      console.warn(`[DriveFiles] ⚠️ pN folder not found (searched for "${pnFolderName}" and "${altFolderName}"), listing all files (will be filtered client-side)`);
                    }
                  } else {
                    console.warn(`[DriveFiles] Fallback folder search failed with status ${altFolderResponse.status}`);
                  }
                }
              } else {
                const errorText = await folderResponse.text().catch(() => 'Unknown error');
                console.warn(`[DriveFiles] Folder search failed with status ${folderResponse.status}: ${errorText}`);
              }
            } else {
              console.warn(`[DriveFiles] ⚠️ No access token available for folder search, listing all files (will be filtered client-side)`);
            }
          } catch (folderError: any) {
            console.warn(`[DriveFiles] Error searching for pN folder:`, folderError?.message || folderError);
            // Continue without folder filter - client will filter
          }
        }
        
        // Pass additional identifier candidates to getAccessToken via listFiles
        // listFiles will call getAccessToken with the additional candidates
        console.log(`[DriveFiles] Final query for listFiles: ${finalQuery || '(none - will list all files)'}`);
        const files = await googleDriveProxyService.listFiles(userIdentifier, finalQuery, pageSize, accountId, identifierCandidates);
        
        console.log(`[DriveFiles] Returning ${files.length} file(s) to client`);
        return res.json({ files });
      } catch (error: any) {
        console.error('Error listing Google Drive files:', error);
        return res.status(500).json({
          error: 'Failed to list files',
          error_description: error.message || 'Failed to list Google Drive files'
        });
      }
    });

    this.app.post('/api/drive/files', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        const userIdentifier = pnIdentifier;
        console.log(`[Upload] Using pn identifier only: ${pnIdentifier}`);
        
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        // Expect multipart/form-data with 'file' and optional 'fileName', 'mimeType', 'parents', 'accountId'
        // For now, accept JSON with base64 file data (simpler for initial implementation)
        const { fileData, fileName, mimeType, parents, accountId } = req.body;
        
        if (!fileData || !fileName) {
          return res.status(400).json({
            error: 'Missing required fields',
            error_description: 'fileData and fileName are required'
          });
        }

        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        const identifierCandidates: string[] = [pnIdentifier];

        // If no parents specified, find the pN folder and upload there
        let finalParents = parents;
        if (!finalParents || finalParents.length === 0) {
          if (pnIdentifier && accountId) {
            try {
              let accessToken: string | null = null;
              try {
                accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, identifierCandidates);
              } catch (tokenError: any) {
                console.warn(`[Upload] Could not get access token for folder search:`, tokenError?.message || tokenError);
              }
              
              if (accessToken) {
                // Search for the pN folder
                const pnFolderName = `par Noir - pn-${pnIdentifier}`;
                const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                
                console.log(`[Upload] Searching for pN folder: "${pnFolderName}"`);
                
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  const folderFiles = folderData.files || [];
                  
                  if (folderFiles.length > 0) {
                    finalParents = [folderFiles[0].id];
                    console.log(`[Upload] ✅ Found pN folder "${pnFolderName}" (ID: ${folderFiles[0].id}), uploading file there`);
                  } else {
                    // Fallback: try without "pn-" prefix
                    const altFolderName = `par Noir - ${pnIdentifier}`;
                    const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                    
                    const altFolderResponse = await fetch(altFolderSearchUrl, {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`
                      }
                    });
                    
                    if (altFolderResponse.ok) {
                      const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      const altFolderFiles = altFolderData.files || [];
                      
                      if (altFolderFiles.length > 0) {
                        finalParents = [altFolderFiles[0].id];
                        console.log(`[Upload] ✅ Found pN folder "${altFolderName}" (ID: ${altFolderFiles[0].id}), uploading file there`);
                      }
                    }
                  }
                }
              }
            } catch (folderError: any) {
              console.warn(`[Upload] Error searching for pN folder:`, folderError?.message || folderError);
              // Continue without folder - file will be uploaded to root
            }
          }
        }

        // Convert base64 to Buffer
        const fileBuffer = Buffer.from(fileData, 'base64');
        const file = await googleDriveProxyService.uploadFile(
          userIdentifier, // Use pN identifier instead of DID
          fileBuffer,
          fileName,
          mimeType || 'application/octet-stream',
          finalParents,
          accountId, // Pass accountId to select specific Google Drive account
          identifierCandidates // Pass identifier candidates for token lookup
        );
        
        // Note: Companion metadata files are NOT created on upload
        // They are only created when a file becomes public for the first time
        // (handled in PUT /api/aggregator/metadata-index/:fileId endpoint)
        
        return res.json({ file });
      } catch (error: any) {
        console.error('Error uploading file to Google Drive:', error);
        return res.status(500).json({
          error: 'Failed to upload file',
          error_description: error.message || 'Failed to upload file to Google Drive'
        });
      }
    });

    // Create folder endpoint
    this.app.post('/api/drive/folders', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        const userIdentifier = pnIdentifier;
        
        const identifierCandidates: string[] = [pnIdentifier];
        
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        const { folderName, parentFolderName, parentFolderId, accountId } = req.body;
        
        if (!folderName) {
          return res.status(400).json({
            error: 'Missing required fields',
            error_description: 'folderName is required'
          });
        }

        // Get access token for Google Drive operations
        const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
        if (!accessToken) {
          return res.status(401).json({
            error: 'Failed to get Google Drive access token',
            error_description: 'Could not retrieve Google Drive credentials'
          });
        }

        let finalParentFolderId: string | null = null;

        // If parentFolderId is provided, use it directly (preferred)
        if (parentFolderId) {
          finalParentFolderId = parentFolderId;
          console.log(`[CreateFolder] Using provided parent folder ID: ${parentFolderId}`);
        }
        // Otherwise, if parentFolderName is provided, find it (but don't create - use auto-find instead)
        else if (parentFolderName) {
          // SECURITY: Reject parentFolderName with DID - this should never happen
          if (parentFolderName.includes('did:key:')) {
            console.error(`[CreateFolder] Rejected parentFolderName with DID: ${parentFolderName}`);
            // Don't return error - just ignore parentFolderName and use auto-find instead
            console.log(`[CreateFolder] Ignoring parentFolderName with DID, using auto-find instead`);
          } else {
            console.log(`[CreateFolder] Searching for parent folder: ${parentFolderName}`);
            const parentFolderSearchQuery = `name='${parentFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const parentFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(parentFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
            
            console.log(`[CreateFolder] Parent folder search query: ${parentFolderSearchQuery}`);
            
            const parentFolderResponse = await fetch(parentFolderSearchUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (parentFolderResponse.ok) {
              const parentFolderData = await parentFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
              const parentFolderFiles = parentFolderData.files || [];
              console.log(`[CreateFolder] Found ${parentFolderFiles.length} parent folder(s):`, parentFolderFiles);
              if (parentFolderFiles.length > 0) {
                finalParentFolderId = parentFolderFiles[0].id;
                console.log(`[CreateFolder] Using parent folder ID: ${finalParentFolderId}`);
              }
            } else {
              const errorText = await parentFolderResponse.text().catch(() => 'Unknown error');
              console.error(`[CreateFolder] Failed to search for parent folder: ${parentFolderResponse.status} - ${errorText}`);
            }

            // If parent folder not found, try alternative name format
            if (!finalParentFolderId && parentFolderName.includes('pn-')) {
              const altParentFolderName = parentFolderName.replace('pn-', '');
              const altParentFolderSearchQuery = `name='${altParentFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const altParentFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altParentFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
              
              const altParentFolderResponse = await fetch(altParentFolderSearchUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              
              if (altParentFolderResponse.ok) {
                const altParentFolderData = await altParentFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                const altParentFolderFiles = altParentFolderData.files || [];
                if (altParentFolderFiles.length > 0) {
                  finalParentFolderId = altParentFolderFiles[0].id;
                }
              }
            }
            
            // NOTE: We no longer create parent folders here - if not found, auto-find will handle it below
            // This prevents creating folders with wrong names (like DID folders)
          }
        }
        
        // If no parent specified, automatically find the pN folder (same logic as file uploads)
        if (!finalParentFolderId && pnIdentifier && accountId) {
          try {
            console.log(`[CreateFolder] No parent specified, searching for pN folder automatically...`);
            const pnFolderName = `par Noir - pn-${pnIdentifier}`;
            const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
            
            console.log(`[CreateFolder] Searching for pN folder: "${pnFolderName}"`);
            
            const folderResponse = await fetch(folderSearchUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (folderResponse.ok) {
              const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
              const folderFiles = folderData.files || [];
              
              if (folderFiles.length > 0) {
                finalParentFolderId = folderFiles[0].id;
                console.log(`[CreateFolder] ✅ Found pN folder "${pnFolderName}" (ID: ${finalParentFolderId}), creating folder there`);
              } else {
                // Fallback: try without "pn-" prefix
                const altFolderName = `par Noir - ${pnIdentifier}`;
                const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                
                const altFolderResponse = await fetch(altFolderSearchUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (altFolderResponse.ok) {
                  const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  const altFolderFiles = altFolderData.files || [];
                  
                  if (altFolderFiles.length > 0) {
                    finalParentFolderId = altFolderFiles[0].id;
                    console.log(`[CreateFolder] ✅ Found pN folder "${altFolderName}" (ID: ${finalParentFolderId}), creating folder there`);
                  }
                }
              }
            }
          } catch (folderError: any) {
            console.warn(`[CreateFolder] Error searching for pN folder:`, folderError?.message || folderError);
            // Continue without folder - folder will be created in root
          }
        }

        // Create the requested folder
        const createFolderBody: any = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        };
        
        if (finalParentFolderId) {
          createFolderBody.parents = [finalParentFolderId];
          console.log(`[CreateFolder] Creating folder "${folderName}" inside parent folder ID: ${finalParentFolderId}`);
        } else {
          console.warn(`[CreateFolder] No parent folder ID, creating folder "${folderName}" in root`);
        }

        const createFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createFolderBody)
        });

        if (!createFolderResponse.ok) {
          const errorText = await createFolderResponse.text().catch(() => 'Unknown error');
          console.error(`[CreateFolder] Failed to create folder: ${createFolderResponse.status} - ${errorText}`);
          return res.status(500).json({
            error: 'Failed to create folder',
            error_description: errorText
          });
        }

        const createdFolder = await createFolderResponse.json() as { id: string; name: string; parents?: string[] };
        console.log(`[CreateFolder] Created folder: ${folderName} (ID: ${createdFolder.id}, parents: ${createdFolder.parents?.join(', ') || 'none'})`);
        
        return res.json({ folder: createdFolder });
      } catch (error: any) {
        console.error('Error creating folder:', error);
        return res.status(500).json({
          error: 'Failed to create folder',
          error_description: error.message || 'Failed to create folder in Google Drive'
        });
      }
    });

    this.app.get('/api/drive/files/:fileId', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        // After validation, pnIdentifier is guaranteed to be defined
        const userIdentifier: string = pnIdentifier;
        
        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        const identifierCandidates: string[] = [pnIdentifier];
        
        const { fileId } = req.params;
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        // Check if requesting thumbnail, download, or metadata
        const thumbnail = req.query.thumbnail === 'true';
        const download = req.query.download === 'true';
        const accountId = req.query.accountId as string | undefined;
        
        if (thumbnail) {
          try {
            // Proxy thumbnail request through API server with authentication
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId, identifierCandidates);
            const thumbnailUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/thumbnail?alt=media`;
            
            console.log(`[DriveFiles] Fetching thumbnail for file ${fileId} with accountId ${accountId}`);
            
            const thumbnailResponse = await fetch(thumbnailUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            console.log(`[DriveFiles] Thumbnail response status: ${thumbnailResponse.status}`);
            
            if (thumbnailResponse.ok) {
              const thumbnailBlob = await thumbnailResponse.blob();
              const arrayBuffer = await thumbnailBlob.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              
              res.setHeader('Content-Type', thumbnailBlob.type || 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache thumbnails for 1 hour
              return res.send(buffer);
            } else if (thumbnailResponse.status === 404) {
              // Google Drive can't generate thumbnails for encrypted files
              // Fall back to downloading the full file - client will decrypt and generate thumbnail
              console.log(`[DriveFiles] Thumbnail not available (likely encrypted file), downloading full file for client-side thumbnail generation`);
              
              try {
                const fileBlob = await googleDriveProxyService.downloadFile(userIdentifier, fileId, accountId, identifierCandidates);
                const arrayBuffer = await fileBlob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Return the encrypted file - client will decrypt and use it as thumbnail
                // For PNG files, the client can use the image directly (maybe resized)
                res.setHeader('Content-Type', fileBlob.type || 'application/octet-stream');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.send(buffer);
              } catch (downloadError: any) {
                console.error(`[DriveFiles] Failed to download file for thumbnail fallback:`, downloadError);
                return res.status(500).json({
                  error: 'Failed to fetch thumbnail',
                  error_description: 'Thumbnail not available and file download failed'
                });
              }
            } else {
              const errorText = await thumbnailResponse.text().catch(() => 'Unknown error');
              console.error(`[DriveFiles] Thumbnail fetch failed: ${thumbnailResponse.status} - ${errorText}`);
              return res.status(thumbnailResponse.status).json({
                error: 'Failed to fetch thumbnail',
                error_description: `Google Drive API returned ${thumbnailResponse.status}: ${errorText}`
              });
            }
          } catch (error: any) {
            console.error('[DriveFiles] Error fetching thumbnail:', error);
            return res.status(500).json({
              error: 'Failed to fetch thumbnail',
              error_description: error.message || 'Failed to fetch thumbnail from Google Drive'
            });
          }
        } else if (download) {
          const blob = await googleDriveProxyService.downloadFile(userIdentifier, fileId, accountId);
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          res.setHeader('Content-Type', blob.type || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${fileId}"`);
          return res.send(buffer);
        } else {
          const metadata = await googleDriveProxyService.getFileMetadata(userIdentifier, fileId, accountId);
          return res.json({ file: metadata });
        }
      } catch (error: any) {
        console.error('Error accessing Google Drive file:', error);
        return res.status(500).json({
          error: 'Failed to access file',
          error_description: error.message || 'Failed to access Google Drive file'
        });
      }
    });

    // DELETE /api/drive/files/:fileId - Delete file from Google Drive
    this.app.delete('/api/drive/files/:fileId', async (req, res) => {
      const { fileId } = req.params;
      const accountId = req.query.accountId as string | undefined;
      
      let dbRemoved = false;
      
      try {
        // STEP 0: Validate token FIRST (but don't delete yet)
        const authHeader = req.headers.authorization;
        let tokenPayload = null;
        let userIdentifier: string | null = null;
        let pnIdentifier: string | null = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const { PNOAuthService } = await import('./server/modules/pnOAuthService');
          tokenPayload = PNOAuthService.validateAccessToken(token);
        if (tokenPayload) {
          userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
          pnIdentifier = tokenPayload.pnIdentifier || null;
        }
        }
        
        // STEP 1: Read companion metadata to get mainFileId connection
        // Deletions from frontend are ALWAYS thumbnails - main files never appear in frontend
        let mainFileId: string | null = null;
        
        if (pnIdentifier && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const companionMetadata = await googleDriveProxyService.readCompanionMetadata(
              userIdentifier,
              pnIdentifier,
              fileId,
              accountId
            );
            
            if (companionMetadata?.mainFileId) {
              mainFileId = companionMetadata.mainFileId;
              console.log(`✅ [DeleteFile] Found mainFileId ${mainFileId} for thumbnail ${fileId} from companion metadata`);
            } else {
              console.log(`ℹ️ [DeleteFile] No mainFileId found in companion metadata for ${fileId} (may not be a thumbnail or metadata not found)`);
            }
          } catch (metadataError: any) {
            console.warn(`⚠️ [DeleteFile] Could not read companion metadata (may already be deleted):`, metadataError?.message || metadataError);
          }
        }
        
        // STEP 2: Delete main file (if found)
        if (mainFileId && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            await googleDriveProxyService.deleteFile(userIdentifier, mainFileId, accountId);
            console.log(`✅ [DeleteFile] Deleted main file ${mainFileId} from Google Drive`);
          } catch (driveError: any) {
            const errorMsg = driveError?.message || String(driveError);
            // 404 is okay - file might already be deleted
            if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
              console.error(`❌ [DeleteFile] Failed to delete main file ${mainFileId} from Google Drive:`, errorMsg);
            } else {
              console.log(`ℹ️ [DeleteFile] Main file ${mainFileId} not found in Google Drive (may already be deleted)`);
            }
          }
        }
        
        // STEP 3: Delete companion metadata files (JSON and spreadsheet for the thumbnail fileId)
        if (pnIdentifier && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const metadataResult = await googleDriveProxyService.deleteCompanionMetadataFiles(
              userIdentifier,
              pnIdentifier,
              [fileId], // Delete metadata for the thumbnail fileId being deleted
              accountId
            );
            
            if (metadataResult.deletedJson > 0 || metadataResult.deletedSpreadsheets > 0) {
              console.log(`✅ [DeleteFile] Deleted companion metadata: ${metadataResult.deletedJson} JSON file(s), ${metadataResult.deletedSpreadsheets} spreadsheet(s)`);
            }
            
            if (metadataResult.errors.length > 0) {
              console.warn(`⚠️ [DeleteFile] Some metadata deletion errors (non-critical):`, metadataResult.errors);
            }
          } catch (metadataDeleteError: any) {
            // Non-critical - continue even if metadata deletion fails
            console.warn(`⚠️ [DeleteFile] Failed to delete companion metadata (non-critical):`, metadataDeleteError?.message || metadataDeleteError);
          }
        }
        
        // STEP 4: Delete thumbnail (the fileId being deleted)
        if (userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            await googleDriveProxyService.deleteFile(userIdentifier, fileId, accountId);
            console.log(`✅ [DeleteFile] Deleted thumbnail ${fileId} from Google Drive`);
          } catch (driveError: any) {
            const errorMsg = driveError?.message || String(driveError);
            // 404 is okay - file might already be deleted
            if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
              console.error(`❌ [DeleteFile] Failed to delete thumbnail ${fileId} from Google Drive:`, errorMsg);
            } else {
              console.log(`ℹ️ [DeleteFile] Thumbnail ${fileId} not found in Google Drive (may already be deleted)`);
            }
          }
        }
        
        // STEP 5: Remove from database metadata (thumbnail and main file if found)
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const metadataService = AggregatorMetadataServiceDB.getInstance();
        const filesToRemoveFromDb = [fileId];
        if (mainFileId) {
          filesToRemoveFromDb.push(mainFileId);
        }
        
        for (const dbFileId of filesToRemoveFromDb) {
          try {
            const removed = await metadataService.removeMetadata(dbFileId);
            if (removed) {
              console.log(`✅ [DeleteFile] Removed ${dbFileId} from database metadata`);
            }
          } catch (dbError: any) {
            console.error(`❌ [DeleteFile] Failed to remove ${dbFileId} from database:`, dbError);
          }
        }
        
        // Files to delete for index cleanup (used in STEP 6)
        const filesToDelete = [fileId];
        if (mainFileId) {
          filesToDelete.push(mainFileId);
        }
        
        // STEP 6: Remove from Google Drive indexes
        if (pnIdentifier && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const accessToken = await googleDriveProxyService.getAccessToken(userIdentifier, accountId);
            
            // Get pN folder and metadata folder
            const pnFolderName = `par Noir - ${pnIdentifier}`;
            const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
            
            const folderResponse = await fetch(folderSearchUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (folderResponse.ok) {
              const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
              if (folderData.files && folderData.files.length > 0) {
                const pnFolderId = folderData.files[0].id;
                
                // Get metadata folder
                const metadataFolderName = '_metadata';
                const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                
                const metadataFolderResponse = await fetch(metadataSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (metadataFolderResponse.ok) {
                  const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                    const metadataFolderId = metadataFolderData.files[0].id;
                    
                    // Remove files from indexes
                    for (const indexFileId of filesToDelete) {
                      try {
                        await this.removeFromOwnerIndex(accessToken, pnIdentifier, metadataFolderId, indexFileId);
                        console.log(`✅ [DeleteFile] Removed ${indexFileId} from owner index`);
                      } catch (ownerIndexError: any) {
                        console.warn(`⚠️ [DeleteFile] Failed to remove ${indexFileId} from owner index:`, ownerIndexError);
                      }
                      
                      try {
                        await this.removeFromPublicIndex(accessToken, pnIdentifier, metadataFolderId, indexFileId);
                        console.log(`✅ [DeleteFile] Removed ${indexFileId} from public index`);
                      } catch (publicIndexError: any) {
                        console.warn(`⚠️ [DeleteFile] Failed to remove ${indexFileId} from public index:`, publicIndexError);
                      }
                    }
                  }
                }
              }
            }
          } catch (indexCleanupError: any) {
            console.error(`❌ [DeleteFile] Index cleanup failed:`, indexCleanupError);
          }
        }
        
        return res.json({ 
          success: true, 
          fileId,
          mainFileId: mainFileId || undefined,
          removedFromDatabase: dbRemoved 
        });
      } catch (error: any) {
        // Even if Google Drive operations fail, database removal succeeded
        console.error('Error in delete operation:', error);
        return res.json({ 
          success: true, 
          fileId,
          removedFromDatabase: dbRemoved,
          warning: 'Database cleaned but Google Drive operations may have failed',
          error: error.message
        });
      }
    });

    // PUT /api/drive/files/:fileId - Update file metadata in Google Drive
    this.app.put('/api/drive/files/:fileId', async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Missing or invalid Authorization header'
          });
        }

        const token = authHeader.substring(7);
        const { PNOAuthService } = await import('./server/modules/pnOAuthService');
        const tokenPayload = PNOAuthService.validateAccessToken(token);
        
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
        const { fileId } = req.params;
        const { name, description, parents, accountId } = req.body;
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        const updates: { name?: string; description?: string; parents?: string[] } = {};
        if (name) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (parents) updates.parents = parents;
        
        const updatedFile = await googleDriveProxyService.updateFileMetadata(userIdentifier, fileId, updates, accountId);
        
        return res.json({ file: updatedFile });
      } catch (error: any) {
        console.error('Error updating Google Drive file:', error);
        return res.status(500).json({
          error: 'Failed to update file',
          error_description: error.message || 'Failed to update Google Drive file'
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
    const randomBytes = crypto.randomBytes(16);
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
    return `challenge_${timestamp}_${random}`;
  }

  private generateToken(): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(32);
    const random = Array.from(randomBytes).map(b => b.toString(36)).join('');
    return `token_${timestamp}_${random}`;
  }

  private generateDID(username: string, publicKey: string): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16);
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
    this.app.get('/oauth/authorize', async (req, res) => {
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

      // Validate client and redirect URI
      const { ClientRegistrationService } = await import('./server/modules/clientRegistration');
      if (!ClientRegistrationService.validateClient(client_id as string, redirect_uri as string)) {
        return res.status(400).json({
          error: 'invalid_client',
          error_description: 'Invalid client_id or redirect_uri'
        });
      }

      // Validate scopes
      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];
      if (!ClientRegistrationService.validateScopes(client_id as string, scopes)) {
        return res.status(400).json({
          error: 'invalid_scope',
          error_description: 'One or more requested scopes are not allowed for this client'
        });
      }

      // Return authorization page URL
      return res.json({
        authorization_url: `/oauth/authorize/consent?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&scope=${encodeURIComponent(scope as string || 'openid profile')}&state=${state || ''}&nonce=${nonce || ''}`,
        client_id,
        redirect_uri,
        scope: scopes,
        state: state || undefined,
        nonce: nonce || undefined
      });
    });

    // GET /oauth/authorize/consent - OAuth consent page
    // Routes to appropriate consent page based on client_id
    // browser-app uses browse.parnoir.com's oauth-authorize.html
    // Third parties use API-hosted generic consent page
    this.app.get('/oauth/authorize/consent', async (req, res) => {
      const { client_id, redirect_uri, scope, state, nonce } = req.query;

      // Validate required parameters
      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters: client_id, redirect_uri'
        });
      }

      // Hard-code browser-app (pN owned third party) - skip client registration validation
      const isBrowserApp = client_id === 'browser-app';
      
      // Validate client (skip for browser-app)
      if (!isBrowserApp) {
      const { ClientRegistrationService } = await import('./server/modules/clientRegistration');
      if (!ClientRegistrationService.validateClient(client_id as string, redirect_uri as string)) {
        return res.status(400).json({
          error: 'invalid_client',
          error_description: 'Invalid client_id or redirect_uri'
        });
        }
      }

      // Route based on client_id
      if (client_id === 'browser-app') {
        // Browser app: redirect to browse.parnoir.com's oauth-authorize.html
        const redirectUrl = new URL(redirect_uri as string);
        const browserAppOrigin = `${redirectUrl.protocol}//${redirectUrl.host}`;
        
        const consentUrl = new URL(`${browserAppOrigin}/oauth-authorize.html`);
        consentUrl.searchParams.set('client_id', client_id as string);
        consentUrl.searchParams.set('redirect_uri', redirect_uri as string);
        if (scope) consentUrl.searchParams.set('scope', scope as string);
        if (state) consentUrl.searchParams.set('state', state as string);
        if (nonce) consentUrl.searchParams.set('nonce', nonce as string);
        
        // Preserve popup parameter if present
        const popupParam = req.query.popup || (redirect_uri as string).includes('popup=true') ? 'true' : undefined;
        if (popupParam) {
          consentUrl.searchParams.set('popup', 'true');
        }

        return res.redirect(consentUrl.toString());
      } else {
        // Third-party clients: use API-hosted generic consent page
        const consentUrl = new URL(`${req.protocol}://${req.get('host')}/oauth/consent`);
        consentUrl.searchParams.set('client_id', client_id as string);
        consentUrl.searchParams.set('redirect_uri', redirect_uri as string);
        if (scope) consentUrl.searchParams.set('scope', scope as string);
        if (state) consentUrl.searchParams.set('state', state as string);
        if (nonce) consentUrl.searchParams.set('nonce', nonce as string);
        
        // Preserve popup parameter if present
        const popupParam = req.query.popup || (redirect_uri as string).includes('popup=true') ? 'true' : undefined;
        if (popupParam) {
          consentUrl.searchParams.set('popup', 'true');
        }

        return res.redirect(consentUrl.toString());
      }
    });

    // POST /oauth/authorize/authenticate - Authenticate user with pN identity
    // Client sends encrypted identity file and passcode
    // Server verifies and generates authorization code
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
          public_key // Public key from identity
        } = req.body;

        if (!client_id || !redirect_uri || !encrypted_identity || !passcode || !public_key) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required fields: client_id, redirect_uri, encrypted_identity, passcode, public_key'
          });
        }

        // In production, decrypt and verify identity here
        // For now, we'll accept a DID directly or verify the identity
        // Extract DID from encrypted identity or use public_key to derive it
        // This is a simplified version - in production, decrypt the identity file
        
        // DID should come from decrypted identity (client-side decryption)
        // If not provided, we can't proceed - need the actual DID from the identity
        const did = req.body.did;
        
        if (!did) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'DID is required. Identity file must be decrypted client-side to extract DID.'
          });
        }

        console.log('[OAuth Auth] Received authentication request:');
        console.log('  Full DID:', did);
        console.log('  Full PublicKey:', public_key);
        console.log('  PublicKey length:', public_key.length);

        // SECURITY FIX: Client now sends pn_identifier directly (derived client-side)
        // Fallback to derivation for backward compatibility if not provided
        let pnIdentifier: string | undefined = req.body.pn_identifier;
        const pnName = req.body.pnName || req.body.pn_name; // Only used for fallback derivation
        
        // Fallback: Derive pN identifier server-side if client didn't provide it (backward compatibility)
        if (!pnIdentifier && pnName && passcode && public_key) {
          try {
            // STANDARDIZED: Derive pN identifier using VolumeIdGenerator formula
            // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
            const crypto = await import('crypto');
            const combined = `${pnName}:${passcode}:${public_key}`;
            const utf8Bytes = Buffer.from(combined, 'utf8');
            const hash = crypto.createHash('sha256').update(utf8Bytes).digest('hex');
            const shortHash = hash.substring(0, 12);
            pnIdentifier = `pn-${shortHash}`;
            console.log('[OAuth Auth] Derived pN identifier server-side (fallback):', pnIdentifier);
          } catch (error) {
            console.error('[OAuth Auth] Failed to derive pN identifier:', error);
          }
        } else if (pnIdentifier) {
          console.log('[OAuth Auth] Using pN identifier from client:', pnIdentifier);
        }

        // Generate authorization code immediately (before async checks)
        // SECURITY FIX: Store pnIdentifier directly instead of secrets
        const scopes = scope ? scope.split(' ') : ['openid', 'profile'];
        const code = PNOAuthService.generateAuthorizationCode({
          clientId: client_id,
          redirectUri: redirect_uri,
          scope: scopes,
          state,
          nonce,
          did,
          publicKey: public_key, // Still needed for file decryption
          pnIdentifier: pnIdentifier // Store pN identifier directly (derived client-side)
          // pnName and passcode are NOT stored - they're secrets
        });

        // Check third-party-permissions so we can skip consent when user already granted browser-app
        let existingPermissions: { ageShared: boolean } | null = null;
        if (pnIdentifier && client_id === 'browser-app') {
          try {
            const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
            const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

            const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
            const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);

            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts ||
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);

              if (googleDriveAccounts.length > 0) {
          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

                // Find pN folder and _metadata folder
                const pnFolderName = `par Noir - ${pnIdentifier}`;
                const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;

                const pnFolderResponse = await fetch(pnFolderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${userAccessToken}` }
                });

                if (pnFolderResponse.ok) {
                  const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  if (pnFolderData.files && pnFolderData.files.length > 0) {
                    const pnFolderId = pnFolderData.files[0].id;

                    // Find _metadata folder (where third-party-permissions.xlsx lives)
                    const metadataFolderName = '_metadata';
                    const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;

                    const metadataFolderResponse = await fetch(metadataSearchUrl, {
                      headers: { 'Authorization': `Bearer ${userAccessToken}` }
                    });

                    if (metadataFolderResponse.ok) {
                      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
                      if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                        const metadataFolderId = metadataFolderData.files[0].id;

                        const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
                        const permissions = await ThirdPartyPermissionsService.getPermissions(
                          userAccessToken,
                          metadataFolderId
                        );

                        const browserApp = permissions['browser-app'];
                        if (browserApp && browserApp.status === 'active') {
                          existingPermissions = {
                            ageShared: browserApp.dataPoints.includes('age_attestation')
                          };
                          console.log('[OAuth Auth] Found existing permissions in third-party-permissions, skipping consent:', existingPermissions);
                        } else if (browserApp) {
                          existingPermissions = { ageShared: false };
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (permError) {
            console.log('[OAuth Auth] Could not check third-party-permissions (Drive not connected or sheet missing):', permError);
          }

          // Fire-and-forget: check if user has age_attestation ZKP (for logging only)
          (async () => {
            try {
              const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

              // Get user's credentials to check for age ZKP
              const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
              const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
              const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
              
              const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
              
              if (userCredentials?.credentials) {
                const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                  (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
                
                if (googleDriveAccounts.length > 0) {
          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);
                  
                  // Find pN folder and _metadata folder
                  const pnFolderName = `par Noir - ${pnIdentifier}`;
                  const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const pnFolderResponse = await fetch(pnFolderSearchUrl, {
                    headers: { 'Authorization': `Bearer ${userAccessToken}` }
                  });
                  
                  if (pnFolderResponse.ok) {
                    const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (pnFolderData.files && pnFolderData.files.length > 0) {
                      const pnFolderId = pnFolderData.files[0].id;
                      
                      // Find _metadata folder
                      const metadataFolderName = '_metadata';
                      const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                      const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
                      
                      const metadataFolderResponse = await fetch(metadataSearchUrl, {
                        headers: { 'Authorization': `Bearer ${userAccessToken}` }
                      });
                      
                      if (metadataFolderResponse.ok) {
                        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
                        if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                          const metadataFolderId = metadataFolderData.files[0].id;
                          
                          // Check if user has age_attestation ZKP
                          const availableDataPoints = await ZKPDataPointsService.getAvailableDataPoints(
                            userAccessToken,
                            metadataFolderId
                          );
                          
                          const hasAgeZKP = availableDataPoints.some(dp => dp.dataPointId === 'age_attestation');
                          console.log(`[OAuth Auth] User ${pnIdentifier} has age ZKP (async): ${hasAgeZKP}`);
                        }
                      }
                    }
                  }
                }
              }
            } catch (ageCheckError: any) {
              // Log but don't fail - age check is optional
              console.log('[OAuth Auth] Could not check for age ZKP (async):', ageCheckError?.message || ageCheckError);
            }
          })().catch(err => console.error('[OAuth Auth] Age ZKP check failed (async):', err));
        }

        return res.json({
          code,
          state: state || undefined,
          existingPermissions,
          availableOptionalDataPoints: undefined
        });
      } catch (error: any) {
        console.error('OAuth authentication error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Authentication failed'
        });
      }
    });

    // POST /oauth/token - Token endpoint
    // Exchange authorization code for access token
    // Use lenient rate limiter for OAuth token exchange (users may unlock multiple times during setup)
    this.app.post('/oauth/token', oauthTokenLimiter, async (req, res) => {
      try {
        const { code, client_id, redirect_uri, grant_type, age_shared } = req.body;

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

        const tokenResponse = await PNOAuthService.exchangeCodeForToken({
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

        // Store age sharing preference in third-party permissions (for browser-app only)
        if (client_id === 'browser-app' && age_shared !== undefined) {
          try {
            // Decode token to get pN identifier
            const tokenPayload = PNOAuthService.validateAccessToken(tokenResponse.access_token);
            if (tokenPayload?.pnIdentifier) {
              const pnIdentifier = tokenPayload.pnIdentifier;
              
              // Get Google Drive access token
              const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
              const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
              
              const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
              const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
              
              if (userCredentials?.credentials) {
                const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                  (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
                
                if (googleDriveAccounts.length > 0) {
          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);
                  
                  // Find pN folder and _metadata folder
                  const pnFolderName = `par Noir - ${pnIdentifier}`;
                  const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                  
                  const pnFolderResponse = await fetch(pnFolderSearchUrl, {
                    headers: { 'Authorization': `Bearer ${userAccessToken}` }
                  });
                  
                  if (pnFolderResponse.ok) {
                    const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    if (pnFolderData.files && pnFolderData.files.length > 0) {
                      const pnFolderId = pnFolderData.files[0].id;
                      
                      // Find _metadata folder
                      const metadataFolderName = '_metadata';
                      const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                      const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
                      
                      const metadataFolderResponse = await fetch(metadataSearchUrl, {
                        headers: { 'Authorization': `Bearer ${userAccessToken}` }
                      });
                      
                      if (metadataFolderResponse.ok) {
                        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
                        if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                          const metadataFolderId = metadataFolderData.files[0].id;
                          
                          // Get existing permissions
                          const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
                          const permissions = await ThirdPartyPermissionsService.getPermissions(
                            userAccessToken,
                            metadataFolderId
                          );
                          
                          // Update browser-app permissions (merge with existing if present)
                          const shareAge = age_shared === true || age_shared === 'true';
                          const existingBrowserApp = permissions['browser-app'];
                          
                          // Merge data points - add age_attestation if sharing, remove if not
                          // dataPoints array reflects what user has granted (can change)
                          let dataPoints = existingBrowserApp?.dataPoints || [];
                          if (shareAge && !dataPoints.includes('age_attestation')) {
                            dataPoints = [...dataPoints, 'age_attestation'];
                          } else if (!shareAge) {
                            dataPoints = dataPoints.filter(dp => dp !== 'age_attestation');
                          }
                          
                          // Check if user has age ZKP before including it in optionalDataPoints
                          // We need to check again here because we might not have checked during /oauth/auth
                          let userHasAgeZKP = false;
                          let optionalDataPointsForUser: string[] = [];
                          
                          try {
                            const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
                            const availableDataPoints = await ZKPDataPointsService.getAvailableDataPoints(
                              userAccessToken,
                              metadataFolderId
                            );
                            userHasAgeZKP = availableDataPoints.some(dp => dp.dataPointId === 'age_attestation');
                            
                            // Only include age_attestation in optionalDataPoints if user actually has it
                            if (userHasAgeZKP) {
                              optionalDataPointsForUser = ['age_attestation'];
                            }
                            
                            console.log(`[OAuth Token] User has age ZKP: ${userHasAgeZKP}, optionalDataPoints:`, optionalDataPointsForUser);
                          } catch (ageCheckError: any) {
                            console.log('[OAuth Token] Could not check for age ZKP:', ageCheckError?.message || ageCheckError);
                            // If check fails, default to empty (don't show age permission)
                            optionalDataPointsForUser = [];
                          }
                          
                          // Static: requiredDataPoints is always empty
                          // optionalDataPoints is dynamic based on what user actually has
                          permissions['browser-app'] = {
                            toolId: 'browser-app',
                            toolName: 'par Noir Browser',
                            toolDescription: 'Official par Noir browser application for browsing and discovering encrypted content',
                            permissions: existingBrowserApp?.permissions || ['openid', 'profile', 'cloud:read'],
                            dataPoints: dataPoints, // User's granted permissions (can change)
                            requiredDataPoints: [], // Static: No required data points for browser
                            optionalDataPoints: optionalDataPointsForUser, // Dynamic: Only include age if user has age ZKP
                            grantedAt: existingBrowserApp?.grantedAt || new Date().toISOString(),
                            status: 'active' as const
                          };
                          
                          console.log(`[OAuth] Updated browser-app permissions:`, {
                            ageShared: shareAge,
                            dataPoints: dataPoints,
                            hadExisting: !!existingBrowserApp
                          });
                          
                          // Store updated permissions
                          await ThirdPartyPermissionsService.storePermissions(
                            userAccessToken,
                            metadataFolderId,
                            pnIdentifier,
                            permissions
                          );
                          
                          console.log(`[OAuth] Stored age sharing preference for browser-app: ${shareAge}`);
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (permError) {
            // Log but don't fail token exchange if permission storage fails
            console.error('[OAuth] Failed to store age sharing preference:', permError);
          }
        }

        return res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token exchange error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Token exchange failed'
        });
      }
    });

    // POST /oauth/refresh - Refresh token endpoint
    this.app.post('/oauth/refresh', async (req, res) => {
      try {
        const { refresh_token, client_id } = req.body;

        if (!refresh_token || !client_id) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters: refresh_token, client_id'
          });
        }

        const tokenResponse = await PNOAuthService.refreshAccessToken(refresh_token, client_id);

        if (!tokenResponse) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'Invalid or expired refresh token'
          });
        }

        return res.json(tokenResponse);
      } catch (error: any) {
        console.error('Token refresh error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Token refresh failed'
        });
      }
    });

    // GET /oauth/zkp-data-points - Get ZKP data points for third-party tools
    // Returns ZKP proofs for data points that the third party has access to
    // NEVER returns pN File, pN Name, or passcode
    this.app.get('/oauth/zkp-data-points', async (req, res) => {
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

        // Get pN identifier from token
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'pN identifier not found in token'
          });
        }

        // Get requested data points from query parameter or token scopes
        const requestedDataPoints = req.query.data_points 
          ? (req.query.data_points as string).split(',').map((dp: string) => dp.trim())
          : (tokenPayload.scope || [])
              .filter((scope: string) => scope.startsWith('zkp:') || scope.startsWith('data_point:'))
              .map((scope: string) => scope.replace(/^(zkp:|data_point:)/, ''));

        // NEVER allow access to sensitive data points
        const BLOCKED_DATA_POINTS = ['pn_file', 'pn_name', 'passcode', 'pnIdentifier'];
        const allowedDataPoints = requestedDataPoints.filter(
          (dp: string) => !BLOCKED_DATA_POINTS.includes(dp)
        );

        if (allowedDataPoints.length === 0) {
          return res.json({ success: true, dataPoints: [] });
        }

        // Get Google Drive access token for the user
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        
        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
        
        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find pN folder and _metadata folder
        const pnFolderName = `par Noir - ${pnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!metadataFolderResponse.ok) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
        if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderId = metadataFolderData.files[0].id;

        // Get client_id from token to check permissions
        const clientId = tokenPayload.clientId || 'browser-app'; // Default to browser-app for backward compatibility
        
        // Check if user has granted access to these data points for this third party
        const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
        const permissions = await ThirdPartyPermissionsService.getPermissions(
          userAccessToken,
          metadataFolderId
        );
        
        const toolPermission = permissions[clientId];
        let finalAllowedDataPoints = allowedDataPoints;
        
        if (toolPermission) {
          console.log(`[OAuth ZKP] Found permissions for ${clientId}:`, {
            dataPoints: toolPermission.dataPoints,
            requiredDataPoints: toolPermission.requiredDataPoints,
            optionalDataPoints: toolPermission.optionalDataPoints
          });
          
          // Filter data points to only those the user has granted access to
          // Required data points are always granted, optional ones must be in dataPoints array
          finalAllowedDataPoints = allowedDataPoints.filter((dp: string) => 
            toolPermission.requiredDataPoints.includes(dp) || // Required are always granted
            toolPermission.dataPoints.includes(dp) // Optional must be explicitly granted
          );
          
          console.log(`[OAuth ZKP] Filtered data points:`, {
            requested: allowedDataPoints,
            allowed: finalAllowedDataPoints
          });
          
          if (finalAllowedDataPoints.length === 0) {
            console.log(`[OAuth ZKP] No data points granted for ${clientId}`);
            return res.json({ success: true, dataPoints: [] });
          }
        } else {
          console.log(`[OAuth ZKP] No permissions found for ${clientId}`);
          // No permissions found - return empty (user hasn't granted access)
          // Exception: browser-app is hard-coded, so allow if it's browser-app
          if (clientId !== 'browser-app') {
            return res.json({ success: true, dataPoints: [] });
          }
          // For browser-app, continue without permission check (backward compatibility)
          console.log(`[OAuth ZKP] Continuing for browser-app without permission check (backward compatibility)`);
        }

        // Get ZKP proofs for requested data points
        const ZKPDataPointsService = (await import('./server/modules/zkpDataPointsService')).ZKPDataPointsService;
        const zkpDataPoints: any[] = [];

        for (const dataPointId of finalAllowedDataPoints) {
          try {
            console.log(`[OAuth ZKP] Attempting to get proof for ${dataPointId}`);
            const proof = await ZKPDataPointsService.getDataPointProof(
              userAccessToken,
              metadataFolderId,
              dataPointId
            );
            
            if (proof) {
              console.log(`[OAuth ZKP] Found proof for ${dataPointId}`);
              zkpDataPoints.push({
                dataPointId: proof.dataPointId,
                proofType: proof.proofType,
                zkpProof: proof.zkpProof,
                verifiedAt: proof.verifiedAt,
                expiresAt: proof.expiresAt,
                verificationLevel: proof.verificationLevel
                // NEVER include: encryptedUserData, signature, or any actual user data
              });
            } else {
              console.log(`[OAuth ZKP] No proof found for ${dataPointId} (permission granted but ZKP not created yet)`);
            }
          } catch (error) {
            console.warn(`[OAuth ZKP] Failed to get ZKP proof for ${dataPointId}:`, error);
            // Continue with other data points
          }
        }
        
        console.log(`[OAuth ZKP] Returning ${zkpDataPoints.length} data point(s) for ${clientId}`);

        return res.json({ success: true, dataPoints: zkpDataPoints });
      } catch (error: any) {
        console.error('Error getting ZKP data points:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to retrieve ZKP data points'
        });
      }
    });

    // GET /oauth/userinfo - User info endpoint
    // Returns user information based on access token
    // NEVER returns pN File, pN Name, or passcode
    this.app.get('/oauth/userinfo', async (req, res) => {
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

        // Get pN identifier from token payload (derived during token generation)
        // Fallback to database lookup if not in token
        let pnIdentifier: string | undefined = tokenPayload.pnIdentifier;
        
        // If not in token, try database lookup
        if (!pnIdentifier) {
          try {
            const db = (await import('./server/utils/database')).getDatabasePool();
            const did = tokenPayload.did;
            
            console.log(`🔍 [Userinfo] pN identifier not in token, looking up in database for DID: ${did.substring(0, 20)}...`);
            
            const result = await db.query(
              `SELECT DISTINCT pn_identifier 
               FROM aggregator_metadata 
               WHERE pn_identifier IS NOT NULL 
                 AND (
                   ((metadata->'creator'->>'@id')::text = $1::text) OR
                   ((metadata->'creator'->'identifier'->>'value')::text = $1::text) OR
                   ((metadata->'author'->>'did')::text = $1::text)
                 )
               LIMIT 1`,
              [did]
            );
            
            if (result.rows.length > 0 && result.rows[0].pn_identifier) {
              pnIdentifier = result.rows[0].pn_identifier;
              console.log(`✅ [Userinfo] Found pN identifier in database: ${pnIdentifier}`);
            }
          } catch (dbError) {
            console.warn('⚠️ [Userinfo] Failed to look up pN identifier from database:', dbError);
          }
        } else {
          console.log(`✅ [Userinfo] Using pN identifier from token: ${pnIdentifier}`);
        }

        // Get publicKey from authorization code (stored during /oauth/auth)
        // We need to look it up from the authorization code that was used to generate this token
        // Since authorization codes are short-lived, we'll need to get it from the refresh token or derive it
        // For now, extract from DID if it's in did:key format (fallback)
        let publicKey: string | undefined = undefined;
        
        // Try to get publicKey from refresh token database
        // Also try looking up by pN identifier if available
        try {
          const db = (await import('./server/utils/database')).getDatabasePool();
          
          // First try by DID
          let refreshTokenResult = await db.query(
            `SELECT public_key FROM oauth_refresh_tokens WHERE did = $1 ORDER BY expires_at DESC LIMIT 1`,
            [tokenPayload.did]
          );
          
          // If not found and we have pN identifier, try by pN identifier
          if ((!refreshTokenResult.rows.length || !refreshTokenResult.rows[0].public_key) && pnIdentifier) {
            refreshTokenResult = await db.query(
              `SELECT public_key FROM oauth_refresh_tokens WHERE pn_identifier = $1 ORDER BY expires_at DESC LIMIT 1`,
              [pnIdentifier]
            );
          }
          
          if (refreshTokenResult.rows.length > 0 && refreshTokenResult.rows[0].public_key) {
            publicKey = refreshTokenResult.rows[0].public_key;
            console.log(`✅ [Userinfo] Found publicKey from refresh token`);
          } else {
            console.warn(`⚠️ [Userinfo] No publicKey found in refresh token for DID: ${tokenPayload.did.substring(0, 20)}...`);
          }
        } catch (dbError) {
          console.warn('⚠️ [Userinfo] Failed to look up publicKey from refresh token:', dbError);
        }
        
        // Fallback: extract from DID if it's in did:key format
        if (!publicKey && tokenPayload.did.startsWith('did:key:')) {
          publicKey = tokenPayload.did.substring(8); // Remove "did:key:" prefix
          console.log(`✅ [Userinfo] Using publicKey extracted from DID`);
        }

        // NEVER return pN File, pN Name, or passcode to third parties
        // These are sensitive credentials that should never be exposed via OAuth
        
        // Get requested scopes from token
        const scopes = tokenPayload.scope || [];
        const requestedDataPoints = scopes.filter((scope: string) => 
          scope.startsWith('data_point:') || scope.startsWith('zkp:')
        );

        // Build response with only allowed data
        const userInfo: any = {
          sub: tokenPayload.did,
          did: tokenPayload.did,
          pn_identifier: pnIdentifier, // pN identifier is safe to share (it's public)
          // NEVER include: pn_name, pn_file, passcode
        };

        // Always include public_key for browser-app (needed for file decryption)
        // For other clients, only include if explicitly requested
        if (tokenPayload.clientId === 'browser-app' && publicKey) {
          userInfo.public_key = publicKey;
        } else if (scopes.includes('public_key') && publicKey) {
          userInfo.public_key = publicKey;
        }

        return res.json(userInfo);
      } catch (error: any) {
        console.error('Userinfo error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to retrieve user info'
        });
      }
    });

    // GET /oauth/consent - Generic OAuth consent page for third-party clients
    // Serves a generic consent page that works for any registered client
    this.app.get('/oauth/consent', async (req, res) => {
      const { client_id, redirect_uri, scope, state, nonce } = req.query;

      // Validate required parameters
      if (!client_id || !redirect_uri) {
        res.status(400).send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>OAuth Error</h1>
              <p>Missing required parameters: client_id, redirect_uri</p>
            </body>
          </html>
        `);
      }

      // Validate client
      const { ClientRegistrationService } = await import('./server/modules/clientRegistration');
      const client = ClientRegistrationService.getClient(client_id as string);
      
      if (!client || !ClientRegistrationService.validateClient(client_id as string, redirect_uri as string)) {
        res.status(400).send(`
          <html>
            <head><title>OAuth Error</title></head>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>OAuth Error</h1>
              <p>Invalid client_id or redirect_uri</p>
            </body>
          </html>
        `);
        return;
      }

      // Parse scopes
      const scopes = scope ? (scope as string).split(' ') : ['openid', 'profile'];
      
      // Serve generic consent page HTML
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize - ${client.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 420px;
      background: rgba(26, 26, 26, 0.95);
      border: 1px solid #333;
      border-radius: 12px;
      padding: 32px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .app-name { color: #60a5fa; font-weight: 600; }
    .subtitle { color: #9ca3af; font-size: 14px; margin-bottom: 24px; }
    .permissions { background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 16px; margin: 24px 0; }
    .permission-item { padding: 8px 0; color: #e5e7eb; font-size: 14px; }
    .buttons { display: flex; gap: 12px; margin-top: 24px; }
    button {
      flex: 1;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-deny {
      background: rgba(26, 26, 26, 0.95);
      border: 1px solid #4b5563;
      color: #fff;
    }
    .btn-deny:hover { background: rgba(31, 31, 31, 0.95); }
    .btn-approve {
      background: #3b82f6;
      color: #fff;
    }
    .btn-approve:hover { background: #2563eb; }
    .error { background: #7f1d1d; color: #fca5a5; padding: 12px; border-radius: 8px; margin-bottom: 16px; }
    .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 8px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorize <span class="app-name">${client.name}</span></h1>
    <p class="subtitle">${client.description || 'This application wants to access your pN identity'}</p>
    
    <div id="error" style="display: none;" class="error"></div>
    
    <div class="permissions">
      <strong style="display: block; margin-bottom: 12px;">Requested Permissions:</strong>
      ${scopes.map(s => `<div class="permission-item">• ${s === 'openid' ? 'Verify your identity' : s === 'profile' ? 'Access your profile information' : s}</div>`).join('')}
    </div>
    
    <div class="buttons">
      <button class="btn-deny" id="denyBtn">Deny</button>
      <button class="btn-approve" id="approveBtn">Approve</button>
    </div>
  </div>
  
  <script>
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client_id');
    const redirectUri = urlParams.get('redirect_uri');
    const scope = urlParams.get('scope') || 'openid profile';
    const state = urlParams.get('state') || '';
    const nonce = urlParams.get('nonce') || '';
    const isInPopup = urlParams.get('popup') === 'true' || !!(window.opener && !window.opener.closed);
    
    let authorizationCode = null;
    
    // Step 1: Authenticate user
    async function authenticate() {
      const identityFileInput = document.createElement('input');
      identityFileInput.type = 'file';
      identityFileInput.accept = '.did,.json,.pn,.id,.identity,application/json';
      
      return new Promise((resolve, reject) => {
        identityFileInput.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) {
            reject(new Error('No file selected'));
            return;
          }
          
          const fileText = await file.text();
          let identityData;
          try {
            identityData = JSON.parse(fileText);
          } catch {
            reject(new Error('Invalid identity file'));
            return;
          }
          
          const passcode = prompt('Enter your passcode:');
          if (!passcode) {
            reject(new Error('Passcode required'));
            return;
          }
          
          try {
            const apiBase = window.location.origin;
            const response = await fetch(apiBase + '/oauth/authorize/authenticate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: clientId,
                redirect_uri: redirectUri,
                scope: scope,
                state: state,
                nonce: nonce,
                encrypted_identity: identityData,
                passcode: passcode,
                public_key: identityData.publicKey || identityData.key?.public || ''
              })
            });
            
            if (!response.ok) {
              const error = await response.json();
              reject(new Error(error.error_description || 'Authentication failed'));
              return;
            }
            
            const data = await response.json();
            resolve(data.code);
          } catch (err) {
            reject(err);
          }
        };
        
        identityFileInput.click();
      });
    }
    
    document.getElementById('approveBtn').addEventListener('click', async () => {
      const btn = document.getElementById('approveBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading"></span> Approving...';
      
      try {
        if (!authorizationCode) {
          authorizationCode = await authenticate();
        }
        
        if (isInPopup) {
          // Send message to opener
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'oauth_callback',
              code: authorizationCode,
              state: state
            }, window.location.origin);
          }
          
          // Also store in localStorage for polling
          const callbackKey = 'pn_oauth_callback_' + Date.now();
          localStorage.setItem(callbackKey, JSON.stringify({
            type: 'oauth_callback',
            code: authorizationCode,
            state: state,
            timestamp: Date.now()
          }));
          localStorage.setItem('pn_oauth_pending', 'true');
          localStorage.setItem('pn_oauth_latest_key', callbackKey);
          
          // Close popup
          window.close();
        } else {
          // Redirect to redirect_uri with code
          window.location.href = redirectUri + '?code=' + authorizationCode + (state ? '&state=' + state : '');
        }
      } catch (err) {
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = err.message || 'Authentication failed';
        btn.disabled = false;
        btn.innerHTML = 'Approve';
      }
    });
    
    document.getElementById('denyBtn').addEventListener('click', () => {
      if (isInPopup) {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'oauth_callback',
            error: 'access_denied',
            state: state
          }, window.location.origin);
        }
        window.close();
      } else {
        window.location.href = redirectUri + '?error=access_denied' + (state ? '&state=' + state : '');
      }
    });
  </script>
</body>
</html>
      `);
    });

    // Client Management Endpoints
    // POST /oauth/clients - Register a new OAuth client
    this.app.post('/oauth/clients', async (req, res) => {
      try {
        const { ClientRegistrationService } = await import('./server/modules/clientRegistration');
        const { clientId, name, description, redirectUris, scopes, clientSecret } = req.body;

        if (!clientId || !name || !redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required fields: clientId, name, redirectUris (array)'
          });
        }

        if (ClientRegistrationService.clientExists(clientId)) {
          return res.status(409).json({
            error: 'client_exists',
            error_description: 'Client with this ID already exists'
          });
        }

        const client = ClientRegistrationService.registerClient({
          clientId,
          name,
          description,
          redirectUris,
          scopes: scopes || [],
          clientSecret,
          isActive: true
        });

        // Don't return clientSecret in response
        const { clientSecret: _, ...clientResponse } = client;
        return res.status(201).json(clientResponse);
      } catch (error: any) {
        console.error('Client registration error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to register client'
        });
      }
    });

    // GET /oauth/clients/:client_id - Get client information
    this.app.get('/oauth/clients/:client_id', async (req, res) => {
      try {
        const { ClientRegistrationService } = await import('./server/modules/clientRegistration');
        const client = ClientRegistrationService.getClient(req.params.client_id);

        if (!client) {
          return res.status(404).json({
            error: 'client_not_found',
            error_description: 'Client not found'
          });
        }

        // Don't return clientSecret
        const { clientSecret: _, ...clientResponse } = client;
        return res.json(clientResponse);
      } catch (error: any) {
        console.error('Get client error:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get client'
        });
      }
    });

    // POST /oauth/revoke - Revoke token endpoint
    this.app.post('/oauth/revoke', async (req, res) => {
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
          revoked = await PNOAuthService.revokeRefreshToken(token);
        }

        // If still not found, try refresh token anyway
        if (!revoked) {
          revoked = await PNOAuthService.revokeRefreshToken(token);
        }

        return res.json({ revoked: true });
      } catch (error: any) {
        console.error('Token revocation error:', error);
        return res.status(500).json({
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
    // Message endpoints (placeholder - returns empty arrays for now)
    // GET /api/messages/conversations - Get all conversation threads
    this.app.get('/api/messages/conversations', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ conversations: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ conversations: [] });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Check for cached inbox sheet ID in credentials (fastest path)
        const cachedFolderIds = userCredentials.credentials.cachedFolderIds || {};
        let inboxSheetId: string | undefined = cachedFolderIds.inboxSheetId;

        // If we have cached inbox sheet ID, use it directly (fastest path - no folder lookups!)
        if (inboxSheetId) {
          try {
            const inboxConversations = await MessageSheetsService.getInboxConversations(
              token,
              inboxSheetId,
              pnIdentifier,
              accountId
            );
            
            // Inbox already contains sharedSecret - no connections lookup needed!
            const enrichedConversations = inboxConversations.map((conv) => {
              const lastMessage = conv.lastMessagePreview ? {
                messageId: '',
                fromPnIdentifier: '',
                toPnIdentifier: conv.participantPnIdentifier,
                content: conv.lastMessagePreview,
                timestamp: conv.lastMessageAt,
                read: false,
                encrypted: false
              } : undefined;

              return {
                otherUserPnIdentifier: conv.participantPnIdentifier,
                participantPnIdentifier: conv.participantPnIdentifier,
                spreadsheetId: conv.spreadsheetId,
                connectionId: conv.connectionId,
                sharedSecret: conv.sharedSecret, // Already in inbox - no lookup needed!
                lastMessageAt: conv.lastMessageAt,
                lastMessagePreview: conv.lastMessagePreview,
                lastMessage
              };
            });

            const threads = enrichedConversations.map(conv => ({
              participantPnIdentifier: conv.participantPnIdentifier,
              lastMessageAt: conv.lastMessageAt
            }));

            return res.json({ conversations: enrichedConversations, threads });
          } catch (inboxError: any) {
            console.warn('[GetConversations] Cached inbox sheet failed, falling back to lookup:', inboxError?.message);
            // Fall through to lookup path
          }
        }

        // Fallback: Use cached folder IDs if available, only search if missing
        let messagesFolderId: string | undefined = cachedFolderIds.messagesFolderId;
        let metadataFolderId: string | undefined = cachedFolderIds.metadataFolderId;
        let pnFolderId: string | undefined = cachedFolderIds.pnFolderId;

        // Only search if cache is missing
        if (!messagesFolderId || !metadataFolderId || !pnFolderId) {
          // Get metadata folder (includes pnFolderId)
          // Pass full token object for automatic refresh
          const metadataFolder = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!metadataFolder) {
            console.warn('[GetConversations] Metadata folder not found, returning empty conversations');
            return res.json({ conversations: [], threads: [] });
          }
          metadataFolderId = metadataFolder.metadataFolderId;
          pnFolderId = metadataFolder.pnFolderId;

          // Get or create messages folder if not cached
          if (!messagesFolderId && pnFolderId) {
            messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
              token,
              pnFolderId,
              pnIdentifier,
              accountId
            );
          }

          // Cache folder IDs for next time (async, don't wait)
          const updatedCached = {
            ...cachedFolderIds,
            messagesFolderId: messagesFolderId || cachedFolderIds.messagesFolderId,
            metadataFolderId,
            pnFolderId
          };
          userCredentials.credentials.cachedFolderIds = updatedCached;
          storageCredentialsService.upsertCredentials(pnIdentifier, userCredentials.credentials).catch(err => {
            console.warn('[GetConversations] Failed to cache folder IDs:', err?.message);
          });
        }

        if (!messagesFolderId || !metadataFolderId) {
          return res.json({ conversations: [], threads: [] });
        }

        // Get inbox sheet and cache the ID
        let inboxConversations: Array<{
          participantPnIdentifier: string;
          spreadsheetId: string;
          connectionId: string;
          lastMessageAt: string;
          lastMessagePreview?: string;
          sharedSecret?: string; // Encrypted shared secret
        }> = [];

        try {
          inboxSheetId = await MessageSheetsService.getInboxSheet(
            token,
            messagesFolderId,
            pnIdentifier,
            accountId,
            cachedFolderIds.inboxSheetId // Pass cached ID to skip search
          );
          
          // Cache folder IDs for next time (async, don't wait)
          const existingCached = userCredentials.credentials.cachedFolderIds || {};
          if (!existingCached.inboxSheetId || !existingCached.messagesFolderId || !existingCached.metadataFolderId) {
            const updatedCredentials = {
              ...userCredentials.credentials,
              cachedFolderIds: {
                inboxSheetId,
                messagesFolderId,
                metadataFolderId,
                ...existingCached
              }
            };
            storageCredentialsService.upsertCredentials(pnIdentifier, updatedCredentials).catch(err => {
              console.warn('[GetConversations] Failed to cache folder IDs:', err?.message);
            });
          }
          
          inboxConversations = await MessageSheetsService.getInboxConversations(
            token,
            inboxSheetId,
            pnIdentifier,
            accountId
          );
        } catch (inboxError: any) {
          console.warn('[GetConversations] Failed to read inbox, falling back to file listing:', inboxError?.message);
          const conversations = await MessageSheetsService.getConversations(
            token,
            messagesFolderId,
            pnIdentifier,
            accountId
          );
          inboxConversations = conversations.map(conv => ({
            participantPnIdentifier: conv.otherUserPnIdentifier,
            spreadsheetId: conv.spreadsheetId,
            connectionId: '',
            lastMessageAt: conv.lastMessageAt,
            lastMessagePreview: undefined,
            sharedSecret: undefined // Not available in fallback path
          }));
        }

        // Inbox already contains sharedSecret - no connections lookup needed!
        const enrichedConversations = inboxConversations.map((conv) => {
          // Use lastMessagePreview from inbox; no getMessages calls for list
          const lastMessage = conv.lastMessagePreview ? {
            messageId: '',
            fromPnIdentifier: '',
            toPnIdentifier: conv.participantPnIdentifier,
            content: conv.lastMessagePreview,
            timestamp: conv.lastMessageAt,
            read: false,
            encrypted: false
          } : undefined;

          return {
            otherUserPnIdentifier: conv.participantPnIdentifier,
            participantPnIdentifier: conv.participantPnIdentifier,
            spreadsheetId: conv.spreadsheetId,
            connectionId: conv.connectionId,
            sharedSecret: conv.sharedSecret, // Already in inbox - no lookup needed!
            lastMessageAt: conv.lastMessageAt,
            lastMessagePreview: conv.lastMessagePreview,
            lastMessage
          };
        });

        const threads = enrichedConversations.map(conv => ({
          participantPnIdentifier: conv.participantPnIdentifier,
          lastMessageAt: conv.lastMessageAt
        }));

        return res.json({ conversations: enrichedConversations, threads }); // Return both for compatibility
      } catch (error: any) {
        console.error('Error getting message conversations:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get message conversations',
          error_description: error.message || 'Failed to get message conversations'
        });
      }
    });


    this.app.get('/api/messages/requests', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        // TODO: Implement message requests retrieval from Google Drive
        return res.json({ requests: [] });
      } catch (error: any) {
        console.error('Error getting message requests:', error);
        return res.status(500).json({
          error: 'Failed to get message requests',
          error_description: error.message || 'Failed to get message requests'
        });
      }
    });

    this.app.get('/api/messages/inbox', async (req, res) => {
      try {
        const userPnIdentifier = req.query.userPnIdentifier as string;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ messages: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ messages: [] });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Find user's pN folder
        const pnFolderName = `par Noir - ${pnIdentifier}`;
        const folderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const foldersResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
          { headers: { 'Authorization': `Bearer ${token.access_token}` } }
        );

        if (!foldersResponse.ok) {
          return res.json({ messages: [] });
        }

        const foldersData = await foldersResponse.json() as { files?: Array<{ id: string }> };
        const pnFolder = foldersData.files?.[0];
        if (!pnFolder) {
          return res.json({ messages: [] });
        }

        // Get or create messages folder
        const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          pnFolder.id,
          pnIdentifier,
          accountId
        );

        // Get all conversations
        const conversations = await MessageSheetsService.getConversations(
          token,
          messagesFolderId,
          pnIdentifier,
          accountId
        );

        // Get latest message from each conversation
        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
        
        // Get user's metadata folder for connection lookup
        const metadataFolder = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!metadataFolder) {
          return res.json({ messages: [] });
        }
        const metadataFolderId = metadataFolder.metadataFolderId;

        const allMessages: any[] = [];
        for (const conversation of conversations) {
          try {
            // Validate and normalize otherUserPnIdentifier (getConversations already normalizes, but normalize again to be safe)
            if (!conversation.otherUserPnIdentifier) {
              console.warn(`[Inbox] Conversation missing otherUserPnIdentifier, skipping:`, conversation);
              continue;
            }
            // Use pn identifier directly (already normalized)
            // Look up connection to get shared secret
            const connectionStatus = await ConnectionsService.getConnectionStatus(
              token.access_token,
              metadataFolderId,
              pnIdentifier,
              conversation.otherUserPnIdentifier
            );

            if (!connectionStatus.connectionId || connectionStatus.status !== 'connected') {
              console.warn(`[Inbox] Connection not found for ${conversation.otherUserPnIdentifier}, skipping`);
              continue;
            }

            // Get connection to retrieve shared secret
            const connectionsFile = await ConnectionsService.getConnectionsFile(
              token.access_token,
              metadataFolderId
            );
            if (!connectionsFile) {
              console.warn(`[Inbox] Connections file not found, skipping ${conversation.otherUserPnIdentifier}`);
              continue;
            }

            const connection = connectionsFile.connections.find(
              c => c.connectionId === connectionStatus.connectionId
            );
            if (!connection) {
              console.warn(`[Inbox] Connection not found for ${conversation.otherUserPnIdentifier}, skipping`);
              continue;
            }

            // Allow reading messages even if shared secret is missing (will read as plain text)
            let decryptedSharedSecret: string | undefined;
            if (connection.sharedSecret) {
              decryptedSharedSecret = MetadataEncryption.decryptField(connection.sharedSecret);
              if (!decryptedSharedSecret) {
                console.warn(`[Inbox] Failed to decrypt shared secret for ${conversation.otherUserPnIdentifier}, will read as plain text`);
              }
            } else {
              console.warn(`[Inbox] Connection missing shared secret for ${conversation.otherUserPnIdentifier}, will read as plain text`);
            }

            const conversationSheetId = await MessageSheetsService.getConversationSheet(
              token,
              messagesFolderId,
              conversation.otherUserPnIdentifier,
              pnIdentifier,
              accountId
            );
            const result = await MessageSheetsService.getMessages(
              token,
              conversationSheetId,
              connectionStatus.connectionId,
              decryptedSharedSecret || '', // Empty string allows plain text reading
              pnIdentifier,
              accountId,
              { limit: 1, offset: 0 }
            );
            if (result.messages.length > 0) {
              const msg = result.messages[0];
              msg.toPnIdentifier = conversation.otherUserPnIdentifier;
              allMessages.push(msg);
            }
          } catch (error) {
            console.error(`Failed to get messages for conversation ${conversation.otherUserPnIdentifier}:`, error);
          }
        }

        // Sort by timestamp descending
        allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return res.json({ messages: allMessages });
      } catch (error: any) {
        console.error('Error getting inbox messages:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get inbox messages',
          error_description: error.message || 'Failed to get inbox messages'
        });
      }
    });

    // GET & POST /api/messages/conversation - Get messages in a specific conversation
    // POST with body used when passing cached credentials (avoids URL length / encoding issues)
    const conversationHandler = async (req: express.Request, res: express.Response) => {
      const src = req.method === 'POST' ? (req.body as Record<string, unknown>) : req.query as Record<string, unknown>;
      console.log('[GetConversation] Endpoint called', { 
        userPnIdentifier: src.userPnIdentifier, 
        participantPnIdentifier: src.participantPnIdentifier,
        hasConnectionId: !!src.connectionId,
        hasSharedSecret: !!src.sharedSecret,
        hasSpreadsheetId: !!src.spreadsheetId,
        method: req.method
      });
      try {
        const userPnIdentifier = src.userPnIdentifier as string;
        const participantPnIdentifier = src.participantPnIdentifier as string;
        const limit = src.limit != null ? parseInt(String(src.limit), 10) : 50;
        const offset = src.offset != null ? parseInt(String(src.offset), 10) : 0;
        const connectionId = src.connectionId as string | undefined;
        const sharedSecret = src.sharedSecret as string | undefined; // Encrypted
        const spreadsheetId = src.spreadsheetId as string | undefined;

        if (!userPnIdentifier || !participantPnIdentifier) {
          console.error('[GetConversation] Missing required parameters');
          return res.status(400).json({ error: 'userPnIdentifier and participantPnIdentifier are required' });
        }

        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ messages: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ messages: [] });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Normalize participantPnIdentifier to ensure consistent format
        const normalizedParticipantPnIdentifier = participantPnIdentifier.startsWith('pn-') 
          ? participantPnIdentifier 
          : `pn-${participantPnIdentifier}`;

        // If connectionId and sharedSecret are provided, skip lookups (optimized path)
        let finalConnectionId: string;
        let decryptedSharedSecret: string;
        let conversationSheetId: string;

        if (connectionId && sharedSecret && spreadsheetId) {
          // Fully optimized path: use provided connection info, skip ALL folder lookups
          console.log('[GetConversation] Using fully optimized path (no folder lookups)');
          finalConnectionId = connectionId;
          conversationSheetId = spreadsheetId;

          const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
          decryptedSharedSecret = MetadataEncryption.decryptField(sharedSecret);
          if (!decryptedSharedSecret || MetadataEncryption.isEncrypted(decryptedSharedSecret)) {
            console.error('[GetConversation] Failed to decrypt provided shared secret (empty or still encrypted)');
            return res.status(500).json({
              error: 'Failed to decrypt shared secret',
              error_description: 'Failed to decrypt provided shared secret'
            });
          }
          // Skip all folder lookups - we have spreadsheetId, just need access token for Sheets API
        } else {
          // Fallback path: use cached folder IDs first, only search if missing
          console.log('[GetConversation] Looking up connection (fallback path)');
          
          const cachedFolderIds = userCredentials.credentials.cachedFolderIds || {};
          let messagesFolderId: string | undefined = cachedFolderIds.messagesFolderId;
          let metadataFolderId: string | undefined = cachedFolderIds.metadataFolderId;
          let pnFolderId: string | undefined = cachedFolderIds.pnFolderId;

          // Only search if cache is missing
          if (!messagesFolderId || !metadataFolderId || !pnFolderId) {
            // Get metadata folder (includes pnFolderId)
            const metadataFolder = await this.getMetadataFolder(token, pnIdentifier, accountId);
            if (!metadataFolder) {
              console.error('[GetConversation] Metadata folder not found for', pnIdentifier);
              return res.json({ messages: [], total: 0 });
            }
            metadataFolderId = metadataFolder.metadataFolderId;
            pnFolderId = metadataFolder.pnFolderId;

            // Get or create messages folder if not cached
            if (!messagesFolderId && pnFolderId) {
              messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                token,
                pnFolderId,
                pnIdentifier,
                accountId
              );
            }
          }

          if (!messagesFolderId || !metadataFolderId) {
            return res.json({ messages: [], total: 0 });
          }

          const { ConnectionsService } = await import('./server/modules/connectionsService');
          const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
          
          // Ensure both identifiers are normalized before checking connection
          const normalizedUserPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
          const connectionStatus = await ConnectionsService.getConnectionStatus(
            token.access_token,
            metadataFolderId,
            normalizedUserPnIdentifier,
            normalizedParticipantPnIdentifier
          );

          console.log('[GetConversation] Connection status:', JSON.stringify(connectionStatus));
          if (!connectionStatus.connectionId || connectionStatus.status !== 'connected') {
            console.error('[GetConversation] Connection not found or not connected', {
              connectionId: connectionStatus.connectionId,
              status: connectionStatus.status,
              userPnIdentifier: pnIdentifier,
              participantPnIdentifier: normalizedParticipantPnIdentifier
            });
            return res.status(403).json({
              error: 'Connection not found. Users must be connected to view messages.',
              error_description: `Connection not found. Status: ${connectionStatus.status || 'not_connected'}`
            });
          }

          console.log('[GetConversation] Getting connections sheet');
          // Get connection to retrieve shared secret - use Sheets directly
          const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
          const connectionsSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
            token,
            metadataFolderId,
            pnIdentifier,
            accountId
          );
          console.log('[GetConversation] Connections sheet ID:', connectionsSpreadsheetId);
          
          console.log('[GetConversation] Fetching connection by ID');
          // Get connection directly by connectionId (more efficient than loading all connections)
          const connection = await ConnectionsSheetsService.getConnectionById(
            token,
            connectionsSpreadsheetId,
            connectionStatus.connectionId,
            pnIdentifier,
            accountId
          );
          if (!connection) {
            console.error('[GetConversation] Connection not found in sheet, connectionId:', connectionStatus.connectionId);
            return res.status(500).json({
              error: 'Connection not found',
              error_description: `Connection ${connectionStatus.connectionId} not found in connections sheet`
            });
          }

          console.log('[GetConversation] Found connection, checking shared secret');
          // Get shared secret from connection - generate if missing (for backwards compatibility)
          let connectionSharedSecret = connection.sharedSecret;
          if (!connectionSharedSecret) {
            console.log(`[GetConversation] Connection ${connectionStatus.connectionId} missing shared secret, generating one`);
            const crypto = await import('crypto');
            const rawSecret = crypto.randomBytes(32).toString('base64');
            connectionSharedSecret = MetadataEncryption.encryptField(rawSecret);
            
            // Update connection with shared secret
            await ConnectionsSheetsService.updateConnectionStatus(
              token,
              connectionsSpreadsheetId,
              connectionStatus.connectionId,
              connection.status,
              pnIdentifier,
              accountId,
              connection.acceptedAt,
              connectionSharedSecret
            );
            console.log(`[GetConversation] Generated and stored shared secret for connection ${connectionStatus.connectionId}`);
          }

          console.log('[GetConversation] Decrypting shared secret');
          // Decrypt shared secret
          decryptedSharedSecret = MetadataEncryption.decryptField(connectionSharedSecret);
          if (!decryptedSharedSecret) {
            console.error(`[GetConversation] Failed to decrypt shared secret for connection ${connectionStatus.connectionId}`);
            return res.status(500).json({
              error: 'Failed to decrypt shared secret',
              error_description: 'Failed to decrypt shared secret'
            });
          }
          console.log('[GetConversation] Successfully decrypted shared secret');

          finalConnectionId = connectionStatus.connectionId;

          // Get conversation sheet - check cache first
          console.log('[GetConversation] Getting conversation sheet');
          const conversationSheets = cachedFolderIds.conversationSheets || {};
          conversationSheetId = conversationSheets[normalizedParticipantPnIdentifier];
          
          if (!conversationSheetId) {
            // Not cached - get it and cache it
            conversationSheetId = await MessageSheetsService.getConversationSheet(
              token,
              messagesFolderId,
              normalizedParticipantPnIdentifier,
              pnIdentifier,
              accountId
            );
            // Cache for next time (async, don't wait)
            const updatedConversationSheets = {
              ...conversationSheets,
              [normalizedParticipantPnIdentifier]: conversationSheetId
            };
            userCredentials.credentials.cachedFolderIds = {
              ...cachedFolderIds,
              conversationSheets: updatedConversationSheets
            };
            storageCredentialsService.upsertCredentials(pnIdentifier, userCredentials.credentials).catch(err => {
              console.warn('[GetConversation] Failed to cache conversation sheet ID:', err?.message);
            });
          }
        }

        // Get messages from conversation sheet (with decryption)
        // Default to last 10 messages for initial load
        const messageLimit = limit || 10;
        const messageOffset = offset || 0;
        console.log('[GetConversation] Fetching messages from sheet', { limit: messageLimit, offset: messageOffset });
        const result = await MessageSheetsService.getMessages(
          token,
          conversationSheetId,
          finalConnectionId,
          decryptedSharedSecret,
          pnIdentifier,
          accountId,
          { limit: messageLimit, offset: messageOffset }
        );

        // Set toPnIdentifier for all messages (use normalized)
        result.messages.forEach(msg => {
          msg.toPnIdentifier = normalizedParticipantPnIdentifier;
        });

        console.log('[GetConversation] Returning', result.messages.length, 'messages');
        return res.json({ messages: result.messages, total: result.total });
      } catch (error: any) {
        console.error('[GetConversation] ERROR:', error);
        console.error('[GetConversation] ERROR stack:', error?.stack);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get thread messages',
          error_description: error.message || 'Failed to get thread messages'
        });
      }
    };
    this.app.get('/api/messages/conversation', conversationHandler);
    this.app.post('/api/messages/conversation', conversationHandler);

    this.app.post('/api/messages/send', async (req, res) => {
        console.log('[SendMessage] Endpoint called', { 
        fromPnIdentifier: req.body?.fromPnIdentifier, 
        toPnIdentifier: req.body?.toPnIdentifier,
        hasContent: !!req.body?.content,
        contentLength: req.body?.content?.length
      });
      try {
        const { fromPnIdentifier, toPnIdentifier, content, mediaFileId, isConnectionRequest } = req.body;
        if (!fromPnIdentifier || !toPnIdentifier || !content) {
          return res.status(400).json({ error: 'fromPnIdentifier, toPnIdentifier, and content are required' });
        }
        
        // Normalize pn-identifiers (handles legacy data)
        // Use pn identifiers directly (already normalized)
        console.log('[SendMessage] Request validated, starting message processing', { fromPnIdentifier, toPnIdentifier, messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` });

        // Import services at the top
        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Get sender's and recipient's credentials in parallel (reused throughout)
        const [senderCredentials, fetchedRecipientCredentials] = await Promise.all([
          storageCredentialsService.getCredentials(fromPnIdentifier),
          storageCredentialsService.getCredentials(toPnIdentifier)
        ]);
        
        const recipientCredentials = fetchedRecipientCredentials;

        if (!senderCredentials?.credentials) {
          return res.status(404).json({ error: 'Sender credentials not found' });
        }

        // Declare recipient credentials and token variables
        let recipientAccessToken: string | null = null;
        let senderAccessTokenForCheck: string | undefined;

        // Check if users are connected (unless this is a connection request)
        if (!isConnectionRequest) {
          try {
            const senderGoogleDriveAccounts = senderCredentials.credentials.googleDriveAccounts || 
              (senderCredentials.credentials.googleDrive ? [senderCredentials.credentials.googleDrive] : []);
            
            if (senderGoogleDriveAccounts.length === 0) {
              return res.status(403).json({ error: 'Only connections can message each other' });
            }

            const account = senderGoogleDriveAccounts[0];
            const accountId = this.extractAccountId(account);

            // Extract tokens directly from credentials (avoids duplicate DB queries)
            let senderAccessTokenForCheck: string;
            let fetchedRecipientAccessToken: string | null = null;
            
            try {
              senderAccessTokenForCheck = googleDriveProxyService.extractAccessTokenFromCredentials(
                senderCredentials.credentials,
                accountId
              );
            } catch (extractError: any) {
              // If extraction fails (e.g., token expired), fall back to getAccessToken which will refresh
              senderAccessTokenForCheck = await googleDriveProxyService.getAccessToken(fromPnIdentifier, accountId, [fromPnIdentifier]);
            }
            
            const recipientGoogleDriveAccounts = recipientCredentials?.credentials?.googleDriveAccounts || 
              (recipientCredentials?.credentials?.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
            const recipientAccount = recipientGoogleDriveAccounts?.[0];
            const recipientAccountId = recipientAccount ? this.extractAccountId(recipientAccount) : undefined;
            
            if (recipientAccountId && recipientCredentials?.credentials) {
              try {
                fetchedRecipientAccessToken = googleDriveProxyService.extractAccessTokenFromCredentials(
                  recipientCredentials.credentials,
                  recipientAccountId
                );
              } catch (extractError: any) {
                // If extraction fails, fall back to getAccessToken
                fetchedRecipientAccessToken = await googleDriveProxyService.getAccessToken(toPnIdentifier, recipientAccountId, [toPnIdentifier]);
              }
            }
            
            recipientAccessToken = fetchedRecipientAccessToken;
            
            // Use cached metadata folder ID if available (fast path)
            const senderCachedFolderIds = senderCredentials.credentials.cachedFolderIds || {};
            let metadataFolderId: string | undefined = senderCachedFolderIds.metadataFolderId;
            
            if (!metadataFolderId) {
              // Fallback: get metadata folder (slower)
              // Build token object for sender
              const senderAccountForMetadata = senderGoogleDriveAccounts[0];
              const senderTokenForMetadata = {
                access_token: senderAccountForMetadata.access_token || senderAccountForMetadata.accessToken,
                refresh_token: senderAccountForMetadata.refresh_token || senderAccountForMetadata.refreshToken,
                expires_at: senderAccountForMetadata.expires_at,
                expires_in: senderAccountForMetadata.expires_in
              };
              const senderAccountIdForMetadata = this.extractAccountId(senderAccountForMetadata);
              const metadataFolder = await this.getMetadataFolder(senderTokenForMetadata, fromPnIdentifier, senderAccountIdForMetadata);
              if (metadataFolder) {
                metadataFolderId = metadataFolder.metadataFolderId;
              }
            }
            
            if (metadataFolderId) {
              // Check if connected
              const areConnected = await ConnectionsService.areConnected(
                senderAccessTokenForCheck,
                metadataFolderId,
                fromPnIdentifier,
                toPnIdentifier
              );

              if (!areConnected) {
                return res.status(403).json({ 
                  error: 'Only connections can message each other',
                  requiresConnection: true
                });
              }
            }
          } catch (connectionCheckError: any) {
            // If connection check fails, still allow message (fail open for now)
            console.warn('Connection check failed, allowing message:', connectionCheckError?.message || connectionCheckError);
          }
        }

        // Record activity FIRST (source of truth)
        const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { MessagingLedgerService } = await import('./server/modules/messagingLedgerService');
        const { NotificationService } = await import('./server/modules/notificationService');
        
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();
        const threadId = [fromPnIdentifier, toPnIdentifier].sort().join('_');

        // Sender credentials already fetched above in connection check - reuse them
        if (!senderCredentials?.credentials) {
          return res.status(404).json({ error: 'Sender credentials not found' });
        }

        const senderGoogleDriveAccounts = senderCredentials.credentials.googleDriveAccounts || 
          (senderCredentials.credentials.googleDrive ? [senderCredentials.credentials.googleDrive] : []);
        
        if (senderGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Sender has no Google Drive connected' });
        }

        // Get full token objects (not just access token strings) for automatic refresh
        const senderAccount = senderGoogleDriveAccounts[0];
        const senderAccountId = this.extractAccountId(senderAccount);
        
        const senderToken = {
          access_token: senderAccount.access_token || senderAccount.accessToken,
          refresh_token: senderAccount.refresh_token || senderAccount.refreshToken,
          expires_at: senderAccount.expires_at,
          expires_in: senderAccount.expires_in
        };
        
        // Ensure recipient token is ready
        let recipientToken: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number } | null = null;
        if (!recipientAccessToken) {
          if (!recipientCredentials?.credentials) {
            return res.status(404).json({ error: 'Recipient credentials not found' });
          }
          const recipientGoogleDriveAccounts = recipientCredentials.credentials.googleDriveAccounts || 
            (recipientCredentials.credentials.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
          if (recipientGoogleDriveAccounts.length === 0) {
            return res.status(404).json({ error: 'Recipient has no Google Drive connected' });
          }
          const recipientAccount = recipientGoogleDriveAccounts[0];
          const recipientAccountId = recipientAccount ? this.extractAccountId(recipientAccount) : undefined;
          
          if (recipientAccountId) {
            recipientToken = {
              access_token: recipientAccount.access_token || recipientAccount.accessToken,
              refresh_token: recipientAccount.refresh_token || recipientAccount.refreshToken,
              expires_at: recipientAccount.expires_at,
              expires_in: recipientAccount.expires_in
            };
            recipientAccessToken = recipientToken.access_token;
          }
          
          if (!recipientToken || !recipientAccessToken) {
            return res.status(404).json({ error: 'Failed to get recipient access token' });
          }
        } else {
          // If we already have recipientAccessToken from connection check, build token object
          const recipientGoogleDriveAccounts = recipientCredentials?.credentials?.googleDriveAccounts || 
            (recipientCredentials?.credentials?.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
          const recipientAccount = recipientGoogleDriveAccounts?.[0];
          if (recipientAccount) {
            recipientToken = {
              access_token: recipientAccount.access_token || recipientAccount.accessToken || recipientAccessToken,
              refresh_token: recipientAccount.refresh_token || recipientAccount.refreshToken,
              expires_at: recipientAccount.expires_at,
              expires_in: recipientAccount.expires_in
            };
          }
        }
        
        // Use cached folder IDs first - these are static and never change
        const senderCachedFolderIds = senderCredentials.credentials.cachedFolderIds || {};
        let senderMetadataFolderId: string | undefined = senderCachedFolderIds.metadataFolderId;
        let senderPnFolderId: string | undefined = senderCachedFolderIds.pnFolderId;
        let senderMessagesFolderId: string | undefined = senderCachedFolderIds.messagesFolderId;

        if (!recipientCredentials?.credentials) {
          return res.status(404).json({ error: 'Recipient credentials not found' });
        }
        
        const recipientCachedFolderIds = recipientCredentials.credentials.cachedFolderIds || {};
        let recipientMetadataFolderId: string | undefined = recipientCachedFolderIds.metadataFolderId;
        let recipientPnFolderId: string | undefined = recipientCachedFolderIds.pnFolderId;
        let recipientMessagesFolderId: string | undefined = recipientCachedFolderIds.messagesFolderId;

        // Parallelize folder lookups if cache is missing
        const folderLookupPromises: Promise<any>[] = [];
        
        if (!senderMetadataFolderId || !senderPnFolderId) {
          folderLookupPromises.push(
            this.getMetadataFolder(senderToken, fromPnIdentifier, senderAccountId).then(senderMetadataFolder => {
              if (!senderMetadataFolder) {
                throw new Error('Sender metadata folder not found');
              }
              senderMetadataFolderId = senderMetadataFolder.metadataFolderId;
              senderPnFolderId = senderMetadataFolder.pnFolderId;
              // Cache the IDs for next time (async update)
              if (senderPnFolderId && senderMetadataFolderId) {
                const updatedCachedFolderIds = {
                  ...senderCachedFolderIds,
                  metadataFolderId: senderMetadataFolderId,
                  pnFolderId: senderPnFolderId
                };
                senderCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
                storageCredentialsService.upsertCredentials(fromPnIdentifier, senderCredentials.credentials).catch(err => {
                  console.warn('[SendMessage] Failed to cache sender folder IDs:', err?.message);
                });
              }
            }).catch((error: any) => {
              const errorMessage = error?.message || 'Unknown error';
              if (errorMessage.includes('authentication failed (401)') || errorMessage.includes('authentication failed (403)')) {
                throw new Error(`Google Drive authentication failed: ${errorMessage}`);
              }
              throw new Error(`Failed to access sender's Google Drive: ${errorMessage}`);
            })
          );
        }

        if (!recipientMetadataFolderId || !recipientPnFolderId) {
          folderLookupPromises.push(
            if (!recipientToken) {
              throw new Error('Recipient token not available');
            }
            const recipientAccountIdForMetadata = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
              ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
              : undefined;
            this.getMetadataFolder(recipientToken, toPnIdentifier, recipientAccountIdForMetadata).then(recipientMetadataFolder => {
              if (!recipientMetadataFolder) {
                throw new Error('Recipient metadata folder not found');
              }
              recipientMetadataFolderId = recipientMetadataFolder.metadataFolderId;
              recipientPnFolderId = recipientMetadataFolder.pnFolderId;
              // Cache the IDs for next time (async update)
              if (recipientPnFolderId && recipientMetadataFolderId && recipientCredentials?.credentials) {
                const updatedCachedFolderIds = {
                  ...recipientCachedFolderIds,
                  metadataFolderId: recipientMetadataFolderId,
                  pnFolderId: recipientPnFolderId
                };
                recipientCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
                storageCredentialsService.upsertCredentials(toPnIdentifier, recipientCredentials.credentials).catch(err => {
                  console.warn('[SendMessage] Failed to cache recipient folder IDs:', err?.message);
                });
              }
            }).catch((error: any) => {
              const errorMessage = error?.message || 'Unknown error';
              if (errorMessage.includes('authentication failed (401)') || errorMessage.includes('authentication failed (403)')) {
                throw new Error(`Google Drive authentication failed: ${errorMessage}`);
              }
              throw new Error(`Failed to access recipient's Google Drive: ${errorMessage}`);
            })
          );
        }

        // Wait for all folder lookups to complete
        if (folderLookupPromises.length > 0) {
          try {
            await Promise.all(folderLookupPromises);
          } catch (error: any) {
            const errorMessage = error?.message || 'Unknown error';
            if (errorMessage.includes('authentication failed')) {
              return res.status(401).json({ 
                error: 'Google Drive authentication failed',
                error_description: errorMessage
              });
            }
            if (errorMessage.includes('not found')) {
              return this.driveNotInitialized(res);
            }
            return res.status(500).json({ 
              error: 'Failed to access Google Drive',
              error_description: errorMessage
            });
          }
        }

        if (!senderPnFolderId || !recipientPnFolderId) {
          return res.status(500).json({ error: 'pN folder not found' });
        }

        // Get or create messages folders in parallel if cache is missing
        const messagesFolderPromises: Promise<any>[] = [];
        
        if (!senderMessagesFolderId) {
          messagesFolderPromises.push(
            MessageSheetsService.getOrCreateMessagesFolder(senderToken, senderPnFolderId, fromPnIdentifier, senderAccountId).then(folderId => {
              senderMessagesFolderId = folderId;
              // Cache messages folder ID for next time
              const updatedCachedFolderIds = {
                ...senderCachedFolderIds,
                messagesFolderId: folderId
              };
              senderCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
              storageCredentialsService.upsertCredentials(fromPnIdentifier, senderCredentials.credentials).catch(err => {
                console.warn('[SendMessage] Failed to cache sender messages folder ID:', err?.message);
              });
            })
          );
        }

        if (!recipientMessagesFolderId && recipientToken) {
          const recipientAccountId = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
            ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
            : undefined;
          messagesFolderPromises.push(
            MessageSheetsService.getOrCreateMessagesFolder(recipientToken, recipientPnFolderId, toPnIdentifier, recipientAccountId).then(folderId => {
              recipientMessagesFolderId = folderId;
              // Cache messages folder ID for next time
              if (recipientCredentials?.credentials) {
                const updatedCachedFolderIds = {
                  ...recipientCachedFolderIds,
                  messagesFolderId: folderId
                };
                recipientCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
                storageCredentialsService.upsertCredentials(toPnIdentifier, recipientCredentials.credentials).catch(err => {
                  console.warn('[SendMessage] Failed to cache recipient messages folder ID:', err?.message);
                });
              }
            })
          );
        }

        if (messagesFolderPromises.length > 0) {
          await Promise.all(messagesFolderPromises);
        }

        if (!senderMessagesFolderId || !recipientMessagesFolderId) {
          return res.status(500).json({ error: 'Messages folder not found' });
        }

        // Get conversation sheets in parallel (check cache first)
        const senderConversationSheets = senderCachedFolderIds.conversationSheets || {};
        let senderConversationSheetId: string | undefined = senderConversationSheets[toPnIdentifier];
        
        const recipientConversationSheets = recipientCachedFolderIds.conversationSheets || {};
        let recipientConversationSheetId: string | undefined = recipientConversationSheets[fromPnIdentifier];

        const conversationSheetPromises: Promise<any>[] = [];
        
        if (!senderConversationSheetId) {
          conversationSheetPromises.push(
            MessageSheetsService.getConversationSheet(senderToken, senderMessagesFolderId, toPnIdentifier, fromPnIdentifier, senderAccountId).then(sheetId => {
              senderConversationSheetId = sheetId;
              // Cache conversation sheet ID for next time
              const updatedConversationSheets = {
                ...senderConversationSheets,
                [toPnIdentifier]: sheetId
              };
              const updatedCachedFolderIds = {
                ...senderCachedFolderIds,
                conversationSheets: updatedConversationSheets
              };
              senderCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
              storageCredentialsService.upsertCredentials(fromPnIdentifier, senderCredentials.credentials).catch(err => {
                console.warn('[SendMessage] Failed to cache sender conversation sheet ID:', err?.message);
              });
            })
          );
        }

        if (!recipientConversationSheetId && recipientToken) {
          const recipientAccountId = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
            ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
            : undefined;
          conversationSheetPromises.push(
            MessageSheetsService.getConversationSheet(recipientToken, recipientMessagesFolderId, fromPnIdentifier, toPnIdentifier, recipientAccountId).then(sheetId => {
              recipientConversationSheetId = sheetId;
              // Cache conversation sheet ID for next time
              const updatedConversationSheets = {
                ...recipientConversationSheets,
                [fromPnIdentifier]: sheetId
              };
              if (recipientCredentials?.credentials) {
                const updatedCachedFolderIds = {
                  ...recipientCachedFolderIds,
                  conversationSheets: updatedConversationSheets
                };
                recipientCredentials.credentials.cachedFolderIds = updatedCachedFolderIds;
                storageCredentialsService.upsertCredentials(toPnIdentifier, recipientCredentials.credentials).catch(err => {
                  console.warn('[SendMessage] Failed to cache recipient conversation sheet ID:', err?.message);
                });
              }
            })
          );
        }

        if (conversationSheetPromises.length > 0) {
          await Promise.all(conversationSheetPromises);
        }

        if (!senderConversationSheetId || !recipientConversationSheetId) {
          return res.status(500).json({ error: 'Conversation sheet not found' });
        }

        // Try to get sharedSecret from inbox first (fastest path - no connections sheet lookup)
        const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
        let sharedSecret: string | undefined;
        let connectionId: string | undefined;
        
        try {
          // Use cached ID directly - getInboxSheet will return it immediately if provided
          const senderInboxSheetId = await MessageSheetsService.getInboxSheet(
            senderToken,
            senderMessagesFolderId!,
            fromPnIdentifier,
            senderAccountId,
            senderCachedFolderIds.inboxSheetId // Pass cached ID to skip search
          );
          const inboxConversations = await MessageSheetsService.getInboxConversations(
            senderToken,
            senderInboxSheetId,
            fromPnIdentifier,
            senderAccountId
          );
          const inboxEntry = inboxConversations.find(conv => conv.participantPnIdentifier === toPnIdentifier);
          if (inboxEntry?.sharedSecret && inboxEntry?.connectionId) {
            sharedSecret = inboxEntry.sharedSecret;
            connectionId = inboxEntry.connectionId;
            console.log('[SendMessage] Using sharedSecret from inbox cache (fast path)');
          }
        } catch (inboxError: any) {
          console.warn('[SendMessage] Failed to read inbox for sharedSecret, falling back to connections sheet:', inboxError?.message);
        }

        // Fallback: Look up connection from connections sheet if inbox doesn't have it
        if (!sharedSecret || !connectionId) {
          if (!senderMetadataFolderId) {
            return res.status(500).json({ error: 'Sender metadata folder not found' });
          }
          
          const connectionStatus = await ConnectionsService.getConnectionStatus(
            senderAccessToken,
            senderMetadataFolderId,
            fromPnIdentifier,
            toPnIdentifier
          );

          if (!connectionStatus.connectionId || connectionStatus.status !== 'connected') {
            return res.status(403).json({
              error: 'Connection not found. Users must be connected to send messages.',
              error_description: 'Connection not found. Users must be connected to send messages.'
            });
          }

          connectionId = connectionStatus.connectionId;

          // Get connection to retrieve shared secret - use Sheets directly
          const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
          const senderSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
            senderToken,
            senderMetadataFolderId,
            fromPnIdentifier,
            senderAccountId
          );
          
          // Get connection directly by connectionId (more efficient than loading all connections)
          const connection = await ConnectionsSheetsService.getConnectionById(
            senderToken,
            senderSpreadsheetId,
            connectionId,
            fromPnIdentifier,
            senderAccountId
          );
          if (!connection) {
            return res.status(500).json({
              error: 'Connection not found',
              error_description: `Connection ${connectionId} not found in connections sheet`
            });
          }

          // Auto-generate shared secret if missing (fallback for existing connections)
          sharedSecret = connection.sharedSecret;
          if (!sharedSecret) {
            console.log(`[SendMessage] Connection ${connectionId} missing shared secret, generating one`);
            const crypto = await import('crypto');
            const rawSecret = crypto.randomBytes(32).toString('base64');
            sharedSecret = MetadataEncryption.encryptField(rawSecret);
            
            // Update connection with shared secret
            if (!senderMetadataFolderId) {
              return res.status(500).json({ error: 'Sender metadata folder not found' });
            }
            const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
              senderToken,
              senderMetadataFolderId,
              fromPnIdentifier,
              senderAccountId
            );
            await ConnectionsSheetsService.updateConnectionStatus(
              senderToken,
              spreadsheetId,
              connectionId,
              connection.status,
              fromPnIdentifier,
              senderAccountId,
              connection.acceptedAt,
              sharedSecret
            );
            console.log(`[SendMessage] Generated and stored shared secret for connection ${connectionId}`);
          }
        }

        if (!sharedSecret || !connectionId) {
          return res.status(500).json({
            error: 'Failed to get connection data',
            error_description: 'Failed to get connection data'
          });
        }

        // Decrypt shared secret
        const decryptedSharedSecret = MetadataEncryption.decryptField(sharedSecret);
        if (!decryptedSharedSecret) {
          console.error(`[SendMessage] Failed to decrypt shared secret for connection ${connectionId}`);
          return res.status(500).json({
            error: 'Failed to decrypt shared secret',
            error_description: 'Failed to decrypt shared secret'
          });
        }

        console.log(`[SendMessage] Using connectionId: ${connectionId}, hasSharedSecret: ${!!decryptedSharedSecret}`);

        // Create message object
        const message: any = {
          messageId,
          fromPnIdentifier,
          toPnIdentifier,
          content,
          timestamp,
          read: false,
          mediaFileId
        };

        // Update inbox for sender (non-blocking - fire and forget)
        (async () => {
          try {
            // Use cached ID directly - getInboxSheet will return it immediately if provided
            const senderInboxSheetId = await MessageSheetsService.getInboxSheet(
              senderToken,
              senderMessagesFolderId!,
              fromPnIdentifier,
              senderAccountId,
              senderCachedFolderIds.inboxSheetId // Pass cached ID to skip search
            );
            await MessageSheetsService.updateInboxEntry(
              senderToken,
              senderInboxSheetId,
              toPnIdentifier,
              senderConversationSheetId!,
              connectionId,
              timestamp,
              fromPnIdentifier,
              senderAccountId,
              content.substring(0, 100), // Preview first 100 chars
              sharedSecret || '' // Encrypted shared secret
            );
            console.log('[SendMessage] Updated sender inbox');
          } catch (inboxError: any) {
            // Log but don't fail - inbox update is non-critical
            console.warn('[SendMessage] Failed to update sender inbox:', inboxError?.message);
          }
        })();

        // Record activity for sender (non-blocking - fire and forget)
        (async () => {
          try {
            await ActivityLedgerService.recordActivity(
              senderAccessToken,
              senderMetadataFolderId!,
              fromPnIdentifier,
              'message_sent',
              {
                targetType: 'message',
                targetPnIdentifier: messageId,
                actorPnIdentifier: fromPnIdentifier,
                metadata: { toPnIdentifier, threadId, content: content.substring(0, 100) }
              }
            );
          } catch (error: any) {
            console.warn('[SendMessage] Failed to record sender activity:', error?.message);
          }
        })();

        // Record messaging activity for sender (non-blocking - fire and forget)
        (async () => {
          try {
            await MessagingLedgerService.recordMessagingActivity(
              senderAccessToken,
              senderMetadataFolderId!,
              fromPnIdentifier,
              'message_sent',
              {
                fromPnIdentifier,
                toPnIdentifier,
                messageId,
                threadId,
                metadata: { content: content.substring(0, 100), mediaFileId }
              }
            );
          } catch (error: any) {
            console.warn('[SendMessage] Failed to record sender messaging activity:', error?.message);
          }
        })();

        // Get recipient's sharedSecret (try inbox first, fallback to connections sheet)
        let recipientSharedSecret: string | undefined;
        try {
          // Use cached ID directly - getInboxSheet will return it immediately if provided
          if (!recipientToken) {
            throw new Error('Recipient token not available');
          }
          const recipientAccountId = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
            ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
            : undefined;
          const recipientInboxSheetId = await MessageSheetsService.getInboxSheet(
            recipientToken,
            recipientMessagesFolderId!,
            toPnIdentifier,
            recipientAccountId,
            recipientCachedFolderIds.inboxSheetId // Pass cached ID to skip search
          );
          const recipientInboxConversations = await MessageSheetsService.getInboxConversations(
            recipientToken,
            recipientInboxSheetId,
            toPnIdentifier,
            recipientAccountId
          );
          const recipientInboxEntry = recipientInboxConversations.find(conv => conv.participantPnIdentifier === fromPnIdentifier);
          if (recipientInboxEntry?.sharedSecret) {
            recipientSharedSecret = recipientInboxEntry.sharedSecret;
            console.log('[SendMessage] Using recipient sharedSecret from inbox cache (fast path)');
          }
        } catch (recipientInboxError: any) {
          console.warn('[SendMessage] Failed to read recipient inbox for sharedSecret, falling back to connections sheet:', recipientInboxError?.message);
        }

        // Fallback: Get recipient's connection to retrieve shared secret - use Sheets directly
        if (!recipientSharedSecret) {
          if (!recipientMetadataFolderId) {
            return res.status(500).json({ error: 'Recipient metadata folder not found' });
          }
          const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
          if (!recipientToken) {
            return res.status(500).json({ error: 'Recipient token not available' });
          }
          const recipientAccountIdForConnection = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
            ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
            : undefined;
          const recipientSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
            recipientToken,
            recipientMetadataFolderId,
            toPnIdentifier,
            recipientAccountIdForConnection
          );
          
          // Get connection directly by connectionId (more efficient than loading all connections)
          const recipientConnection = await ConnectionsSheetsService.getConnectionById(
            recipientToken,
            recipientSpreadsheetId,
            connectionId,
            toPnIdentifier,
            recipientAccountIdForConnection
          );
          if (!recipientConnection) {
            return res.status(500).json({
              error: 'Recipient connection not found',
              error_description: `Connection ${connectionId} not found in recipient's connections sheet`
            });
          }

          // Ensure recipient has the same shared secret as sender
          recipientSharedSecret = recipientConnection.sharedSecret;
          if (!recipientSharedSecret || recipientSharedSecret !== sharedSecret) {
            // Recipient is missing shared secret or has a different one - sync from sender
            console.log(`[SendMessage] Recipient missing or mismatched shared secret, syncing from sender`);
            await ConnectionsSheetsService.updateConnectionStatus(
              recipientAccessToken,
              recipientSpreadsheetId,
              connectionId,
              recipientConnection.status,
              recipientConnection.acceptedAt,
              sharedSecret // Use sender's shared secret
            );
            recipientSharedSecret = sharedSecret;
            console.log(`[SendMessage] Synced shared secret to recipient's connection ${connectionId}`);
          }
        }

        if (!recipientSharedSecret) {
          return res.status(500).json({
            error: 'Failed to get recipient shared secret',
            error_description: 'Failed to get recipient shared secret'
          });
        }

        // Decrypt recipient's shared secret
        const recipientDecryptedSharedSecret = MetadataEncryption.decryptField(recipientSharedSecret);
        if (!recipientDecryptedSharedSecret) {
          console.error(`[SendMessage] Failed to decrypt recipient shared secret for connection ${connectionId}`);
          return res.status(500).json({
            error: 'Failed to decrypt recipient shared secret',
            error_description: 'Failed to decrypt recipient shared secret'
          });
        }

        // Verify both users have the same decrypted secret
        if (decryptedSharedSecret !== recipientDecryptedSharedSecret) {
          console.error(`[SendMessage] Shared secret mismatch! Sender: ${decryptedSharedSecret.substring(0, 10)}..., Recipient: ${recipientDecryptedSharedSecret.substring(0, 10)}...`);
          return res.status(500).json({
            error: 'Shared secret mismatch between users. Please reconnect.',
            error_description: 'Shared secret mismatch between users. Please reconnect.'
          });
        }

        // Append messages to both sheets in parallel
        console.log('[SendMessage] Appending messages to both sheets in parallel', { 
          senderSheetId: senderConversationSheetId, 
          recipientSheetId: recipientConversationSheetId, 
          messageId, 
          connectionId 
        });
        
        if (!recipientToken) {
          return res.status(500).json({ error: 'Recipient token not available' });
        }
        const recipientAccountIdForSend = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
          ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
          : undefined;
        
        await Promise.all([
          MessageSheetsService.appendMessage(
            senderToken,
            senderConversationSheetId!,
            message,
            connectionId,
            decryptedSharedSecret,
            fromPnIdentifier,
            senderAccountId
          ),
          MessageSheetsService.appendMessage(
            recipientToken,
            recipientConversationSheetId!,
            message,
            connectionId,
            recipientDecryptedSharedSecret,
            toPnIdentifier,
            recipientAccountIdForSend
          )
        ]);
        console.log('[SendMessage] Messages appended to both sheets successfully');

        // Update inbox for recipient (non-blocking - fire and forget)
        (async () => {
          try {
            // Use cached ID directly - getInboxSheet will return it immediately if provided
            if (!recipientToken) {
              throw new Error('Recipient token not available');
            }
            const recipientAccountIdForUpdate = recipientCredentials?.credentials?.googleDriveAccounts?.[0] 
              ? this.extractAccountId(recipientCredentials.credentials.googleDriveAccounts[0])
              : undefined;
            const recipientInboxSheetId = await MessageSheetsService.getInboxSheet(
              recipientToken,
              recipientMessagesFolderId!,
              toPnIdentifier,
              recipientAccountIdForUpdate,
              recipientCachedFolderIds.inboxSheetId // Pass cached ID to skip search
            );
            await MessageSheetsService.updateInboxEntry(
              recipientToken,
              recipientInboxSheetId,
              fromPnIdentifier,
              recipientConversationSheetId!,
              connectionId,
              timestamp,
              toPnIdentifier,
              recipientAccountIdForUpdate,
              content.substring(0, 100), // Preview first 100 chars
              recipientSharedSecret || '' // Encrypted shared secret
            );
            console.log('[SendMessage] Updated recipient inbox');
          } catch (inboxError: any) {
            // Log but don't fail - inbox update is non-critical
            console.warn('[SendMessage] Failed to update recipient inbox:', inboxError?.message);
          }
        })();

        // Record activity for recipient (non-blocking - fire and forget)
        (async () => {
          try {
            await ActivityLedgerService.recordActivity(
              recipientAccessToken,
              recipientMetadataFolderId!,
              toPnIdentifier,
              'message_received',
              {
                targetType: 'message',
                targetPnIdentifier: messageId,
                actorPnIdentifier: fromPnIdentifier,
                metadata: { fromPnIdentifier, threadId, content: content.substring(0, 100) }
              }
            );
          } catch (error: any) {
            console.warn('[SendMessage] Failed to record recipient activity:', error?.message);
          }
        })();

        // Record messaging activity for recipient (non-blocking - fire and forget)
        (async () => {
          try {
            await MessagingLedgerService.recordMessagingActivity(
              recipientAccessToken,
              recipientMetadataFolderId!,
              toPnIdentifier,
              'message_received',
              {
                fromPnIdentifier,
                toPnIdentifier,
                messageId,
                threadId,
                metadata: { content: content.substring(0, 100), mediaFileId }
              }
            );
          } catch (error: any) {
            console.warn('[SendMessage] Failed to record recipient messaging activity:', error?.message);
          }
        })();

        // Send notification to recipient (check preferences) - non-blocking
        if (recipientMetadataFolderId) {
          NotificationService.notifyNewMessage(
            recipientAccessToken,
            recipientMetadataFolderId,
            messageId,
            fromPnIdentifier,
            toPnIdentifier,
            threadId
          ).catch((notificationError: any) => {
            console.warn('Failed to send notification:', notificationError);
          });
        }

        return res.json({
          success: true,
          message: {
            messageId,
            fromPnIdentifier,
            toPnIdentifier,
            content,
            mediaFileId,
            timestamp,
            read: false,
            encrypted: true
          }
        });
      } catch (error: any) {
        const { fromPnIdentifier: reqFromPnIdentifier, toPnIdentifier: reqToPnIdentifier } = req.body || {};
        console.error('[SendMessage] Error sending message:', error);
        console.error('[SendMessage] Error stack:', error?.stack);
        console.error('[SendMessage] Error details:', {
          fromPnIdentifier: reqFromPnIdentifier,
          toPnIdentifier: reqToPnIdentifier,
          message: error?.message,
          name: error?.name,
          code: error?.code
        });
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to send message',
          error_description: error.message || 'Failed to send message',
          details: error?.stack ? 'Check server logs for details' : undefined
        });
      }
    });

    this.app.post('/api/messages/requests', async (req, res) => {
      try {
        const { fromPnIdentifier, toPnIdentifier, content } = req.body;
        if (!fromPnIdentifier || !toPnIdentifier || !content) {
          return res.status(400).json({ error: 'fromPnIdentifier, toPnIdentifier, and content are required' });
        }
        // TODO: Implement message request creation in Google Drive
        return res.json({
          success: true,
          request: {
            requestId: `req_${Date.now()}`,
            fromPnIdentifier,
            toPnIdentifier,
            content,
            timestamp: new Date().toISOString(),
            status: 'pending'
          }
        });
      } catch (error: any) {
        console.error('Error sending message request:', error);
        return res.status(500).json({
          error: 'Failed to send message request',
          error_description: error.message || 'Failed to send message request'
        });
      }
    });

    this.app.post('/api/messages/requests/:requestId/respond', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { userPnIdentifier, accept } = req.body;
        if (!requestId || !userPnIdentifier || typeof accept !== 'boolean') {
          return res.status(400).json({ error: 'requestId, userPnIdentifier, and accept are required' });
        }
        // TODO: Implement message request response in Google Drive
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error responding to message request:', error);
        return res.status(500).json({
          error: 'Failed to respond to message request',
          error_description: error.message || 'Failed to respond to message request'
        });
      }
    });

    this.app.post('/api/messages/:messageId/read', async (req, res) => {
      try {
        const { messageId } = req.params;
        const { userPnIdentifier, participantPnIdentifier } = req.body;
        if (!messageId || !userPnIdentifier) {
          return res.status(400).json({ error: 'messageId and userPnIdentifier are required' });
        }

        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Find user's pN folder
        const pnFolderName = `par Noir - ${pnIdentifier}`;
        const folderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const foldersResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
          { headers: { 'Authorization': `Bearer ${token.access_token}` } }
        );

        if (!foldersResponse.ok) {
          return res.status(500).json({ error: 'Failed to find user folder' });
        }

        const foldersData = await foldersResponse.json() as { files?: Array<{ id: string }> };
        const pnFolder = foldersData.files?.[0];
        if (!pnFolder) {
          return res.status(500).json({ error: 'User folder not found' });
        }

        // Get or create messages folder
        const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          pnFolder.id,
          pnIdentifier,
          accountId
        );

        // Get conversation sheet (need participantPnIdentifier to find the right sheet)
        if (!participantPnIdentifier) {
          return res.status(400).json({ error: 'participantPnIdentifier is required to mark message as read' });
        }

        // Use participantPnIdentifier directly (already normalized)
        const normalizedParticipantPnIdentifier = participantPnIdentifier;

        const conversationSheetId = await MessageSheetsService.getConversationSheet(
          token,
          messagesFolderId,
          normalizedParticipantPnIdentifier,
          pnIdentifier,
          accountId
        );

        // Mark message as read
        await MessageSheetsService.markAsRead(
          token,
          conversationSheetId,
          messageId,
          pnIdentifier,
          accountId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error marking message as read:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to mark message as read',
          error_description: error.message || 'Failed to mark message as read'
        });
      }
    });

    this.app.delete('/api/messages/:messageId', async (req, res) => {
      try {
        const { messageId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!messageId || !userPnIdentifier) {
          return res.status(400).json({ error: 'messageId and userPnIdentifier are required' });
        }
        // TODO: Implement message deletion from Google Drive
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error deleting message:', error);
        return res.status(500).json({
          error: 'Failed to delete message',
          error_description: error.message || 'Failed to delete message'
        });
      }
    });

    // DELETE /api/messages/conversation/:participantPnIdentifier - Delete conversation
    this.app.delete('/api/messages/conversation/:participantPnIdentifier', async (req, res) => {
      try {
        const { participantPnIdentifier } = req.params;
        const userPnIdentifier = req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier || !participantPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and participantPnIdentifier are required' });
        }

        const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          console.error('Error getting metadata folder:', error);
          // Check for authentication errors
          if (error.message?.includes('authentication failed') || 
              error?.response?.status === 401 || 
              error?.code === 401) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: 'Please reconnect your Google Drive account in the dashboard.'
            });
          }
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: error.message || 'Drive API error'
          });
        }

        // Find user's pN folder
        const pnFolderName = `par Noir - ${pnIdentifier}`;
        const folderQuery = `name='${pnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const foldersResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
          { headers: { 'Authorization': `Bearer ${token.access_token}` } }
        );

        if (!foldersResponse.ok) {
          return res.status(500).json({ error: 'Failed to find user folder' });
        }

        const foldersData = await foldersResponse.json() as { files?: Array<{ id: string }> };
        const pnFolder = foldersData.files?.[0];
        if (!pnFolder) {
          return res.status(500).json({ error: 'User folder not found' });
        }

        // Get or create messages folder
        const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
          token,
          pnFolder.id,
          pnIdentifier,
          accountId
        );

        // Use participantPnIdentifier directly (already normalized)
        const normalizedParticipantPnIdentifier = participantPnIdentifier;

        // Delete conversation sheet (use normalized)
        await MessageSheetsService.deleteConversation(
          token,
          messagesFolderId,
          normalizedParticipantPnIdentifier,
          pnIdentifier,
          accountId
        );

        // Remove from inbox
        try {
          const cachedFolderIds = userCredentials.credentials.cachedFolderIds || {};
          const inboxSheetId = await MessageSheetsService.getInboxSheet(
            token,
            messagesFolderId,
            pnIdentifier,
            accountId,
            cachedFolderIds.inboxSheetId // Pass cached ID to skip search
          );
          await MessageSheetsService.removeInboxEntry(
            token,
            inboxSheetId,
            normalizedParticipantPnIdentifier,
            pnIdentifier,
            accountId
          );
          console.log('[DeleteConversation] Removed from inbox');
        } catch (inboxError: any) {
          // Log but don't fail - inbox removal is non-critical
          console.warn('[DeleteConversation] Failed to remove from inbox:', inboxError?.message);
        }

        // Get connection ID to remove from connections sheet
        // Wrap in try-catch to ensure conversation deletion succeeds even if connection removal fails
        let connectionId: string | undefined;
        try {
          const connectionsFile = await ConnectionsService.getConnectionsFile(userAccessToken, metadataFolderId);
          if (connectionsFile) {
            // Normalize when searching (handles legacy data)
            const connection = connectionsFile.connections.find(c => {
              if (!c.userPnIdentifier) {
                console.warn('[DeleteConversation] Connection missing userPnIdentifier:', c);
                return false;
              }
              // Use pn identifier directly (already normalized)
              return c.userPnIdentifier === normalizedParticipantPnIdentifier;
            });
            
            if (connection) {
              connectionId = connection.connectionId;
              const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
              const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
                userAccessToken,
                metadataFolderId
              );
              await ConnectionsSheetsService.removeConnection(
                userAccessToken,
                spreadsheetId,
                connection.connectionId
              );
              console.log(`[DeleteConversation] Removed connection ${connection.connectionId} from user's connections sheet`);
            } else {
              console.warn(`[DeleteConversation] Connection not found for ${participantPnIdentifier}, conversation sheet deleted anyway`);
            }
          } else {
            console.warn(`[DeleteConversation] Connections file not found, conversation sheet deleted anyway`);
          }
        } catch (connectionError: any) {
          // Log error but don't fail the deletion - conversation sheet is already deleted
          console.error(`[DeleteConversation] Failed to remove connection from user's connections sheet:`, {
            participantPnIdentifier,
            error: connectionError?.message,
            status: connectionError?.response?.status
          });
          console.warn(`[DeleteConversation] Conversation sheet deleted, but connection removal failed. This is non-critical.`);
        }

        // Also remove connection from other user's connections sheet
        if (connectionId) {
          try {
            // Use normalized participantPnIdentifier
            const participantCredentials = await storageCredentialsService.getCredentials(normalizedParticipantPnIdentifier);
            
            if (participantCredentials?.credentials) {
              const participantGoogleDriveAccounts = participantCredentials.credentials.googleDriveAccounts || 
                (participantCredentials.credentials.googleDrive ? [participantCredentials.credentials.googleDrive] : []);
              
              if (participantGoogleDriveAccounts.length > 0) {
                const participantAccount = participantGoogleDriveAccounts[0];
                const participantAccountId = (participantAccount as any).backendId || (participantAccount as any).keyPrefix || (participantAccount as any).accountId || (participantAccount as any).id || undefined;
                // Build token object for participant
                const participantToken = {
                  access_token: participantAccount.access_token || participantAccount.accessToken,
                  refresh_token: participantAccount.refresh_token || participantAccount.refreshToken,
                  expires_at: participantAccount.expires_at,
                  expires_in: participantAccount.expires_in
                };
                
                try {
                  const participantMetadataFolder = await this.getMetadataFolder(participantToken, normalizedParticipantPnIdentifier, participantAccountId);
                  if (participantMetadataFolder) {
                    const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
                    const participantSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
                      participantAccessToken,
                      participantMetadataFolder.metadataFolderId
                    );
                    await ConnectionsSheetsService.removeConnection(
                      participantAccessToken,
                      participantSpreadsheetId,
                      connectionId
                    );
                    console.log(`[DeleteConversation] Removed connection ${connectionId} from other user's connections sheet`);
                  } else {
                    console.warn(`[DeleteConversation] Other user's metadata folder not found, connection removed from user's sheet only`);
                  }
                } catch (otherUserError: any) {
                  console.warn(`[DeleteConversation] Failed to remove connection from other user's connections sheet:`, {
                    participantPnIdentifier,
                    error: otherUserError?.message,
                    status: otherUserError?.response?.status
                  });
                  // Non-critical - connection removed from user's sheet, conversation deleted
                }
              } else {
                console.warn(`[DeleteConversation] Other user has no Google Drive connected, connection removed from user's sheet only`);
              }
            } else {
              console.warn(`[DeleteConversation] Other user's credentials not found, connection removed from user's sheet only`);
            }
          } catch (otherUserError: any) {
            console.warn(`[DeleteConversation] Failed to remove connection from other user's connections sheet:`, {
              participantPnIdentifier,
              error: otherUserError?.message
            });
            // Non-critical - connection removed from user's sheet, conversation deleted
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error deleting conversation:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to delete conversation',
          error_description: error.message || 'Failed to delete conversation'
        });
      }
    });

    // ============================================================================
    // Profile APIs
    // ============================================================================

    // POST /api/profile/image - Set profile image fileId
    this.app.post('/api/profile/image', async (req, res) => {
      try {
        const { userPnIdentifier, fileId } = req.body;
        if (!userPnIdentifier || !fileId) {
          return res.status(400).json({ error: 'userPnIdentifier and fileId are required' });
        }

        const { ProfileService } = await import('./server/modules/profileService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId);

        // Find metadata folder
        const folderQuery = `name='Metadata' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
        const folderResponse = await fetch(folderUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!folderResponse.ok) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }

        const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
        if (!folderData.files || folderData.files.length === 0) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }

        const metadataFolderId = folderData.files[0].id;

        // Update profile image (use normalized pnIdentifier)
        await ProfileService.updateProfileImage(
          userAccessToken,
          metadataFolderId,
          pnIdentifier,
          fileId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating profile image:', error);
        return res.status(500).json({
          error: 'Failed to update profile image',
          error_description: error.message || 'Failed to update profile image'
        });
      }
    });

    // POST /api/profile/display-name - Update display name
    this.app.post('/api/profile/display-name', async (req, res) => {
      try {
        const { userPnIdentifier, displayName } = req.body;
        if (!userPnIdentifier || !displayName) {
          return res.status(400).json({ error: 'userPnIdentifier and displayName are required' });
        }

        const { ProfileService } = await import('./server/modules/profileService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId);

        // Find metadata folder - try both '_metadata' and 'Metadata'
        let metadataFolderId: string | null = null;
        
        for (const folderName of ['_metadata', 'Metadata']) {
          const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
          const folderResponse = await fetch(folderUrl, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
          });

          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
            if (folderData.files && folderData.files.length > 0) {
              metadataFolderId = folderData.files[0].id;
              break;
            }
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found. Please ensure you have a folder named "_metadata" or "Metadata" in your Google Drive.' });
        }

        // Update display name in Google Drive
        await ProfileService.updateDisplayName(
          userAccessToken,
          metadataFolderId,
          pnIdentifier,
          displayName
        );

        // Also save to database for fast lookups
        const db = (await import('./server/utils/database')).getDatabasePool();
        await db.query(`
          INSERT INTO user_profiles (pn_identifier, display_name, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (pn_identifier) 
          DO UPDATE SET 
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
        `, [pnIdentifier, displayName]);

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating display name:', error);
        return res.status(500).json({
          error: 'Failed to update display name',
          error_description: error.message || 'Failed to update display name'
        });
      }
    });

    // GET /api/profile/:userPnIdentifier - Get user profile
    this.app.get('/api/profile/:userPnIdentifier', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ProfileService } = await import('./server/modules/profileService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const db = (await import('./server/utils/database')).getDatabasePool();

        // Use pn identifier directly (already normalized)
        const pnIdentifier = typeof req.params.userPnIdentifier === 'string' ? req.params.userPnIdentifier : String(req.params.userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        // First, try to get from database (fast lookup)
        const dbProfileResult = await db.query(`
          SELECT display_name, profile_image_file_id, updated_at
          FROM user_profiles
          WHERE pn_identifier = $1
        `, [pnIdentifier]);

        if (dbProfileResult.rows.length > 0) {
          const dbProfile = dbProfileResult.rows[0];
          // Log for debugging
          if (NODE_ENV === 'development') {
            console.log(`[Profile API] Retrieved profile from database for ${pnIdentifier}:`, {
              displayName: dbProfile.display_name || 'null',
              profileImageFileId: dbProfile.profile_image_file_id || 'null'
            });
          }
          return res.json({
            displayName: dbProfile.display_name || null,
            profileImageFileId: dbProfile.profile_image_file_id || null
          });
        }

        // Fallback to Google Drive if not in database
        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId);

        // Find metadata folder - try both '_metadata' and 'Metadata'
        let metadataFolderId: string | null = null;
        
        for (const folderName of ['_metadata', 'Metadata']) {
          const folderQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id)&pageSize=1`;
          const folderResponse = await fetch(folderUrl, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
          });

          if (folderResponse.ok) {
            const folderData = await folderResponse.json() as { files?: Array<{ id: string }> };
            if (folderData.files && folderData.files.length > 0) {
              metadataFolderId = folderData.files[0].id;
              break;
            }
          }
        }

        if (!metadataFolderId) {
          return res.json({ displayName: null, profileImageFileId: null });
        }

        const profile = await ProfileService.getProfile(userAccessToken, metadataFolderId);

        // If we got a profile from Google Drive, save it to database for next time
        if (profile?.displayName) {
          await db.query(`
            INSERT INTO user_profiles (pn_identifier, display_name, profile_image_file_id, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (pn_identifier) 
            DO UPDATE SET 
              display_name = EXCLUDED.display_name,
              profile_image_file_id = EXCLUDED.profile_image_file_id,
              updated_at = NOW()
          `, [pnIdentifier, profile.displayName, profile.profileImageFileId || null]);
        }

        // Log for debugging
        if (NODE_ENV === 'development') {
          console.log(`[Profile API] Retrieved profile from Google Drive for ${pnIdentifier}:`, {
            hasProfile: !!profile,
            displayName: profile?.displayName || 'null',
            profileImageFileId: profile?.profileImageFileId || 'null'
          });
        }

        return res.json({
          displayName: profile?.displayName || null,
          profileImageFileId: profile?.profileImageFileId || null
        });
      } catch (error: any) {
        console.error('Error getting profile:', error);
        return res.status(500).json({
          error: 'Failed to get profile',
          error_description: error.message || 'Failed to get profile'
        });
      }
    });

    // ============================================================================
    // Connections APIs
    // ============================================================================

    // POST /api/connections/request - Send connection request
    this.app.post('/api/connections/request', async (req, res) => {
      try {
        const { requesterPnIdentifier, recipientPnIdentifier } = req.body;
        if (!requesterPnIdentifier || !recipientPnIdentifier) {
          return res.status(400).json({ error: 'requesterPnIdentifier and recipientPnIdentifier are required' });
        }

        if (requesterPnIdentifier === recipientPnIdentifier) {
          return res.status(400).json({ error: 'Cannot connect to yourself' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        console.log(`[ConnectionRequest] Requester: ${requesterPnIdentifier}, Recipient: ${recipientPnIdentifier}`);
        
        // Get requester's credentials
        let requesterCredentials = await storageCredentialsService.getCredentials(requesterPnIdentifier);
        if (!requesterCredentials?.credentials) {
          // Credentials not found
          requesterCredentials = await storageCredentialsService.getCredentials(requesterPnIdentifier);
        }
        if (!requesterCredentials?.credentials) {
          console.error(`[ConnectionRequest] No credentials found for requester. Tried: ${requesterPnIdentifier}`);
          return res.status(404).json({ error: 'Requester credentials not found' });
        }
        console.log(`[ConnectionRequest] Found requester credentials under: ${requesterCredentials.identityId}`);

        const requesterGoogleDriveAccounts = requesterCredentials.credentials.googleDriveAccounts || 
          (requesterCredentials.credentials.googleDrive ? [requesterCredentials.credentials.googleDrive] : []);
        
        if (requesterGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Requester has no Google Drive connected' });
        }

        const requesterAccount = requesterGoogleDriveAccounts[0];
        // Try backendId first, then keyPrefix, then accountId/id for backward compatibility
        const requesterAccountId = (requesterAccount as any).backendId || (requesterAccount as any).keyPrefix || (requesterAccount as any).accountId || (requesterAccount as any).id || undefined;
        console.log(`[ConnectionRequest] Requester account structure:`, {
          backendId: (requesterAccount as any).backendId,
          keyPrefix: (requesterAccount as any).keyPrefix,
          accountId: (requesterAccount as any).accountId,
          id: (requesterAccount as any).id,
          usingAccountId: requesterAccountId
        });
        // Use requesterPnIdentifier (the pn identifier from request)
        let requesterAccessToken: string;
        try {
          requesterAccessToken = await googleDriveProxyService.getAccessToken(requesterPnIdentifier, requesterAccountId, [requesterPnIdentifier]);
        } catch (error: any) {
          console.error('[ConnectionRequest] Failed to get requester access token:', error);
          console.error('[ConnectionRequest] Requester details:', {
            identityId: requesterCredentials.identityId,
            accountId: requesterAccountId,
            hasCredentials: !!requesterCredentials.credentials,
            hasGoogleDriveAccounts: !!requesterCredentials.credentials?.googleDriveAccounts,
            googleDriveAccountsCount: requesterCredentials.credentials?.googleDriveAccounts?.length || 0
          });
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: error.message || 'Invalid Credentials',
            details: 'Failed to get requester Google Drive access token. Please ensure your Google Drive is connected in the dashboard.'
          });
        }

        // Get or create requester's metadata folder
        let requesterMetadataFolderId: string;
        try {
          // Create refresh function for retry on 401 - force refresh
          const refreshTokenFn = async () => {
            return await googleDriveProxyService.forceRefreshAccessToken(requesterPnIdentifier, requesterAccountId, [requesterPnIdentifier]);
          };
          
          // Build token object for requester
          const requesterAccount = requesterCredentials.credentials.googleDriveAccounts?.[0] || requesterCredentials.credentials.googleDrive;
          const requesterToken = {
            access_token: requesterAccount.access_token || requesterAccount.accessToken,
            refresh_token: requesterAccount.refresh_token || requesterAccount.refreshToken,
            expires_at: requesterAccount.expires_at,
            expires_in: requesterAccount.expires_in
          };
          // Use normalized requesterPnIdentifier
          const _g = await this.getMetadataFolder(requesterToken, requesterPnIdentifier, requesterAccountId);
          if (!_g) {
            return this.driveNotInitialized(res);
          }
          requesterMetadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          if (error.message?.includes('authentication failed') || error?.response?.status === 401 || error?.response?.status === 403) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message || `Google Drive API returned ${error?.response?.status || 'unknown error'}`
            });
          }
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: error.message || 'Drive API error'
          });
        }

        // Use recipientPnIdentifier directly (already normalized)
        console.log(`[ConnectionRequest] Recipient: ${recipientPnIdentifier}`);
        
        // Get recipient's credentials
        let recipientCredentials = await storageCredentialsService.getCredentials(recipientPnIdentifier);
        if (!recipientCredentials?.credentials) {
          console.error(`[ConnectionRequest] No credentials found for recipient: ${recipientPnIdentifier}`);
          return res.status(404).json({ error: 'Recipient credentials not found' });
        }
        console.log(`[ConnectionRequest] Found recipient credentials under: ${recipientCredentials.identityId}`);

        const recipientGoogleDriveAccounts = recipientCredentials.credentials.googleDriveAccounts || 
          (recipientCredentials.credentials.googleDrive ? [recipientCredentials.credentials.googleDrive] : []);
        
        if (recipientGoogleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Recipient has no Google Drive connected' });
        }

        const recipientAccount = recipientGoogleDriveAccounts[0];
        // Try backendId first, then keyPrefix, then accountId/id for backward compatibility
        const recipientAccountId = (recipientAccount as any).backendId || (recipientAccount as any).keyPrefix || (recipientAccount as any).accountId || (recipientAccount as any).id || undefined;
        console.log(`[ConnectionRequest] Recipient account structure:`, {
          backendId: (recipientAccount as any).backendId,
          keyPrefix: (recipientAccount as any).keyPrefix,
          accountId: (recipientAccount as any).accountId,
          id: (recipientAccount as any).id,
          usingAccountId: recipientAccountId
        });
        // Use recipientPnIdentifier (the pn identifier from request)
        let recipientAccessToken: string;
        try {
          recipientAccessToken = await googleDriveProxyService.getAccessToken(recipientPnIdentifier, recipientAccountId, [recipientPnIdentifier]);
        } catch (error: any) {
          console.error('[ConnectionRequest] Failed to get recipient access token:', error);
          console.error('[ConnectionRequest] Recipient details:', {
            identityId: recipientCredentials.identityId,
            accountId: recipientAccountId,
            hasCredentials: !!recipientCredentials.credentials,
            hasGoogleDriveAccounts: !!recipientCredentials.credentials?.googleDriveAccounts,
            googleDriveAccountsCount: recipientCredentials.credentials?.googleDriveAccounts?.length || 0
          });
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: error.message || 'Invalid Credentials',
            details: 'Failed to get recipient Google Drive access token. Please ensure the recipient has Google Drive connected in the dashboard.'
          });
        }

        // Get recipient's metadata folder
        let recipientMetadataFolderId: string;
        try {
          // Create refresh function for retry on 401 - force refresh
          const refreshTokenFn = async () => {
            return await googleDriveProxyService.forceRefreshAccessToken(recipientPnIdentifier, recipientAccountId, [recipientPnIdentifier]);
          };
          
          // Build token object for recipient
          const recipientAccount = recipientCredentials.credentials.googleDriveAccounts?.[0] || recipientCredentials.credentials.googleDrive;
          const recipientTokenForMetadata = {
            access_token: recipientAccount.access_token || recipientAccount.accessToken,
            refresh_token: recipientAccount.refresh_token || recipientAccount.refreshToken,
            expires_at: recipientAccount.expires_at,
            expires_in: recipientAccount.expires_in
          };
          // Use normalized recipientPnIdentifier
          const _g = await this.getMetadataFolder(recipientTokenForMetadata, recipientPnIdentifier, recipientAccountId);
          if (!_g) {
            return this.driveNotInitialized(res);
          }
          recipientMetadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          if (error.message?.includes('authentication failed') || error?.response?.status === 401 || error?.response?.status === 403) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message || `Google Drive API returned ${error?.response?.status || 'unknown error'}`
            });
          }
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: error.message || 'Drive API error'
          });
        }

        // Send connection request (pass normalized pn-identifiers)
        let connection;
        try {
          connection = await ConnectionsService.sendConnectionRequest(
            requesterAccessToken,
            requesterMetadataFolderId,
            requesterPnIdentifier,
            recipientAccessToken,
            recipientMetadataFolderId,
            recipientPnIdentifier
          );
        } catch (connectionError: any) {
          console.error('[ConnectionRequest] Error in ConnectionsService.sendConnectionRequest:', connectionError);
          return res.status(500).json({
            error: 'Failed to send connection request',
            error_description: connectionError.message || 'Failed to create connection in Google Drive'
          });
        }

        // Validate connection was created
        if (!connection || !connection.connectionId) {
          console.error('[ConnectionRequest] Connection created but missing connectionId:', connection);
          return res.status(500).json({
            error: 'Connection request created but missing connectionId',
            error_description: 'Failed to get connection ID from created connection'
          });
        }

        // Record activity and send notification with separate error handling for each operation
        const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
        const { NotificationService } = await import('./server/modules/notificationService');
        
        // Record activity for requester (using pnIdentifier from credentials)
        try {
          await ActivityLedgerService.recordActivity(
            requesterAccessToken,
            requesterMetadataFolderId,
            requesterCredentials.identityId,
            'connection_request',
            {
              targetType: 'user',
              targetPnIdentifier: recipientPnIdentifier, // Use normalized
              metadata: { connectionId: connection.connectionId }
            }
          );
          console.log(`[ConnectionRequest] Activity recorded for requester: ${requesterCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to record activity for requester ${requesterCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier, 
            requesterIdentityId: requesterCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        // Record activity for recipient (use normalized pn-identifier)
        try {
          await ActivityLedgerService.recordActivity(
            recipientAccessToken,
            recipientMetadataFolderId,
            recipientPnIdentifier, // Use normalized pn-identifier
            'connection_request',
            {
              targetType: 'user',
              targetPnIdentifier: requesterPnIdentifier,
              actorPnIdentifier: requesterPnIdentifier,
              metadata: { connectionId: connection.connectionId }
            }
          );
          console.log(`[ConnectionRequest] Activity recorded for recipient: ${recipientCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to record activity for recipient ${recipientCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier: recipientCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        // Send notification to recipient (use normalized DIDs)
        try {
          await NotificationService.notifyConnectionRequest(
            recipientAccessToken,
            recipientMetadataFolderId,
            connection.connectionId,
            requesterPnIdentifier,
            recipientPnIdentifier
          );
          console.log(`[ConnectionRequest] Notification sent to recipient: ${recipientCredentials.identityId}`);
        } catch (error: any) {
          console.error(`[ConnectionRequest] Failed to send notification to recipient ${recipientCredentials.identityId}:`, error);
          console.error(`[ConnectionRequest] Error details:`, { 
            connectionId: connection.connectionId, 
            requesterPnIdentifier, 
            recipientPnIdentifier: recipientCredentials.identityId,
            error: error.message, 
            stack: error.stack 
          });
          // Continue - don't fail the request
        }

        return res.json({
          success: true,
          connection
        });
      } catch (error: any) {
        console.error('Error sending connection request:', error);
        console.error('Error stack:', error.stack);
        return res.status(500).json({
          error: 'Failed to send connection request',
          error_description: error.message || 'Failed to send connection request',
          details: error.stack ? error.stack.substring(0, 500) : undefined
        });
      }
    });

    // POST /api/connections/:connectionId/accept - Accept connection request
    this.app.post('/api/connections/:connectionId/accept', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        // Use normalized pn identifier for access token retrieval
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: error.message || 'Drive API error'
          });
        }

        // Get connection to find other user
        const connectionsFile = await ConnectionsService.getConnectionsFile(userAccessToken, metadataFolderId);
        if (!connectionsFile) {
          console.error(`[AcceptConnection] Connections file not found for user: ${pnIdentifier}`);
          return res.status(404).json({ error: 'Connection request not found' });
        }

        console.log(`[AcceptConnection] Looking for connection ${connectionId} in user's connections file`);
        console.log(`[AcceptConnection] User has ${connectionsFile.connections.length} connections:`, 
          connectionsFile.connections.map(c => ({
            connectionId: c.connectionId,
            userPnIdentifier: c.userPnIdentifier,
            status: c.status
          }))
        );

        // Find connection - prioritize pending_received, but also check for pending_sent (mutual request scenario)
        const allMatchingConnections = connectionsFile.connections.filter(c => c.connectionId === connectionId);
        console.log(`[AcceptConnection] Found ${allMatchingConnections.length} connections with ID ${connectionId}:`, 
          allMatchingConnections.map(c => ({ userPnIdentifier: c.userPnIdentifier, status: c.status }))
        );

        // Prioritize pending_received connection (the one we want to accept)
        let connection = allMatchingConnections.find(c => c.status === 'pending_received');
        
        // If no pending_received found, but there's a pending_sent, it means the recipient sent a request first
        // In this case, we should accept their own request and update the other user's file
        if (!connection && allMatchingConnections.length > 0) {
          connection = allMatchingConnections.find(c => c.status === 'pending_sent');
          if (connection) {
            console.log(`[AcceptConnection] Found pending_sent connection - this is a mutual request scenario`);
            console.log(`[AcceptConnection] Will accept by updating both users' files to accepted status`);
          }
        }

        if (!connection) {
          console.error(`[AcceptConnection] Connection ${connectionId} not found in user's connections file`);
          console.error(`[AcceptConnection] Available connections:`,           connectionsFile.connections.map(c => ({
            connectionId: c.connectionId,
            userPnIdentifier: c.userPnIdentifier,
            status: c.status
          })));
          return res.status(404).json({ error: 'Connection request not found' });
        }

        console.log(`[AcceptConnection] Found connection:`, {
          connectionId: connection.connectionId,
          userPnIdentifier: connection.userPnIdentifier,
          status: connection.status,
          expectedStatus: 'pending_received'
        });

        // Check status - allow accepting if it's pending_received, pending_sent (mutual request), or already accepted (idempotent)
        if (connection.status === 'accepted') {
          // Already accepted - but check if it has a shared secret
          if (!connection.sharedSecret) {
            console.log(`[AcceptConnection] Connection already accepted but missing shared secret, generating one`);
            // Generate shared secret for existing accepted connection
            const crypto = await import('crypto');
            const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
            const rawSecret = crypto.randomBytes(32).toString('base64');
            const sharedSecret = MetadataEncryption.encryptField(rawSecret);
            
            // Update with shared secret
            const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
            const spreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
              userAccessToken,
              metadataFolderId
            );
            await ConnectionsSheetsService.updateConnectionStatus(
              userAccessToken,
              spreadsheetId,
              connectionId,
              'accepted',
              connection.acceptedAt,
              sharedSecret
            );
            
            // Also update other user's connection with the same secret
            // Normalize connection.userPnIdentifier when reading (handles legacy data)
            if (!connection.userPnIdentifier) {
              console.error('[AcceptConnection] Connection missing userPnIdentifier, cannot update other user:', connection);
              throw new Error('Connection missing userPnIdentifier');
            }
            const otherUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : `pn-${connection.userPnIdentifier}`;
            connection.userPnIdentifier = otherUserPnIdentifier;
            const otherUserCredentials = await storageCredentialsService.getCredentials(otherUserPnIdentifier);
            if (otherUserCredentials?.credentials) {
              const otherGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
                (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
              if (otherGoogleDriveAccounts.length > 0) {
                const otherAccount = otherGoogleDriveAccounts[0];
                const otherAccountId = (otherAccount as any).backendId || (otherAccount as any).keyPrefix || (otherAccount as any).accountId || (otherAccount as any).id || undefined;
                // Build token object for other user
                const otherToken = {
                  access_token: otherAccount.access_token || otherAccount.accessToken,
                  refresh_token: otherAccount.refresh_token || otherAccount.refreshToken,
                  expires_at: otherAccount.expires_at,
                  expires_in: otherAccount.expires_in
                };
                const otherAccessToken = otherToken.access_token; // Keep for backward compatibility
                const otherMetadataFolder = await this.getMetadataFolder(otherToken, otherUserPnIdentifier, otherAccountId);
                if (otherMetadataFolder) {
                  // Use normalized pn-identifiers (pnIdentifier was normalized at start of function)
                  await ConnectionsService.updateOtherUserConnectionStatus(
                    otherAccessToken,
                    otherMetadataFolder.metadataFolderId,
                    otherUserPnIdentifier, // Use normalized
                    connectionId,
                    'accepted',
                    pnIdentifier, // Use normalized pn-identifier from start of function
                    sharedSecret
                  );
                }
              }
            }
            
            console.log(`[AcceptConnection] Generated and stored shared secret for existing accepted connection ${connectionId}`);
          }
          console.log(`[AcceptConnection] Connection already accepted, returning success`);
          return res.json({ success: true, message: 'Connection already accepted' });
        }

        // Allow accepting pending_sent connections (mutual request scenario)
        // In this case, both users sent requests, so accepting either one should connect them
        if (connection.status === 'pending_sent') {
          console.log(`[AcceptConnection] Accepting pending_sent connection (mutual request scenario)`);
          // We'll treat this as accepting the connection - update both files to accepted
        } else if (connection.status !== 'pending_received') {
          console.error(`[AcceptConnection] Connection status is '${connection.status}', expected 'pending_received' or 'pending_sent'`);
          return res.status(400).json({ 
            error: 'Connection request is not in pending_received status',
            error_description: `Current status: ${connection.status}. Only pending_received or pending_sent connections can be accepted.`
          });
        }

        // Normalize connection.userPnIdentifier when reading (handles legacy data)
        if (!connection.userPnIdentifier) {
          console.error('[AcceptConnection] Connection missing userPnIdentifier:', connection);
          throw new Error('Connection missing userPnIdentifier');
        }
        const otherUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : `pn-${connection.userPnIdentifier}`;
        connection.userPnIdentifier = otherUserPnIdentifier;

        // Record activity FIRST (use normalized DIDs)
        const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
        
        await ActivityLedgerService.recordActivity(
          userAccessToken,
          metadataFolderId,
          pnIdentifier, // Use normalized pn-identifier
          'connection_accepted',
          {
            targetType: 'user',
            targetPnIdentifier: otherUserPnIdentifier,
            metadata: { connectionId }
          }
        );

        // Accept connection (updates acceptor's sheet and generates shared secret)
        const sharedSecret = await ConnectionsService.acceptConnectionRequest(
          userAccessToken,
          metadataFolderId,
          pnIdentifier, // Use normalized pn-identifier
          connectionId
        );

        if (!sharedSecret) {
          return res.status(500).json({
            error: 'Shared secret not generated',
            error_description: 'Connection accepted but shared secret was not generated'
          });
        }

        // Get connection details from acceptor's sheet for syncing to other user
        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const acceptorSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
          userAccessToken,
          metadataFolderId
        );
        const acceptorConnection = await ConnectionsSheetsService.getConnectionById(
          userAccessToken,
          acceptorSpreadsheetId,
          connectionId
        );
        const acceptedAt = acceptorConnection?.acceptedAt || new Date().toISOString();
        const createdAt = acceptorConnection?.createdAt || new Date().toISOString();

        // Get other user's credentials (requester) - required for syncing shared secret
        // Use normalized pn-identifier only (no fallback to original DID)
        const otherUserCredentials = await storageCredentialsService.getCredentials(otherUserPnIdentifier);

        if (!otherUserCredentials?.credentials) {
          return res.status(500).json({
            error: 'Other user credentials not found',
            error_description: 'Cannot sync shared secret - other user\'s credentials not found'
          });
        }

        const otherGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
          (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
        
        if (otherGoogleDriveAccounts.length === 0) {
          return res.status(500).json({
            error: 'Other user has no Google Drive connected',
            error_description: 'Cannot sync shared secret - other user has no Google Drive account'
          });
        }

        const otherAccount = otherGoogleDriveAccounts[0];
        const otherAccountId = this.extractAccountId(otherAccount);
        
        // Get full token object for other user (not just access token string) for automatic refresh
        const otherToken = {
          access_token: otherAccount.access_token || otherAccount.accessToken,
          refresh_token: otherAccount.refresh_token || otherAccount.refreshToken,
          expires_at: otherAccount.expires_at,
          expires_in: otherAccount.expires_in
        };
        const otherAccessToken = otherToken.access_token; // Keep for backward compatibility in this endpoint
        
        const otherMetadataFolder = await this.getMetadataFolder(otherToken, otherUserPnIdentifier, otherAccountId);
        if (!otherMetadataFolder) {
          return res.status(500).json({
            error: 'Failed to access other user\'s metadata folder',
            error_description: 'Cannot sync shared secret - other user\'s metadata folder not accessible'
          });
        }
        const otherMetadataFolderId = otherMetadataFolder.metadataFolderId;

        // Sync shared secret to other user's connection record - this MUST succeed
        const otherSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
          otherAccessToken,
          otherMetadataFolderId
        );
        
        // Get other user's connection to check current status (more efficient than loading all connections)
        const otherConnection = await ConnectionsSheetsService.getConnectionById(
          otherAccessToken,
          otherSpreadsheetId,
          connectionId
        );
        
        if (otherConnection) {
          // Update other user's connection to accepted with shared secret
          await ConnectionsSheetsService.updateConnectionStatus(
            otherAccessToken,
            otherSpreadsheetId,
            connectionId,
            'accepted',
            acceptedAt,
            sharedSecret
          );
        } else {
          // Other user doesn't have this connection - add it
          await ConnectionsSheetsService.addConnection(
            otherAccessToken,
            otherSpreadsheetId,
            {
              connectionId,
              userPnIdentifier: pnIdentifier, // Use normalized pn-identifier
              status: 'accepted',
              createdAt,
              acceptedAt,
              sharedSecret
            }
          );
        }

        // Send notification and record activity for requester
        if (otherAccessToken && otherMetadataFolderId && otherUserCredentials?.credentials) {
          try {
            const { NotificationService } = await import('./server/modules/notificationService');

            await ActivityLedgerService.recordActivity(
              otherAccessToken,
              otherMetadataFolderId,
              otherUserPnIdentifier, // Use normalized pn-identifier
              'connection_accepted',
              {
                targetType: 'user',
                targetPnIdentifier: pnIdentifier, // Use normalized pn-identifier
                actorPnIdentifier: pnIdentifier, // Use normalized pn-identifier
                metadata: { connectionId }
              }
            );

            await NotificationService.notifyConnectionAccepted(
              otherAccessToken,
              otherMetadataFolderId,
              connectionId,
              pnIdentifier, // Use normalized pn-identifier
              otherUserPnIdentifier // Use normalized pn-identifier
            );
          } catch (otherUserActivityError: any) {
            console.warn('Failed to record activity/notification for other user:', otherUserActivityError);
          }
        }

        // Create conversation sheets for both users when connection is accepted
        // Note: connectionId and sharedSecret are available from the outer scope
        try {
          const { MessageSheetsService } = await import('./server/modules/messageSheetsService');
          const { ProfileService } = await import('./server/modules/profileService');
          const { MetadataEncryption } = await import('./server/utils/metadataEncryption');
          
          // Get display names for the system message
          // Acceptor is the user accepting (user B), Requester is the user who sent the request (user A)
          let acceptorDisplayName = userCredentials.identityId.substring(0, 8);
          let requesterDisplayName = otherUserPnIdentifier.substring(0, 8);
          
          // Ensure connectionId and sharedSecret are available for system messages
          if (!connectionId) {
            console.warn('[AcceptConnection] No connectionId available for system messages');
            return res.json({ success: true });
          }
          
          // Decrypt shared secret for restoration
          let decryptedSharedSecret: string | undefined;
          if (sharedSecret) {
            try {
              decryptedSharedSecret = MetadataEncryption.decryptField(sharedSecret);
            } catch (e) {
              console.warn('[AcceptConnection] Failed to decrypt shared secret for restoration:', e);
            }
          }
          
          try {
            const acceptorProfile = await ProfileService.getProfileFile(userAccessToken, metadataFolderId);
            if (acceptorProfile?.displayName) {
              acceptorDisplayName = acceptorProfile.displayName;
            }
          } catch (e) {
            // Use short identifier if profile not found
          }
          
          // Get requester's credentials and profile if available
          let otherAccessToken: string | null = null;
          let otherMetadataFolderId: string | null = null;
          
          if (otherUserCredentials?.credentials) {
            const otherGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
              (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
            
            if (otherGoogleDriveAccounts.length > 0) {
              const otherAccount = otherGoogleDriveAccounts[0];
              const otherAccountId = this.extractAccountId(otherAccount);
              
              // Get full token object for other user (not just access token string) for automatic refresh
              const otherTokenForProfile = {
                access_token: otherAccount.access_token || otherAccount.accessToken,
                refresh_token: otherAccount.refresh_token || otherAccount.refreshToken,
                expires_at: otherAccount.expires_at,
                expires_in: otherAccount.expires_in
              };
              otherAccessToken = otherTokenForProfile.access_token; // Keep for backward compatibility
              
              try {
                const _g = await this.getMetadataFolder(otherTokenForProfile, otherUserPnIdentifier, otherAccountId);
                if (_g) {
                  otherMetadataFolderId = _g.metadataFolderId;
                } else {
                  console.warn(`[AcceptConnection] Other user's metadata folder not found, continuing anyway`);
                }
              } catch (error: any) {
                console.warn(`[AcceptConnection] Failed to get other user's metadata folder, continuing anyway:`, error.message);
                // Continue even if we can't access other user's folder
              }
              
              if (otherMetadataFolderId) {
                try {
                  const requesterProfile = await ProfileService.getProfileFile(otherAccessToken, otherMetadataFolderId);
                  if (requesterProfile?.displayName) {
                    requesterDisplayName = requesterProfile.displayName;
                  }
                } catch (e) {
                  // Use short identifier if profile not found
                }
              }
            }
          }

          // Find acceptor's pN folder
          const acceptorPnFolderName = `par Noir - ${userCredentials.identityId}`;
          const acceptorFolderQuery = `name='${acceptorPnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const acceptorFoldersResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(acceptorFolderQuery)}&fields=files(id,name)`,
            { headers: { 'Authorization': `Bearer ${userAccessToken}` } }
          );

          if (acceptorFoldersResponse.ok) {
            const acceptorFoldersData = await acceptorFoldersResponse.json() as { files?: Array<{ id: string }> };
            const acceptorPnFolder = acceptorFoldersData.files?.[0];
            
            if (acceptorPnFolder) {
              // Get or create messages folder for acceptor
              const acceptorMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                token,
                acceptorPnFolder.id,
                pnIdentifier,
                accountId
              );

              // Check if acceptor's conversation file exists, if not create
              let acceptorConversationSheetId: string;
              try {
                // Try to get existing conversation sheet (if reconnecting after deletion)
                acceptorConversationSheetId = await MessageSheetsService.getConversationSheet(
                  token,
                  acceptorMessagesFolderId,
                  otherUserPnIdentifier,
                  pnIdentifier,
                  accountId
                );
                
                // Check if the sheet is empty (only has header) - if so, try to restore
                const { google } = await import('googleapis');
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: userAccessToken });
                const sheets = google.sheets({ version: 'v4', auth });
                const existingMessages = await sheets.spreadsheets.values.get({
                  spreadsheetId: acceptorConversationSheetId,
                  range: 'Messages!A2:F'
                });
                
                // If sheet is empty or doesn't exist, and we have other user's access, try to restore
                if ((!existingMessages.data.values || existingMessages.data.values.length === 0) && 
                    otherAccessToken && otherMetadataFolderId && decryptedSharedSecret && otherUserCredentials) {
                  try {
                    // Find other user's pN folder
                    const otherPnFolderName = `par Noir - ${otherUserCredentials.identityId}`;
                    const otherFolderQuery = `name='${otherPnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const otherFoldersResponse = await fetch(
                      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(otherFolderQuery)}&fields=files(id,name)`,
                      { headers: { 'Authorization': `Bearer ${otherAccessToken}` } }
                    );
                    
                    if (otherFoldersResponse.ok) {
                      const otherFoldersData = await otherFoldersResponse.json() as { files?: Array<{ id: string }> };
                      const otherPnFolder = otherFoldersData.files?.[0];
                      
                      if (otherPnFolder) {
                        const otherMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                          otherToken,
                          otherPnFolder.id,
                          otherUserPnIdentifier,
                          otherAccountId
                        );
                        
                        // Try to restore conversation from other user
                        acceptorConversationSheetId = await MessageSheetsService.restoreConversationFromOtherUser(
                          token,
                          acceptorMessagesFolderId,
                          otherToken,
                          otherMessagesFolderId,
                          otherUserPnIdentifier,
                          connectionId,
                          decryptedSharedSecret,
                          pnIdentifier,
                          accountId,
                          otherUserPnIdentifier,
                          otherAccountId
                        );
                        console.log(`[AcceptConnection] Restored acceptor's conversation from other user`);
                      }
                    }
                  } catch (restoreError: any) {
                    console.warn(`[AcceptConnection] Failed to restore acceptor's conversation, continuing with empty sheet:`, restoreError.message);
                  }
                }
              } catch (error: any) {
                // First connection or re-connection after deletion - create new sheet
                if (error?.message?.includes('not found')) {
                  acceptorConversationSheetId = await MessageSheetsService.createConversationSheet(
                    token,
                    acceptorMessagesFolderId,
                    otherUserPnIdentifier,
                    pnIdentifier,
                    accountId
                  );
                } else {
                  throw error;
                }
              }

              // Add initial system message to acceptor's conversation
              // System messages don't need encryption - use empty connectionId and sharedSecret
              const systemMessageId = crypto.randomUUID();
              const now = new Date().toISOString();
              const systemMessageContent = `${acceptorDisplayName} accepted ${requesterDisplayName}'s connection request`;
              await MessageSheetsService.appendMessage(
                token,
                acceptorConversationSheetId,
                {
                  messageId: systemMessageId,
                  fromPnIdentifier: 'system',
                  toPnIdentifier: userCredentials.identityId,
                  content: systemMessageContent,
                  timestamp: now,
                  read: false
                },
                connectionId, // Use the connection ID
                sharedSecret || '', // Use the shared secret if available
                pnIdentifier,
                accountId
              );

              // Update inbox for acceptor
              try {
                const acceptorCachedFolderIds = userCredentials.credentials.cachedFolderIds || {};
                const acceptorInboxSheetId = await MessageSheetsService.getInboxSheet(
                  token,
                  acceptorMessagesFolderId,
                  pnIdentifier,
                  accountId,
                  acceptorCachedFolderIds.inboxSheetId // Pass cached ID to skip search
                );
                await MessageSheetsService.updateInboxEntry(
                  token,
                  acceptorInboxSheetId,
                  otherUserPnIdentifier,
                  acceptorConversationSheetId,
                  connectionId,
                  now,
                  pnIdentifier,
                  accountId,
                  systemMessageContent,
                  sharedSecret // Encrypted shared secret
                );
                console.log('[AcceptConnection] Updated acceptor inbox');
              } catch (inboxError: any) {
                console.warn('[AcceptConnection] Failed to update acceptor inbox:', inboxError?.message);
              }
            }
          }

          // Find requester's pN folder and create conversation (if we have their credentials)
          if (otherAccessToken && otherMetadataFolderId && otherUserCredentials?.credentials) {
            const requesterPnFolderName = `par Noir - ${otherUserCredentials.identityId}`;
            const requesterFolderQuery = `name='${requesterPnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const requesterFoldersResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(requesterFolderQuery)}&fields=files(id,name)`,
              { headers: { 'Authorization': `Bearer ${otherAccessToken}` } }
            );

            if (requesterFoldersResponse.ok) {
              const requesterFoldersData = await requesterFoldersResponse.json() as { files?: Array<{ id: string }> };
              const requesterPnFolder = requesterFoldersData.files?.[0];
              
              if (requesterPnFolder) {
                // Get or create messages folder for requester
                const requesterMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                  otherToken,
                  requesterPnFolder.id,
                  otherUserPnIdentifier,
                  otherAccountId
                );

                // Check if requester's conversation file exists, if not try to restore from acceptor
                let requesterConversationSheetId: string;
                try {
                  // Try to get existing conversation sheet (use normalized pnIdentifier)
                  requesterConversationSheetId = await MessageSheetsService.getConversationSheet(
                    otherToken,
                    requesterMessagesFolderId,
                    pnIdentifier,
                    otherUserPnIdentifier,
                    otherAccountId
                  );
                  
                  // Check if the sheet is empty (only has header) - if so, try to restore
                  const { google } = await import('googleapis');
                  const otherAuth = new google.auth.OAuth2();
                  otherAuth.setCredentials({ access_token: otherAccessToken });
                  const otherSheets = google.sheets({ version: 'v4', auth: otherAuth });
                  const existingMessages = await otherSheets.spreadsheets.values.get({
                    spreadsheetId: requesterConversationSheetId,
                    range: 'Messages!A2:F'
                  });
                  
                  // If sheet is empty or doesn't exist, and we have acceptor's access, try to restore
                  if ((!existingMessages.data.values || existingMessages.data.values.length === 0) && 
                      userAccessToken && decryptedSharedSecret) {
                    try {
                      // Find acceptor's pN folder
                      const acceptorPnFolderName = `par Noir - ${userCredentials.identityId}`;
                      const acceptorFolderQuery = `name='${acceptorPnFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                      const acceptorFoldersResponse = await fetch(
                        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(acceptorFolderQuery)}&fields=files(id,name)`,
                        { headers: { 'Authorization': `Bearer ${userAccessToken}` } }
                      );
                      
                      if (acceptorFoldersResponse.ok) {
                        const acceptorFoldersData = await acceptorFoldersResponse.json() as { files?: Array<{ id: string }> };
                        const acceptorPnFolder = acceptorFoldersData.files?.[0];
                        
                        if (acceptorPnFolder) {
                          const acceptorMessagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
                            token,
                            acceptorPnFolder.id,
                            pnIdentifier,
                            accountId
                          );
                          
                          // Try to restore conversation from acceptor (reverse order)
                          requesterConversationSheetId = await MessageSheetsService.restoreConversationFromOtherUser(
                            otherToken,
                            requesterMessagesFolderId,
                            token,
                            acceptorMessagesFolderId,
                            pnIdentifier,
                            connectionId,
                            decryptedSharedSecret,
                            otherUserPnIdentifier,
                            otherAccountId,
                            pnIdentifier,
                            accountId
                          );
                          console.log(`[AcceptConnection] Restored requester's conversation from acceptor`);
                        }
                      }
                    } catch (restoreError: any) {
                      console.warn(`[AcceptConnection] Failed to restore requester's conversation, continuing with empty sheet:`, restoreError.message);
                    }
                  }
                } catch (error: any) {
                  // First connection or re-connection after deletion - create new sheet
                  if (error?.message?.includes('not found')) {
                    requesterConversationSheetId = await MessageSheetsService.createConversationSheet(
                      otherToken,
                      requesterMessagesFolderId,
                      pnIdentifier,
                      otherUserPnIdentifier,
                      otherAccountId
                    );
                  } else {
                    throw error;
                  }
                }

                // Add initial system message to requester's conversation
                // Message: "user b accepted user a's connection request" (acceptor accepted requester's request)
                const systemMessageId2 = crypto.randomUUID();
                const now2 = new Date().toISOString();
                const systemMessageContent2 = `${acceptorDisplayName} accepted ${requesterDisplayName}'s connection request`;
                await MessageSheetsService.appendMessage(
                  otherToken,
                  requesterConversationSheetId,
                  {
                    messageId: systemMessageId2,
                    fromPnIdentifier: 'system',
                    toPnIdentifier: otherUserCredentials.identityId,
                    content: systemMessageContent2,
                    timestamp: now2,
                    read: false
                  },
                  connectionId, // Use the connection ID
                  sharedSecret || '', // Use the shared secret if available
                  otherUserPnIdentifier,
                  otherAccountId
                );

                // Update inbox for requester
                try {
                  const requesterCachedFolderIds = otherUserCredentials?.credentials?.cachedFolderIds || {};
                  const requesterInboxSheetId = await MessageSheetsService.getInboxSheet(
                    otherToken,
                    requesterMessagesFolderId,
                    otherUserPnIdentifier,
                    otherAccountId,
                    requesterCachedFolderIds.inboxSheetId // Pass cached ID to skip search
                  );
                  await MessageSheetsService.updateInboxEntry(
                    otherToken,
                    requesterInboxSheetId,
                    pnIdentifier,
                    requesterConversationSheetId,
                    connectionId,
                    now2,
                    otherUserPnIdentifier,
                    otherAccountId,
                    systemMessageContent2,
                    sharedSecret // Encrypted shared secret
                  );
                  console.log('[AcceptConnection] Updated requester inbox');
                } catch (inboxError: any) {
                  console.warn('[AcceptConnection] Failed to update requester inbox:', inboxError?.message);
                }
              }
            }
          }
        } catch (conversationError: any) {
          console.error('[AcceptConnection] Failed to create conversation sheets:', conversationError);
          console.error('[AcceptConnection] Error details:', {
            connectionId,
            acceptorPnIdentifier: userCredentials.identityId,
            requesterPnIdentifier: otherUserPnIdentifier,
            error: conversationError?.message,
            stack: conversationError?.stack
          });
          // Don't fail the request if conversation creation fails
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error accepting connection request:', error);
        return res.status(500).json({
          error: 'Failed to accept connection request',
          error_description: error.message || 'Failed to accept connection request'
        });
      }
    });

    // POST /api/connections/:connectionId/reject - Reject connection request
    this.app.post('/api/connections/:connectionId/reject', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        // Use normalized pn identifier for access token retrieval
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({ 
            error: 'Failed to access Google Drive', 
            error_description: error.message || 'Drive API error'
          });
        }

        // Use userPnIdentifier directly (already normalized)
        // Remove connection from user's file
        await ConnectionsService.removeConnection(
          userAccessToken,
          metadataFolderId,
          userPnIdentifier,
          connectionId
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error rejecting connection request:', error);
        return res.status(500).json({
          error: 'Failed to reject connection request',
          error_description: error.message || 'Failed to reject connection request'
        });
      }
    });

    // GET /api/connections - Get user's accepted connections
    this.app.get('/api/connections', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[GetConnections] User: ${pnIdentifier}`);

        // Get user's credentials
        let userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          console.log(`[GetConnections] No credentials found for user: ${pnIdentifier}`);
          return res.json({ connections: [] });
        }
        console.log(`[GetConnections] Found credentials under: ${userCredentials.identityId}`);

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          console.log(`[GetConnections] User has no Google Drive connected`);
          return res.json({ connections: [] });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);

        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        // Get metadata folder - use pnIdentifier
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message
            });
          }
          // Other Drive API errors
          console.error('[GetConnections] Drive API error:', error);
          return res.status(500).json({
            error: 'Failed to access Google Drive',
            error_description: error.message || 'Drive API error'
          });
        }

        const connections = await ConnectionsService.getConnections(userAccessToken, metadataFolderId);
        console.log(`[GetConnections] Found ${connections.length} accepted connections for user ${pnIdentifier}`);

        // Normalize userPnIdentifier in returned connections (handles legacy data)
        // Filter out invalid connections first, then normalize
        const normalizedConnections = connections
          .filter(c => {
            if (!c.userPnIdentifier) {
              console.warn('[GetConnections] Filtering out connection with undefined userPnIdentifier:', c);
              return false;
            }
            return true;
          })
          .map(c => ({
            ...c,
            userPnIdentifier: c.userPnIdentifier
          }));

        return res.json({ connections: normalizedConnections });
      } catch (error: any) {
        console.error('Error getting connections:', error);
        return res.status(500).json({
          error: 'Failed to get connections',
          error_description: error.message || 'Failed to get connections'
        });
      }
    });

    // POST /api/connections/follow - Follow a user or feed
    this.app.post('/api/connections/follow', async (req, res) => {
      try {
        const { userPnIdentifier, targetType, targetId } = req.body;
        if (!userPnIdentifier || !targetType || !targetId) {
          return res.status(400).json({ error: 'userPnIdentifier, targetType, and targetId are required' });
        }

        const targetTypeStr = String(targetType);
        if (targetTypeStr !== 'user' && targetTypeStr !== 'feed') {
          return res.status(400).json({ error: 'targetType must be "user" or "feed"' });
        }

        // Record activity FIRST
        const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Normalize targetId if it's a user (not a feed)
        const normalizedTargetId = targetTypeStr === 'user' && targetId
          ? (targetId.startsWith('pn-') ? targetId : `pn-${targetId}`)
          : targetId;

        // Record activity FIRST (use normalized targetPnIdentifier)
        await ActivityLedgerService.recordActivity(
          userAccessToken,
          metadataFolderId,
          userCredentials.identityId,
          'follow',
          {
            targetType: targetTypeStr,
            targetPnIdentifier: normalizedTargetId,
            metadata: { targetType: targetTypeStr, targetPnIdentifier: normalizedTargetId }
          }
        );

        // Get or create following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          userAccessToken,
          metadataFolderId
        );

        // Add to following sheet (use normalized targetPnIdentifier)
        await ConnectionsSheetsService.addFollowing(
          userAccessToken,
          followingSheetId,
          {
            targetType: targetTypeStr as 'user' | 'feed',
            targetPnIdentifier: String(normalizedTargetId),
            followedAt: new Date().toISOString()
          }
        );

        // If following a user with paid feed, add to their followers sheet (use normalized targetId)
        if (targetTypeStr === 'user') {
          try {
            const targetCredentials = await storageCredentialsService.getCredentials(normalizedTargetId);
            
            if (targetCredentials?.credentials) {
              // Check if target has paid feed (this would need feed service check)
              // For now, we'll add to followers if they have credentials
              const targetGoogleDriveAccounts = targetCredentials.credentials.googleDriveAccounts || 
                (targetCredentials.credentials.googleDrive ? [targetCredentials.credentials.googleDrive] : []);
              
              if (targetGoogleDriveAccounts.length > 0) {
                const targetAccount = targetGoogleDriveAccounts[0];
                const targetAccountId = (targetAccount as any).backendId || (targetAccount as any).keyPrefix || (targetAccount as any).accountId || (targetAccount as any).id || undefined;
                // Build token object for target
                const targetToken = {
                  access_token: targetAccount.access_token || targetAccount.accessToken,
                  refresh_token: targetAccount.refresh_token || targetAccount.refreshToken,
                  expires_at: targetAccount.expires_at,
                  expires_in: targetAccount.expires_in
                };
                const targetAccessToken = targetToken.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(targetToken, normalizedTargetId, targetAccountId); if (!_g) return this.driveNotInitialized(res); const targetMetadataFolderId = _g.metadataFolderId;

                // Get or create followers sheet (paid feeds only)
                const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
                  targetAccessToken,
                  targetMetadataFolderId
                );

                // Add follower (use normalized pnIdentifier)
                await ConnectionsSheetsService.addFollower(
                  targetAccessToken,
                  followersSheetId,
                  {
                    followerPnIdentifier: pnIdentifier,
                    followedAt: new Date().toISOString()
                  }
                );

                // Send notification to target user (use normalized DIDs)
                try {
                  await NotificationService.createNotification(
                    targetAccessToken,
                    targetMetadataFolderId,
                    targetCredentials.identityId,
                    {
                      user_pn_identifier: targetCredentials.identityId,
                      type: 'follow',
                      title: 'New Follower',
                      message: `${pnIdentifier} started following you`,
                      data: { user_pn_identifier: pnIdentifier }
                    }
                  );
                } catch (notificationError) {
                  console.warn('Failed to send follow notification:', notificationError);
                }
              }
            }
          } catch (targetError) {
            console.warn('Failed to update target user followers:', targetError);
            // Continue even if this fails
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error following:', error);
        return res.status(500).json({
          error: 'Failed to follow',
          error_description: error.message || 'Failed to follow'
        });
      }
    });

    // POST /api/connections/unfollow - Unfollow a user or feed
    this.app.post('/api/connections/unfollow', async (req, res) => {
      try {
        const { userPnIdentifier, targetType, targetId } = req.body;
        if (!userPnIdentifier || !targetType || !targetId) {
          return res.status(400).json({ error: 'userPnIdentifier, targetType, and targetId are required' });
        }

        const targetTypeStr = String(targetType);
        const targetIdStr = String(targetId);

        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Get following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          userAccessToken,
          metadataFolderId
        );

        // Normalize targetId if it's a user (not a feed)
        const normalizedTargetId = targetTypeStr === 'user' && targetIdStr
          ? (targetIdStr.startsWith('pn-') ? targetIdStr : `pn-${targetIdStr}`)
          : targetIdStr;

        // Remove from following sheet (use normalized targetId)
        await ConnectionsSheetsService.removeFollowing(
          userAccessToken,
          followingSheetId,
          targetTypeStr as 'user' | 'feed',
          normalizedTargetId
        );

        // If unfollowing a user, remove from their followers sheet
        if (targetTypeStr === 'user') {
          try {
            const targetCredentials = await storageCredentialsService.getCredentials(normalizedTargetId);
            
            if (targetCredentials?.credentials) {
              const targetGoogleDriveAccounts = targetCredentials.credentials.googleDriveAccounts || 
                (targetCredentials.credentials.googleDrive ? [targetCredentials.credentials.googleDrive] : []);
              
              if (targetGoogleDriveAccounts.length > 0) {
                const targetAccount = targetGoogleDriveAccounts[0];
                const targetAccountId = (targetAccount as any).backendId || (targetAccount as any).keyPrefix || (targetAccount as any).accountId || (targetAccount as any).id || undefined;
                // Build token object for target
                const targetToken = {
                  access_token: targetAccount.access_token || targetAccount.accessToken,
                  refresh_token: targetAccount.refresh_token || targetAccount.refreshToken,
                  expires_at: targetAccount.expires_at,
                  expires_in: targetAccount.expires_in
                };
                const targetAccessToken = targetToken.access_token; // Keep for backward compatibility
                const _g = await this.getMetadataFolder(targetToken, normalizedTargetId, targetAccountId); if (!_g) return this.driveNotInitialized(res); const targetMetadataFolderId = _g.metadataFolderId;

                // Get followers sheet
                const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
                  targetAccessToken,
                  targetMetadataFolderId
                );

                // Remove follower (use normalized pnIdentifier)
                await ConnectionsSheetsService.removeFollower(
                  targetAccessToken,
                  followersSheetId,
                  pnIdentifier
                );
              }
            }
          } catch (targetError) {
            console.warn('Failed to remove from target user followers:', targetError);
            // Continue even if this fails
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error unfollowing:', error);
        return res.status(500).json({
          error: 'Failed to unfollow',
          error_description: error.message || 'Failed to unfollow'
        });
      }
    });

    // GET /api/connections/followers - Get user's followers (paid feeds only)
    this.app.get('/api/connections/followers', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ followers: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ followers: [] });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Check if followers sheet exists (only for paid feeds)
        try {
          const followersSheetId = await ConnectionsSheetsService.getFollowersSheet(
            userAccessToken,
            metadataFolderId
          );

          const result = await ConnectionsSheetsService.getFollowers(
            userAccessToken,
            followersSheetId
          );

          return res.json({ followers: result.followers, total: result.total });
        } catch (error) {
          // Followers sheet doesn't exist (user doesn't have paid feed)
          return res.json({ followers: [], total: 0 });
        }
      } catch (error: any) {
        console.error('Error getting followers:', error);
        return res.status(500).json({
          error: 'Failed to get followers',
          error_description: error.message || 'Failed to get followers'
        });
      }
    });

    // GET /api/connections/following - Get users/feeds user is following
    this.app.get('/api/connections/following', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        const targetType = typeof req.query.targetType === 'string' ? req.query.targetType : undefined;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const userPnIdentifierStr = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier);
        const pnIdentifier = userPnIdentifierStr;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ following: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ following: [] });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Get following sheet
        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          userAccessToken,
          metadataFolderId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          userAccessToken,
          followingSheetId,
          {
            targetType: (targetType as 'user' | 'feed' | undefined) || undefined
          }
        );

        return res.json({ following: result.following, total: result.total });
      } catch (error: any) {
        console.error('Error getting following:', error);
        return res.status(500).json({
          error: 'Failed to get following',
          error_description: error.message || 'Failed to get following'
        });
      }
    });

    // GET /api/connections/following/feeds - Get followed feeds
    this.app.get('/api/connections/following/feeds', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ feeds: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ feeds: [] });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          userAccessToken,
          metadataFolderId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          userAccessToken,
          followingSheetId,
          { targetType: 'feed' }
        );

        return res.json({ feeds: result.following.map(f => f.targetPnIdentifier), total: result.total });
      } catch (error: any) {
        console.error('Error getting followed feeds:', error);
        return res.status(500).json({
          error: 'Failed to get followed feeds',
          error_description: error.message || 'Failed to get followed feeds'
        });
      }
    });

    // GET /api/connections/following/users - Get followed users
    this.app.get('/api/connections/following/users', async (req, res) => {
      try {
        const userPnIdentifier = typeof req.query.userPnIdentifier === 'string' ? req.query.userPnIdentifier : String(req.query.userPnIdentifier || '');
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const pnIdentifier = userPnIdentifier;
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ users: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ users: [] });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const followingSheetId = await ConnectionsSheetsService.getFollowingSheet(
          userAccessToken,
          metadataFolderId
        );

        const result = await ConnectionsSheetsService.getFollowing(
          userAccessToken,
          followingSheetId,
          { targetType: 'user' }
        );

        return res.json({ users: result.following.map(f => f.targetPnIdentifier), total: result.total });
      } catch (error: any) {
        console.error('Error getting followed users:', error);
        return res.status(500).json({
          error: 'Failed to get followed users',
          error_description: error.message || 'Failed to get followed users'
        });
      }
    });

    // GET /api/connections/pending - Get pending requests
    this.app.get('/api/connections/pending', async (req, res) => {
      try {
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly (already normalized)
        const pnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        if (!pnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        console.log(`[PendingRequests] User: ${pnIdentifier}`);
        
        // Get user's credentials
        let userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          console.error(`[PendingRequests] No credentials found: ${userPnIdentifier}`);
          return res.json({ sent: [], received: [] });
        }
        console.log(`[PendingRequests] Found credentials under: ${userCredentials.identityId}`);

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ sent: [], received: [] });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({
            error: 'Failed to access Google Drive',
            error_description: error.message || 'Drive API error'
          });
        }

        const pending = await ConnectionsService.getPendingRequests(token.access_token, metadataFolderId);

        // Normalize userPnIdentifier in returned connections (handles legacy data)
        // Filter out invalid connections first, then normalize
        const normalizedPending = {
          sent: pending.sent
            .filter(c => {
              if (!c.userPnIdentifier) {
                console.warn('[PendingRequests] Filtering out connection with undefined userPnIdentifier:', c);
                return false;
              }
              return true;
            })
            .map(c => ({
              ...c,
              userPnIdentifier: c.userPnIdentifier
            })),
          received: pending.received
            .filter(c => {
              if (!c.userPnIdentifier) {
                console.warn('[PendingRequests] Filtering out connection with undefined userPnIdentifier:', c);
                return false;
              }
              return true;
            })
            .map(c => ({
              ...c,
              userPnIdentifier: c.userPnIdentifier
            }))
        };

        return res.json(normalizedPending);
      } catch (error: any) {
        console.error('Error getting pending requests:', error);
        // Check for authentication errors and return 401 instead of 500
        if (error.message?.includes('authentication failed') || 
            error?.response?.status === 401 || 
            error?.code === 401) {
          return res.status(401).json({
            error: 'Google Drive authentication failed',
            code: 'DRIVE_AUTH_FAILED',
            message: 'Please reconnect your Google Drive account in the dashboard.'
          });
        }
        return res.status(500).json({
          error: 'Failed to get pending requests',
          error_description: error.message || 'Failed to get pending requests'
        });
      }
    });

    // GET /api/connections/:otherUserPnIdentifier/status - Check connection status with another user
    this.app.get('/api/connections/:otherUserPnIdentifier/status', async (req, res) => {
      try {
        const { otherUserPnIdentifier } = req.params;
        const { userPnIdentifier } = req.query;
        if (!userPnIdentifier || !otherUserPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and otherUserPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifiers directly (already normalized)
        const normalizedUserPnIdentifier = typeof userPnIdentifier === 'string' ? userPnIdentifier : String(userPnIdentifier || '');
        const normalizedOtherUserPnIdentifier = typeof otherUserPnIdentifier === 'string' ? otherUserPnIdentifier : String(otherUserPnIdentifier || '');
        if (!normalizedUserPnIdentifier || !normalizedOtherUserPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier and otherUserPnIdentifier are required' });
        }

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedUserPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ status: 'not_connected' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ status: 'not_connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, normalizedUserPnIdentifier, accountId);
          if (!_g) {
            // Folders actually missing - this is the only case for DRIVE_NOT_INITIALIZED
            return this.driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          // Drive API error (token, permissions, etc.) - return appropriate error
          if (error.message?.includes('authentication failed')) {
            return res.status(401).json({
              error: 'Google Drive authentication failed',
              code: 'DRIVE_AUTH_FAILED',
              message: error.message
            });
          }
          console.error('Error getting metadata folder:', error);
          return res.status(500).json({
            error: 'Failed to access Google Drive',
            error_description: error.message || 'Drive API error'
          });
        }

        const status = await ConnectionsService.getConnectionStatus(
          userAccessToken,
          metadataFolderId,
          normalizedUserPnIdentifier as string,
          normalizedOtherUserPnIdentifier as string
        );

        return res.json(status);
      } catch (error: any) {
        console.error('Error getting connection status:', error);
        return res.status(500).json({
          error: 'Failed to get connection status',
          error_description: error.message || 'Failed to get connection status'
        });
      }
    });

    // DELETE /api/connections/:connectionId - Remove connection
    this.app.delete('/api/connections/:connectionId', async (req, res) => {
      try {
        const { connectionId } = req.params;
        const { userPnIdentifier } = req.body;
        if (!connectionId || !userPnIdentifier) {
          return res.status(400).json({ error: 'connectionId and userPnIdentifier are required' });
        }

        const { ConnectionsService } = await import('./server/modules/connectionsService');
        const { ConnectionsSheetsService } = await import('./server/modules/connectionsSheetsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials using normalized pn identifier
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        // Get or create metadata folder
        let metadataFolderId: string;
        try {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); metadataFolderId = _g.metadataFolderId;
        } catch (error: any) {
          console.error('Error getting/creating metadata folder:', error);
          return res.status(500).json({ error: 'Failed to get or create metadata folder', error_description: error.message });
        }

        // Get connection to find the other user's pn identifier before removing
        // Use Sheets directly (not JSON file) since that's what the system uses
        let userSpreadsheetId: string | undefined;
        let otherUserPnIdentifier: string | undefined;
        
        try {
          userSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
            userAccessToken,
            metadataFolderId
          );
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get connections sheet:`, error.message);
          return res.status(500).json({
            error: 'Failed to access connections sheet',
            error_description: error.message || 'Connections sheet not found. Please ensure Google Drive is initialized.'
          });
        }
        
        try {
          // Get connection directly by connectionId (more efficient than loading all connections)
          const connection = await ConnectionsSheetsService.getConnectionById(
            userAccessToken,
            userSpreadsheetId,
            connectionId
          );
          if (connection) {
            // Validate and normalize to pn identifier format (handles legacy data)
            if (!connection.userPnIdentifier) {
              console.error(`[RemoveConnection] Connection ${connectionId} missing userPnIdentifier:`, connection);
              return res.status(500).json({ error: 'Connection missing userPnIdentifier' });
            }
            otherUserPnIdentifier = connection.userPnIdentifier.startsWith('pn-') ? connection.userPnIdentifier : `pn-${connection.userPnIdentifier}`;
            console.log(`[RemoveConnection] Found connection ${connectionId} with other user: ${connection.userPnIdentifier} (normalized: ${otherUserPnIdentifier})`);
          } else {
            console.error(`[RemoveConnection] Connection ${connectionId} not found in user's connections sheet`);
          }
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get connection details:`, error.message, error.stack);
          // Still try to remove from user's sheet even if we can't find the other user
        }

        // Remove connection from user's sheet (using Sheets directly, not JSON)
        let removedFromUser = false;
        if (userSpreadsheetId) {
          try {
            await ConnectionsSheetsService.removeConnection(
              userAccessToken,
              userSpreadsheetId,
              connectionId
            );
            removedFromUser = true;
            console.log(`[RemoveConnection] Removed connection ${connectionId} from user's connections sheet`);
          } catch (error: any) {
            if (error.message === 'Connection not found' || error.message?.includes('not found')) {
              console.warn(`[RemoveConnection] Connection ${connectionId} not found in user's sheet (may have been already removed)`);
              // Continue - connection might have been already removed or doesn't exist
            } else {
              console.error(`[RemoveConnection] Failed to remove connection from user's sheet:`, error.message, error.stack);
              throw error; // Fail the request for other errors
            }
          }
        }

        // Also remove connection from other user's connections sheet
        if (!otherUserPnIdentifier) {
          console.error(`[RemoveConnection] Could not determine other user's pn identifier from connection ${connectionId}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not determine other user to remove from their list' });
        }

        console.log(`[RemoveConnection] Attempting to remove connection ${connectionId} from other user: ${otherUserPnIdentifier}`);
        
        // Get other user's credentials - early return if not found
        let otherUserCredentials;
        try {
          otherUserCredentials = await storageCredentialsService.getCredentials(otherUserPnIdentifier);
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get other user's credentials:`, error.message);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not access other user\'s credentials' });
        }
        
        if (!otherUserCredentials?.credentials) {
          console.error(`[RemoveConnection] Other user's credentials not found for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user\'s credentials not found' });
        }

        // Get other user's Google Drive accounts - early return if none
        const otherUserGoogleDriveAccounts = otherUserCredentials.credentials.googleDriveAccounts || 
          (otherUserCredentials.credentials.googleDrive ? [otherUserCredentials.credentials.googleDrive] : []);
        
        if (otherUserGoogleDriveAccounts.length === 0) {
          console.error(`[RemoveConnection] Other user has no Google Drive connected for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user has no Google Drive connected' });
        }

        // Get other user's account and build token object
        const otherUserAccount = otherUserGoogleDriveAccounts[0];
        const otherUserAccountId = this.extractAccountId(otherUserAccount);
        
        // Build token object for other user
        const otherUserToken = {
          access_token: otherUserAccount.access_token || otherUserAccount.accessToken,
          refresh_token: otherUserAccount.refresh_token || otherUserAccount.refreshToken,
          expires_at: otherUserAccount.expires_at,
          expires_in: otherUserAccount.expires_in
        };
        const otherUserAccessToken = otherUserToken.access_token; // Keep for backward compatibility

        // Get other user's metadata folder - early return if not found
        let otherUserMetadataFolder;
        try {
          otherUserMetadataFolder = await this.getMetadataFolder(otherUserToken, otherUserPnIdentifier!, otherUserAccountId);
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get other user's metadata folder:`, error.message);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not access other user\'s metadata folder' });
        }
        
        if (!otherUserMetadataFolder) {
          console.error(`[RemoveConnection] Other user's metadata folder not found for ${otherUserPnIdentifier}`);
          return res.json({ success: true, warning: 'Connection removed from your list, but other user\'s metadata folder not found' });
        }

        // Get other user's connections spreadsheet - early return if error
        let otherUserSpreadsheetId: string;
        try {
          otherUserSpreadsheetId = await ConnectionsSheetsService.getConnectionsSheet(
            otherUserAccessToken,
            otherUserMetadataFolder.metadataFolderId
          );
        } catch (error: any) {
          console.error(`[RemoveConnection] Failed to get/create other user's connections sheet:`, error.message);
          return res.json({ success: true, warning: 'Connection removed from your list, but could not access other user\'s connections sheet' });
        }

        // Now attempt the actual removal - this is the critical step
        try {
          await ConnectionsSheetsService.removeConnection(
            otherUserAccessToken,
            otherUserSpreadsheetId,
            connectionId
          );
          
          console.log(`[RemoveConnection] Successfully removed connection ${connectionId} from both users' connections sheets`);
          return res.json({ success: true });
        } catch (removeError: any) {
          if (removeError.message === 'Connection not found' || removeError.message?.includes('not found')) {
            console.warn(`[RemoveConnection] Connection ${connectionId} not found in other user's sheet (may have been already removed)`);
            return res.json({ success: true, warning: 'Connection removed from your list, but connection not found in other user\'s list (may have been already removed)' });
          } else {
            // Re-throw unexpected errors to be caught by outer catch
            console.error(`[RemoveConnection] Unexpected error removing from other user's sheet:`, removeError.message, removeError.stack);
            throw removeError;
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error removing connection:', error);
        return res.status(500).json({
          error: 'Failed to remove connection',
          error_description: error.message || 'Failed to remove connection'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/preferences - Save user preferences to Google Drive
    this.app.put('/api/users/:pnIdentifier/preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const preferences = req.body;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find pN folder and _metadata folder (same pattern as other endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Update preferences file
        const updatedPreferences = await PreferencesService.updatePreferencesFile(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          preferences
        );

        return res.json({ success: true, preferences: updatedPreferences });
      } catch (error: any) {
        console.error('Error saving preferences:', error);
        return res.status(500).json({
          error: 'Failed to save preferences',
          error_description: error.message || 'Failed to save preferences'
        });
      }
    });

    // GET /api/users/:pnIdentifier/zkp-data-points - Get all available ZKP data points (metadata only)
    this.app.get('/api/users/:pnIdentifier/zkp-data-points', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
        const accountId = this.extractAccountId(account);
        
        // Get full token object (not just access token string) for automatic refresh
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility

        if (!userAccessToken) {
          return res.status(401).json({ 
            error: 'Google Drive authentication failed',
            details: 'Access token is missing. Please reconnect Google Drive in the dashboard.'
          });
        }

        const out = await this.getMetadataFolder(token, normalizedPnIdentifier, accountId);
        if (!out) {
          return this.driveNotInitialized(res);
        }
        const metadataFolderId = out.metadataFolderId;

        // Get available data points (metadata only, no actual data)
        const dataPoints = await ZKPDataPointsService.getAvailableDataPoints(
          userAccessToken,
          metadataFolderId
        );

        return res.json({ success: true, dataPoints });
      } catch (error: any) {
        console.error('Error getting ZKP data points:', error);
        return res.status(500).json({
          error: 'Failed to get ZKP data points',
          error_description: error.message || 'Failed to get ZKP data points'
        });
      }
    });

    // GET /api/users/:pnIdentifier/zkp-data-points/:dataPointId - Get specific ZKP proof
    this.app.get('/api/users/:pnIdentifier/zkp-data-points/:dataPointId', async (req, res) => {
      try {
        const { pnIdentifier, dataPointId } = req.params;

        if (!pnIdentifier || !dataPointId) {
          return res.status(400).json({ error: 'pnIdentifier and dataPointId are required' });
        }

        const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find or create pN folder first
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        // If pN folder doesn't exist, try alternative name format
        if (!pnFolderId) {
          const altPnFolderName = `par Noir - pn-${normalizedPnIdentifier.replace('pn-', '')}`;
          const altPnFolderSearchQuery = `name='${altPnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
          const altPnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altPnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
          
          const altPnFolderResponse = await fetch(altPnFolderSearchUrl, {
            headers: { 'Authorization': `Bearer ${userAccessToken}` }
          });

          if (altPnFolderResponse.ok) {
            const altPnFolderData = await altPnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
            if (altPnFolderData.files && altPnFolderData.files.length > 0) {
              pnFolderId = altPnFolderData.files[0].id;
            }
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder inside pN folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!metadataFolderResponse.ok) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
        if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderId = metadataFolderData.files[0].id;

        // Get the ZKP proof (NOT the actual data)
        const proof = await ZKPDataPointsService.getDataPointProof(
          userAccessToken,
          metadataFolderId,
          dataPointId
        );

        if (!proof) {
          return res.status(404).json({ error: 'ZKP data point not found or expired' });
        }

        return res.json({ success: true, proof });
      } catch (error: any) {
        console.error('Error getting ZKP data point:', error);
        return res.status(500).json({
          error: 'Failed to get ZKP data point',
          error_description: error.message || 'Failed to get ZKP data point'
        });
      }
    });

    // GET /api/users/:pnIdentifier/third-party-permissions - Get all third-party permissions
    this.app.get('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find pN folder and _metadata folder (same pattern as ZKP endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.json({ success: true, permissions: {} });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!metadataFolderResponse.ok) {
          return res.json({ success: true, permissions: {} });
        }

        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
        if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
          return res.json({ success: true, permissions: {} });
        }

        const metadataFolderId = metadataFolderData.files[0].id;

        // Get permissions
        const permissions = await ThirdPartyPermissionsService.getPermissions(
          userAccessToken,
          metadataFolderId
        );

        return res.json({ success: true, permissions });
      } catch (error: any) {
        console.error('Error getting third-party permissions:', error);
        return res.status(500).json({
          error: 'Failed to get third-party permissions',
          error_description: error.message || 'Failed to get third-party permissions'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/third-party-permissions - Store or update third-party permission
    this.app.put('/api/users/:pnIdentifier/third-party-permissions', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { toolId, permission } = req.body;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!toolId || !permission) {
          return res.status(400).json({ error: 'toolId and permission are required' });
        }

        const { ThirdPartyPermissionsService } = await import('./server/modules/thirdPartyPermissionsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          
          // Get full token object (not just access token string) for automatic refresh
          const token = {
            access_token: account.access_token || account.accessToken,
            refresh_token: account.refresh_token || account.refreshToken,
            expires_at: account.expires_at,
            expires_in: account.expires_in
          };
          const userAccessToken = token.access_token; // Keep for backward compatibility

        const out = await this.getMetadataFolder(token, normalizedPnIdentifier, accountId);
        if (!out) {
          return this.driveNotInitialized(res);
        }
        const metadataFolderId = out.metadataFolderId;

        // Get existing permissions
        const existingPermissions = await ThirdPartyPermissionsService.getPermissions(
          userAccessToken,
          metadataFolderId
        );

        // For browser-app, ensure static required/optional data points are preserved
        // These are defined by the third party and should never change
        let finalPermission = permission;
        if (toolId === 'browser-app') {
          finalPermission = {
            ...permission,
            // Static: These are always the same, defined by browser-app
            requiredDataPoints: [], // No required data points for browser
            optionalDataPoints: ['age_attestation'], // Age is always optional
            // dataPoints array reflects what user has granted (can change)
          };
        }

        // Update permissions
        const updatedPermissions = {
          ...existingPermissions,
          [toolId]: finalPermission
        };

        // Store permissions
        await ThirdPartyPermissionsService.storePermissions(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          updatedPermissions
        );

        return res.json({ success: true, permission });
      } catch (error: any) {
        console.error('Error storing third-party permission:', error);
        return res.status(500).json({
          error: 'Failed to store third-party permission',
          error_description: error.message || 'Failed to store third-party permission'
        });
      }
    });

    // POST /api/users/:pnIdentifier/zkp-data-points/verify - Verify a ZKP proof against a condition
    this.app.post('/api/users/:pnIdentifier/zkp-data-points/verify', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { dataPointId, condition } = req.body; // e.g., condition: "age >= 18"

        if (!pnIdentifier || !dataPointId || !condition) {
          return res.status(400).json({ error: 'pnIdentifier, dataPointId, and condition are required' });
        }

        const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find pN folder and _metadata folder (same pattern as other endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (!metadataFolderResponse.ok) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
        if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        const metadataFolderId = metadataFolderData.files[0].id;

        // Get the ZKP proof
        const proof = await ZKPDataPointsService.getDataPointProof(
          userAccessToken,
          metadataFolderId,
          dataPointId
        );

        if (!proof) {
          return res.status(404).json({ error: 'ZKP data point not found or expired' });
        }

        // Verify the proof against the condition
        const verification = await ZKPDataPointsService.verifyProof(proof.zkpProof, condition);

        return res.json({ success: true, verification });
      } catch (error: any) {
        console.error('Error verifying ZKP proof:', error);
        return res.status(500).json({
          error: 'Failed to verify ZKP proof',
          error_description: error.message || 'Failed to verify ZKP proof'
        });
      }
    });

    // PUT /api/users/:pnIdentifier/zkp-data-points/:dataPointId - Store/update ZKP data point
    this.app.put('/api/users/:pnIdentifier/zkp-data-points/:dataPointId', async (req, res) => {
      try {
        const { pnIdentifier, dataPointId } = req.params;
        const dataPoint = req.body; // ZKPDataPoint object

        if (!pnIdentifier || !dataPointId) {
          return res.status(400).json({ error: 'pnIdentifier and dataPointId are required' });
        }

        if (!dataPoint || dataPoint.dataPointId !== dataPointId) {
          return res.status(400).json({ error: 'Invalid data point' });
        }

        const { ZKPDataPointsService } = await import('./server/modules/zkpDataPointsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          
          // Get full token object (not just access token string) for automatic refresh
          const token = {
            access_token: account.access_token || account.accessToken,
            refresh_token: account.refresh_token || account.refreshToken,
            expires_at: account.expires_at,
            expires_in: account.expires_in
          };
          const userAccessToken = token.access_token; // Keep for backward compatibility

        const out = await this.getMetadataFolder(token, normalizedPnIdentifier, accountId);
        if (!out) {
          return this.driveNotInitialized(res);
        }
        const metadataFolderId = out.metadataFolderId;

        // Store the data point
        await ZKPDataPointsService.storeDataPoint(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          dataPoint
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error storing ZKP data point:', error);
        return res.status(500).json({
          error: 'Failed to store ZKP data point',
          error_description: error.message || 'Failed to store ZKP data point'
        });
      }
    });

    // GET /api/users/:pnIdentifier/preferences - Get user preferences from Google Drive
    this.app.get('/api/users/:pnIdentifier/preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find pN folder and _metadata folder (same pattern as other endpoints)
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        // Find _metadata folder
        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Get preferences file
        const preferences = await PreferencesService.getPreferencesFile(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier
        );

        if (!preferences) {
          return res.json({ preferences: null });
        }

        return res.json({ preferences });
      } catch (error: any) {
        console.error('Error getting preferences:', error);
        return res.status(500).json({
          error: 'Failed to get preferences',
          error_description: error.message || 'Failed to get preferences'
        });
      }
    });

    // POST /api/users/:pnIdentifier/tag-preferences - Save a tag preference
    this.app.post('/api/users/:pnIdentifier/tag-preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;
        const { tagId, preference, action, confidence, metadata, sourceFileId } = req.body;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        if (!tagId || !preference || !action) {
          return res.status(400).json({ error: 'tagId, preference, and action are required' });
        }

        if (!['like', 'dislike', 'block', 'subscribe'].includes(preference)) {
          return res.status(400).json({ error: 'preference must be one of: like, dislike, block, subscribe' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Save tag preference to Google Drive
        await PreferencesService.addTagPreference(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          tagId.toLowerCase(),
          preference,
          action,
          {
            sourceFileId,
            confidence: confidence ?? 0.8,
            metadata
          }
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error saving tag preference:', error);
        return res.status(500).json({
          error: 'Failed to save tag preference',
          error_description: error.message || 'Failed to save tag preference'
        });
      }
    });

    // GET /api/users/:pnIdentifier/tag-preferences - Get all tag preferences
    this.app.get('/api/users/:pnIdentifier/tag-preferences', async (req, res) => {
      try {
        const { pnIdentifier } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ preferences: [] });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ preferences: [] });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.json({ preferences: [] });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.json({ preferences: [] });
        }

        // Get tag preferences from Google Drive
        const preferences = await PreferencesService.getTagPreferences(userAccessToken, metadataFolderId, normalizedPnIdentifier);

        return res.json({ preferences });
      } catch (error: any) {
        console.error('Error getting tag preferences:', error);
        return res.status(500).json({
          error: 'Failed to get tag preferences',
          error_description: error.message || 'Failed to get tag preferences'
        });
      }
    });

    // DELETE /api/users/:pnIdentifier/tag-preferences/:tagId - Remove a tag preference
    this.app.delete('/api/users/:pnIdentifier/tag-preferences/:tagId', async (req, res) => {
      try {
        const { pnIdentifier, tagId } = req.params;

        if (!pnIdentifier) {
          return res.status(400).json({ error: 'pnIdentifier is required' });
        }

        if (!tagId) {
          return res.status(400).json({ error: 'tagId is required' });
        }

        // Normalize pn identifier
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;

        const { PreferencesService } = await import('./server/modules/preferencesService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(normalizedPnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

          const account = googleDriveAccounts[0];
          const accountId = this.extractAccountId(account);
          const userAccessToken = await googleDriveProxyService.getAccessToken(normalizedPnIdentifier, accountId);

        // Find _metadata folder
        const pnFolderName = `par Noir - ${normalizedPnIdentifier}`;
        const pnFolderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const pnFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(pnFolderSearchQuery)}&fields=files(id)&pageSize=1`;
        
        const pnFolderResponse = await fetch(pnFolderSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        let pnFolderId: string | null = null;
        if (pnFolderResponse.ok) {
          const pnFolderData = await pnFolderResponse.json() as { files?: Array<{ id: string }> };
          if (pnFolderData.files && pnFolderData.files.length > 0) {
            pnFolderId = pnFolderData.files[0].id;
          }
        }

        if (!pnFolderId) {
          return res.status(404).json({ error: 'pN folder not found' });
        }

        const metadataFolderName = '_metadata';
        const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id)&pageSize=1`;
        
        let metadataFolderId: string | null = null;
        const metadataFolderResponse = await fetch(metadataSearchUrl, {
          headers: { 'Authorization': `Bearer ${userAccessToken}` }
        });

        if (metadataFolderResponse.ok) {
          const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string }> };
          if (metadataFolderData.files && metadataFolderData.files.length > 0) {
            metadataFolderId = metadataFolderData.files[0].id;
          }
        }

        if (!metadataFolderId) {
          return res.status(404).json({ error: '_metadata folder not found' });
        }

        // Remove tag preference from Google Drive
        await PreferencesService.removeTagPreference(
          userAccessToken,
          metadataFolderId,
          normalizedPnIdentifier,
          tagId.toLowerCase()
        );

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error removing tag preference:', error);
        return res.status(500).json({
          error: 'Failed to remove tag preference',
          error_description: error.message || 'Failed to remove tag preference'
        });
      }
    });

    // GET /api/activity-ledger - Get user's activity ledger
    this.app.get('/api/activity-ledger', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;

        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { ActivityLedgerService } = await import('./server/modules/activityLedgerService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Normalize pn identifier
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ activities: [], total: 0 });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ activities: [], total: 0 });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(
          pnIdentifier,
          accountId,
          [pnIdentifier]
        );

        // Get metadata folder using helper method
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        // Get query parameters
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const activityType = req.query.activityType as string | undefined;

        // Get activities
        const result = await ActivityLedgerService.getUserActivities(
          userAccessToken,
          metadataFolderId,
          {
            limit,
            offset,
            activityType: activityType as any
          }
        );

        return res.json({
          activities: result.activities,
          total: result.total
        });
      } catch (error: any) {
        console.error('Error getting activity ledger:', error);
        return res.status(500).json({
          error: 'Failed to get activity ledger',
          error_description: error.message || 'Failed to get activity ledger'
        });
      }
    });

    this.app.get('/api/notifications', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type as string | undefined;

        const result = await NotificationService.getUserNotifications(userAccessToken, metadataFolderId, {
          limit,
          offset,
          unreadOnly,
          type: type as any
        });

        return res.json({
          notifications: result.notifications,
          total: result.total,
          limit,
          offset
        });
      } catch (error: any) {
        console.error('Failed to get notifications:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get notifications'
        });
      }
    });

    // GET /api/notifications/unread-count - Get unread count
    this.app.get('/api/notifications/unread-count', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ count: 0 });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ count: 0 });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const count = await NotificationService.getUnreadCount(userAccessToken, metadataFolderId);

        return res.json({ count });
      } catch (error: any) {
        console.error('Failed to get unread count:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get unread count'
        });
      }
    });

    // PUT /api/notifications/:notificationId/read - Mark notification as read
    this.app.put('/api/notifications/:notificationId/read', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const success = await NotificationService.markAsRead(userAccessToken, metadataFolderId, pnIdentifier, notificationId);

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Failed to mark notification as read:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to mark notification as read'
        });
      }
    });

    // PUT /api/notifications/read-all - Mark all notifications as read
    this.app.put('/api/notifications/read-all', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const count = await NotificationService.markAllAsRead(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json({ success: true, markedRead: count });
      } catch (error: any) {
        console.error('Failed to mark all notifications as read:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to mark all notifications as read'
        });
      }
    });

    // DELETE /api/notifications/:notificationId - Delete notification
    this.app.delete('/api/notifications/:notificationId', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const success = await NotificationService.deleteNotification(userAccessToken, metadataFolderId, pnIdentifier, notificationId);

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        return res.json({ success: true });
      } catch (error: any) {
        console.error('Failed to delete notification:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to delete notification'
        });
      }
    });

    // GET /api/notifications/preferences - Get notification preferences
    this.app.get('/api/notifications/preferences', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          // Return default preferences if no credentials
          return res.json({
            user_pn_identifier: userPnIdentifier,
            feed_new_post: true,
            feed_new_comment: true,
            feed_new_like: false,
            feed_new_subscriber: true,
            comment_reply: true,
            mention: true,
            connection_request: true,
            connection_accepted: true,
            repost: true
          });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          // Return default preferences if no Google Drive
          return res.json({
            user_pn_identifier: userPnIdentifier,
            feed_new_post: true,
            feed_new_comment: true,
            feed_new_like: false,
            feed_new_subscriber: true,
            comment_reply: true,
            mention: true,
            connection_request: true,
            connection_accepted: true,
            repost: true
          });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const preferences = await NotificationService.getPreferences(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json(preferences);
      } catch (error: any) {
        console.error('Failed to get notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to get notification preferences'
        });
      }
    });

    // PUT /api/notifications/preferences - Update notification preferences
    this.app.put('/api/notifications/preferences', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./server/modules/notificationService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'User has no Google Drive connected' });
        }

        const account = googleDriveAccounts[0];
                const accountId = this.extractAccountId(account);
        const userAccessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [pnIdentifier]);
        // Build token object from account
        const token = {
          access_token: account.access_token || account.accessToken,
          refresh_token: account.refresh_token || account.refreshToken,
          expires_at: account.expires_at,
          expires_in: account.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        const _g = await this.getMetadataFolder(token, pnIdentifier, accountId); if (!_g) return this.driveNotInitialized(res); const metadataFolderId = _g.metadataFolderId;

        const { user_did, ...preferencesUpdate } = req.body;
        const preferences = await NotificationService.updatePreferences(
          userAccessToken,
          metadataFolderId,
          userCredentials.identityId,
          preferencesUpdate
        );

        return res.json(preferences);
      } catch (error: any) {
        console.error('Failed to update notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: error.message || 'Failed to update notification preferences'
        });
      }
    });
  }

  public async start(): Promise<void> {
    // Setup routes (async imports)
    await this.setupRoutes();
    
    // Initialize database connection and schema
    try {
      const { initializeDatabase } = await import('./server/utils/database');
      await initializeDatabase();
      
      // SCALABILITY: Initialize Redis cache
      const { initializeCache } = await import('./server/utils/cache');
      await initializeCache();
    } catch (error) {
      console.error('⚠️ Failed to initialize database:', error);
      // Continue anyway - database might not be configured yet
      if (process.env.DATABASE_URL) {
        throw error; // If DATABASE_URL is set, database is required
      }
    }

    // DISABLED: Google Drive sync service is outdated - files are now submitted directly via API
    // Start Google Drive sync service (if configured)
    // try {
    //   const { GoogleDriveSyncService } = await import('./server/modules/googleDriveSyncService');
    // Google Drive sync service disabled - files are added/updated/removed via API calls only
    // No background sync needed - aggregate index built from explicit user actions
    // try {
    //   const { GoogleDriveSyncService } = await import('./server/modules/googleDriveSyncService');
    //   const syncService = GoogleDriveSyncService.getInstance();
    //   
    //   // Start periodic sync (every 10 minutes)
    //   // Only if service account is configured
    //   if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    //     syncService.startPeriodicSync(10);
    //     console.log('✅ Google Drive sync enabled - will run cleanup every 10 minutes');
    //   } else {
    //     console.log('ℹ️ Google Drive sync disabled - GOOGLE_SERVICE_ACCOUNT_KEY not set');
    //   }
    // } catch (error) {
    //   console.warn('⚠️ Failed to start Google Drive sync service:', error);
    //   // Continue anyway - sync is optional
    // }

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
        // Orphan cleanup: first run after 30s, then every 5 minutes (for testing; can be increased later)
        (async () => {
          try {
            const { runCleanupOrphaned } = await import('./server/jobs/cleanupOrphanedJob');
            const run = () => runCleanupOrphaned().catch((e: any) => console.error('[CleanupOrphaned] Scheduled run failed:', e));
            this._cleanupOrphanedTimer = setTimeout(() => {
              run();
              this._cleanupOrphanedInterval = setInterval(run, 5 * 60 * 1000);
            }, 30_000);
          } catch (e) {
            console.warn('[CleanupOrphaned] Could not schedule cleanup job:', e);
          }
        })();
        resolve();
      });

      this.server.on('error', (error: any) => {
        console.error('Failed to start server:', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    if (this._cleanupOrphanedTimer) {
      clearTimeout(this._cleanupOrphanedTimer);
      this._cleanupOrphanedTimer = null;
    }
    if (this._cleanupOrphanedInterval) {
      clearInterval(this._cleanupOrphanedInterval);
      this._cleanupOrphanedInterval = null;
    }
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
