/**
 * Production API server for par Noir
 * Simplified production-ready server implementation
 */

// CRITICAL: Increase thread pool size for parallel PBKDF2 operations
// Default is 4, which limits parallel crypto operations (e.g., message decryption)
// Setting to 16 allows up to 16 PBKDF2 operations to run in parallel
// This must be set BEFORE importing any modules that use crypto
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '16';
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import crypto from 'crypto';
import path from 'path';
import { determineFileType, getFileTypeFromMime, determineContentClass } from './server/utils/fileTypeUtils';
import { isOAuthBrowserHtmlEntryGet } from './server/utils/oauthBrowserHtmlEntry';
import { safeClientErrorMessage } from './server/utils/safeError';
import { captureApiRouteError, initApiSentry } from './server/utils/sentry';
import { registerAdminDeveloperRoutes, requireAdminApiKey } from './server/modules/adminDeveloperRoutes';
import { registerIdentityMigrationRoutes } from './server/modules/identityMigrationService';
import { registerDeviceAuthRoutes } from './server/modules/deviceAuthRoutes';
import {
  registerRecoveryVaultRoutes,
  evaluateRecoveryApprovalUpdate,
  fetchVaultSharesForRequest,
  getRecoveryCustodianSummary,
} from './server/modules/recoveryVaultRoutes';
import { registerDeveloperSelfServiceRoutes } from './server/modules/developerSelfServiceRoutes';
import { registerPlatformRegistryRoutes } from './server/modules/platformRegistryRoutes';
import { PlatformRegistrySyncService } from './server/modules/platformRegistrySyncService';
import { registerOwnedAssetRoutes } from './server/modules/ownedAssetRoutes';
import { registerVerificationRoutes } from './server/modules/verificationRoutes';
import { registerMusicTrackRegistryRoutes } from './server/modules/musicTrackRegistryRoutes';
import { registerStripeMonetizationRoutes } from './server/modules/stripeMonetizationRoutes';
import { registerIntegratorRoutes } from './server/modules/integratorRoutes';
import { registerStorageRoutes } from './server/modules/storage/storageRoutes';
import { registerMailboxRoutes } from './server/modules/mailboxRoutes';
import { registerCreatorFundPeriodRoutes } from './server/modules/creatorFundPeriodRoutes';
import { registerCoreRoutes } from './server/modules/coreRoutes';
import { setupMessageRoutes } from './server/modules/messageRoutes';
import { setupGroupRoutes } from './server/modules/groupRoutes';
import { setupConnectionRoutes } from './server/modules/connectionRoutes';
import { setupUserRoutes } from './server/modules/userRoutes';
import { setupGoogleOAuthRoutes } from './server/modules/googleOAuthRoutes';
import { setupDriveRoutes } from './server/modules/driveRoutes';
import { setupPnOAuthRoutes } from './server/modules/pnOAuthRoutes';
import { hashIdentifier, isDevVerbose, safeLogger } from './utils/logger';
import { messagingLog } from './server/utils/messagingLog';
import { getBearerTokenPayload } from './server/middleware/authMiddleware';
import {
  gateOwnerRoute,
  gateOwnerSelfRoute,
  gateStorageCredentialsPut,
  DEVICE_CAPABILITIES,
} from './server/modules/deviceCapabilityService';

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Always include these origins, even if ALLOWED_ORIGINS env var is set.
// Capacitor/WebView:
// - capacitor://localhost / ionic:// — some native shells
// - https://localhost — Android Capacitor when capacitor.config server.androidScheme is "https" (WebView origin for API calls)
const DEFAULT_ORIGINS = [
  'https://parnoir.com',
  'https://pn.parnoir.com',
  'https://pn-parnoir.web.app',
  'https://par-noir-dashboard.web.app',
  'https://browse.parnoir.com',
  'https://messaging.parnoir.com',
  'https://prism.parnoir.com',
  'https://licensing.parnoir.com',
  'https://developers.parnoir.com',
  'https://developers-parnoir.web.app',
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'https://127.0.0.1',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
  'http://localhost:5176',
  'https://licensing-parnoir.web.app',
  // API-hosted OAuth consent page uses fetch() same-origin; browsers send Origin: https://api.parnoir.com
  'https://api.parnoir.com',
];

const ENV_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || [];
const ALLOWED_ORIGINS = [...new Set([...DEFAULT_ORIGINS, ...ENV_ORIGINS])]; // Merge and deduplicate

/** True when Origin is this server's own public host (consent HTML on API calling API). */
function isSameOriginAsApiHost(origin: string, req: express.Request): boolean {
  try {
    const originUrl = new URL(origin);
    const forwarded = req.headers['x-forwarded-host'];
    const rawHost =
      (typeof forwarded === 'string' ? forwarded.split(',')[0] : null)?.trim() ||
      req.headers.host ||
      '';
    if (!rawHost) return false;
    const requestHost = rawHost.trim().toLowerCase();
    const originHost = originUrl.host.toLowerCase();
    return originHost === requestHost;
  } catch {
    return false;
  }
}

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
  max: 100, // Multiple pN unlocks + reconnects during setup
  message: 'Too many OAuth token requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

class ProductionServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private _reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconcileInterval: ReturnType<typeof setInterval> | null = null;

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
    const { pnFolderDisplayName, normalizePnIdentifier } = await import('./server/modules/integratorStoragePaths');
    const normalizedPn = normalizePnIdentifier(pnIdentifier);
    const pnFolderName = pnFolderDisplayName(normalizedPn);
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
        // Never log access token material (even a prefix) — credential leakage in logs
        if (NODE_ENV === 'development') {
          console.error(`[getOrCreateMetadataFolder] Bearer token present: ${accessToken ? 'yes' : 'no'} (length ${accessToken?.length ?? 0})`);
        }
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
    _accountId?: string
  ): Promise<{ metadataFolderId: string; pnFolderId: string } | null> {
    const { loadPnDriveIndex, isPnDriveIndexComplete, pnDriveFoldersExistOnDrive, clearPnDriveIndex } =
      await import('./server/modules/pnDriveIndex');
    const normalizedPn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    const index = await loadPnDriveIndex(normalizedPn);
    if (!isPnDriveIndexComplete(index)) return null;
    if (!token.access_token) return null;
    const foldersExist = await pnDriveFoldersExistOnDrive(
      token.access_token,
      index.pnFolderId,
      index.metadataFolderId
    );
    if (!foldersExist) {
      await clearPnDriveIndex(normalizedPn);
      return null;
    }
    return { metadataFolderId: index.metadataFolderId, pnFolderId: index.pnFolderId };
  }

  private async getRecoveryDriveContext(userPnIdentifier: string): Promise<{
    pnIdentifier: string;
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number };
    accountId?: string;
    metadataFolderId: string;
  } | null> {
    const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
    const pnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
    if (!userCredentials?.credentials) {
      return null;
    }
    const googleDriveAccounts =
      userCredentials.credentials.googleDriveAccounts ||
      (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
    if (googleDriveAccounts.length === 0) {
      return null;
    }
    const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
    const accountId = account ? this.extractAccountId(account) : undefined;
    const token = {
      access_token: account?.access_token || account?.accessToken || '',
      refresh_token: account?.refresh_token || account?.refreshToken,
      expires_at: account?.expires_at,
      expires_in: account?.expires_in
    };
    const folders = await this.getMetadataFolder(token, pnIdentifier, accountId);
    if (!folders) {
      return null;
    }
    return {
      pnIdentifier,
      token,
      accountId,
      metadataFolderId: folders.metadataFolderId
    };
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

  /** Init-only: discover folders/sheets, verify layout, persist complete pnDriveIndex. */
  private async initializeGoogleDriveStorage(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId: string | undefined,
    credentials: Record<string, unknown>,
    identityId: string,
    logPrefix: string
  ): Promise<{ metadataFolderId: string; pnFolderId: string }> {
    const { runFullDriveInitAndPersist } = await import('./server/modules/driveInitSteps');
    return runFullDriveInitAndPersist(
      token,
      pnIdentifier,
      accountId,
      credentials,
      identityId,
      logPrefix
    );
  }

  private setupMiddleware(): void {
    // OAuth consent page loads USB/NFC unlock helper from same origin
    this.app.use('/oauth-assets', express.static(path.join(__dirname, 'static', 'oauth')));

    // Security middleware
    // Single CSP policy: API serves OAuth consent HTML with inline script/style. A second CSP header
    // on /oauth/consent would stack with this and browsers apply the intersection — blocking inline.
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration with security improvements
    // SECURITY FIX: Restrict no-origin requests to prevent CSRF attacks
    const publicNoOriginPaths = [
      '/health',
      '/health/ready',
      '/favicon.ico',
      '/api/aggregator/metadata-index', 
      '/api/aggregator/nsfw-index',
      '/api/aggregator/fix-feeds',
      '/api/aggregator/metadata-index/debug',
      '/api/monetization/stripe-webhook'
    ];
    const isPublicNoOriginPath = (path: string): boolean =>
      publicNoOriginPaths.some((p) => path === p || path.startsWith(p));

    // Custom CORS middleware that checks path before allowing no-origin requests
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      const path = req.path || req.url?.split('?')[0] || '';
      const isPublicPath = isPublicNoOriginPath(path);

      // SECURITY FIX: In production, block no-origin requests except for public endpoints
      // and OAuth consent HTML entry (top-level navigation from allowed first-party sites).
      if (!origin && NODE_ENV === 'production' && !isPublicPath && !isOAuthBrowserHtmlEntryGet(req)) {
        console.error(`[CORS] Blocked no-origin request to ${path} in production`);
        res.status(403).json({ error: 'Origin header required in production' });
        return;
      }

      // Continue to standard CORS middleware
      next();
    });

    this.app.use((req, res, next) => {
      const allowNoOriginOAuthHtml = isOAuthBrowserHtmlEntryGet(req);
      const pathForCors = req.path || req.url?.split('?')[0] || '';

      return cors({
        origin: (origin, callback) => {
          if (!origin) {
            if (NODE_ENV === 'development') {
              console.warn(`[CORS] Allowing no-origin request (development mode)`);
              return callback(null, true);
            }
            if (allowNoOriginOAuthHtml) {
              return callback(null, true);
            }
            if (isPublicNoOriginPath(pathForCors)) {
              return callback(null, true);
            }
            return callback(new Error('Origin header required'));
          }

          if (ALLOWED_ORIGINS.includes(origin)) {
            if (NODE_ENV === 'development') {
              console.log(`[CORS] Allowing origin: ${origin}`);
            }
            callback(null, true);
          } else if (isSameOriginAsApiHost(origin, req)) {
            callback(null, true);
          } else {
            console.error(`[CORS] Blocked origin: ${origin}. Allowed origins:`, ALLOWED_ORIGINS);
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Accept',
          'X-Admin-Key',
          'X-Request-Id',
          // Device proof headers (see packages/device-client proofHeaders + DEVICE_AUTH.md)
          'X-PN-Device-Id',
          'X-PN-Device-Signature',
          'X-PN-Device-Timestamp',
          'X-PN-Device-Nonce',
        ],
        exposedHeaders: ['Content-Type'],
        maxAge: 86400, // 24 hours
        preflightContinue: false, // Handle preflight immediately
      })(req, res, next);
    });

    // Compression
    this.app.use(compression());

    // Request id + structured access log (no query string — may contain tokens)
    this.app.use((req, res, next) => {
      const incoming = req.headers['x-request-id'];
      const requestId =
        typeof incoming === 'string' && incoming.trim() ? incoming.trim() : crypto.randomUUID();
      (req as express.Request & { requestId?: string }).requestId = requestId;
      res.setHeader('X-Request-Id', requestId);
      const started = Date.now();
      res.on('finish', () => {
        const pathOnly = req.path || req.url?.split('?')[0] || '';
        const enableAccessLog =
          NODE_ENV === 'development' || process.env.ACCESS_LOG_JSON === 'true';
        if (enableAccessLog) {
          console.log(
            JSON.stringify({
              level: 'access',
              requestId,
              method: req.method,
              path: pathOnly,
              status: res.statusCode,
              ms: Date.now() - started
            })
          );
        }
      });
      next();
    });

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
      // OAuth token exchange has oauthTokenLimiter; avoid double-counting on the general limiter
      if (req.path === '/oauth/token' && req.method === 'POST') {
        return next();
      }
      // Public config is needed before unlock / Drive connect; keep it off the strict IP bucket
      if (req.path === '/api/public-config' && req.method === 'GET') {
        return next();
      }
      // Drive init status polling during multi-minute setup
      if (req.method === 'GET' && /^\/api\/storage\/initialize\/[^/]+\/status$/.test(req.path)) {
        return next();
      }
      // Public successor lookup on unlock (no auth)
      if (req.path === '/api/v1/identity/successor' && req.method === 'GET') {
        return next();
      }
      // Apply lenient limiter for read-only endpoints and bulk operations
      if (
        (req.method === 'GET' && (
          req.path.startsWith('/api/profile/') ||
          req.path.startsWith('/api/feeds') ||
          req.path.startsWith('/api/users/') ||
          req.path.startsWith('/api/engagement/') ||
          req.path.startsWith('/api/notifications') ||
          req.path.startsWith('/api/activity-ledger') ||
          req.path.startsWith('/api/connections') ||
          req.path.startsWith('/api/messages') ||
          req.path.startsWith('/api/monetization/status') ||
          req.path.startsWith('/api/creator-fund/periods/recent') ||
          req.path.startsWith('/api/v1/music/registry/catalog') ||
          (req.method === 'GET' && req.path.startsWith('/api/v1/music/registry/post-uses/'))
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
    // Exception: POST /api/drive/files needs 200mb for video/encrypted uploads (free tier 100MB raw)
    // Exception: Stripe webhooks require raw body for signature verification
    this.app.use((req, res, next) => {
      const p = req.path || req.url?.split('?')[0] || '';
      if (req.method === 'POST' && p === '/api/monetization/stripe-webhook') {
        return express.raw({ type: 'application/json', limit: '1mb' })(req, res, next);
      }
      const limit = req.method === 'POST' && p === '/api/drive/files' ? '200mb' : '10mb';
      return express.json({ limit })(req, res, next);
    });
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
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    metadataFolderId: string,
    pnIdentifier: string,
    accountId?: string
  ): Promise<any | null> {
    try {
      const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
      return IndexStorageService.getOwnerFileIndex(pnIdentifier, token, metadataFolderId, accountId);
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
  /**
   * Sheets index updates are non-blocking for the browse feed (Postgres is authoritative).
   * Run after the HTTP response so publish feels fast.
   */
  private scheduleDriveIndexUpdates(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    pnFolderId: string,
    fileMetadata: any,
    accountId: string | undefined,
    options: { isNewFile: boolean; isPublic: boolean }
  ): void {
    const indexOpts = { isNewFile: options.isNewFile, skipPublicPermission: true };
    void Promise.all([
      this.updateOwnerFileIndex(token, pnIdentifier, metadataFolderId, fileMetadata, accountId, indexOpts),
      options.isPublic
        ? this.updatePublicFileIndex(
            token,
            pnIdentifier,
            metadataFolderId,
            pnFolderId,
            fileMetadata,
            accountId,
            indexOpts
          )
        : Promise.resolve(),
    ]).catch((err) => {
      safeLogger.warn('[MetadataIndex] Background Sheets index update failed', {
        fileId: fileMetadata?.fileId,
        error: err as Error,
      });
    });
  }

  private async updateOwnerFileIndex(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    fileMetadata: any,
    accountId?: string,
    options?: { isNewFile?: boolean; skipPublicPermission?: boolean }
  ): Promise<void> {
    const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
    const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
    const accessToken = token.access_token;

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
      backend: fileMetadata.backend,
      backendFileId: fileMetadata.backendFileId ?? fileMetadata.googleDriveFileId,
      backendAccountId: fileMetadata.backendAccountId,
      googleDriveFileId: fileMetadata.googleDriveFileId ?? fileMetadata.backendFileId,
      fileName: fileMetadata.fileName,
      originalName: fileMetadata.originalName,
      mimeType: fileMetadata.mimeType,
      size: fileMetadata.size,
      visibility: fileMetadata.visibility,
      uploadedAt: fileMetadata.uploadedAt,
      owner: fileMetadata.owner,
      tags: fileMetadata.tags || [],
      description: fileMetadata.description,
      publicToken: fileMetadata.publicToken,
      engagement: fileMetadata.engagement,
      inReplyTo: fileMetadata.inReplyTo,
      repostOf: fileMetadata.repostOf,
      isPartOf: fileMetadata.isPartOf,
      indexingPermissions: fileMetadata.indexingPermissions,
      contentClass: contentClass,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      mainFileId: metadataAny.mainFileId,
      thumbnailFileId: metadataAny.thumbnailFileId,
      collectionFileIds: metadataAny.collectionFileIds ?? metadataAny.collection?.collectionFileIds
    };

    const existingEntry = options?.isNewFile
      ? null
      : await IndexStorageService.getFileById(
          pnIdentifier,
          'owner',
          fileMetadata.fileId,
          token,
          metadataFolderId,
          accountId
        );

    if (existingEntry) {
      if (!indexEntry.publicToken && existingEntry.publicToken) {
        indexEntry.publicToken = existingEntry.publicToken;
      }

      if (existingEntry.engagement) {
        indexEntry.engagement = {
          views: indexEntry.engagement?.views ?? existingEntry.engagement.views ?? 0,
          likes: indexEntry.engagement?.likes ?? existingEntry.engagement.likes ?? 0,
          comments: indexEntry.engagement?.comments ?? existingEntry.engagement.comments ?? 0,
          shares: indexEntry.engagement?.shares ?? existingEntry.engagement.shares ?? 0,
          lastUpdated: indexEntry.engagement?.lastUpdated || existingEntry.engagement.lastUpdated || fileMetadata.uploadedAt
        };
      }

      await IndexStorageService.updateFile(
        pnIdentifier,
        'owner',
        fileMetadata.fileId,
        indexEntry,
        token,
        metadataFolderId,
        accountId
      );
    } else {
      await IndexStorageService.addFile(
        pnIdentifier,
        'owner',
        indexEntry,
        token,
        metadataFolderId,
        accountId
      );
    }

    const contentTypeFolderName = indexEntry.contentClass === 'thought' ? 'thoughts' : indexEntry.contentClass === 'collection' ? 'collections' : indexEntry.contentClass;
    const isPortable = await isPortableStorageProvider(pnIdentifier);

    if (isPortable && contentTypeFolderName) {
      const ccFolder = contentTypeFolderName as 'media' | 'thoughts' | 'collections';
      const existingCcEntry = options?.isNewFile
        ? null
        : await IndexStorageService.getFileById(
            pnIdentifier,
            'owner',
            fileMetadata.fileId,
            token,
            metadataFolderId,
            accountId,
            ccFolder
          );
      if (existingCcEntry) {
        await IndexStorageService.updateFile(
          pnIdentifier,
          'owner',
          fileMetadata.fileId,
          indexEntry,
          token,
          metadataFolderId,
          accountId,
          ccFolder
        );
      } else {
        await IndexStorageService.addFile(
          pnIdentifier,
          'owner',
          indexEntry,
          token,
          metadataFolderId,
          accountId,
          ccFolder
        );
      }
      return;
    }

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
        }
      }
    }

    if (contentTypeFolderId) {
      const ccFolder = contentTypeFolderName as 'media' | 'thoughts' | 'collections';
      const existingCcEntry = options?.isNewFile
        ? null
        : await IndexStorageService.getFileById(
            pnIdentifier,
            'owner',
            fileMetadata.fileId,
            token,
            contentTypeFolderId,
            accountId,
            ccFolder
          );
      if (existingCcEntry) {
        await IndexStorageService.updateFile(
          pnIdentifier,
          'owner',
          fileMetadata.fileId,
          indexEntry,
          token,
          contentTypeFolderId,
          accountId,
          ccFolder
        );
      } else {
        await IndexStorageService.addFile(
          pnIdentifier,
          'owner',
          indexEntry,
          token,
          contentTypeFolderId,
          accountId,
          ccFolder
        );
      }
    }
  }

  /**
   * Get public file index
   * Now uses Sheets instead of JSON
   */
  private async getPublicFileIndex(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    metadataFolderId: string,
    pnIdentifier: string,
    accountId?: string
  ): Promise<any | null> {
    try {
      const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
      return IndexStorageService.getPublicFileIndex(pnIdentifier, token, metadataFolderId, accountId);
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
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string,
    accountId?: string
  ): Promise<void> {
    const accessToken = token.access_token; // Keep for backward compatibility in fetch calls
    // Get existing owner index
    const index = await this.getOwnerFileIndex(token, metadataFolderId, pnIdentifier, accountId);
    
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
    const ownerSheetId = await IndexSheetsService.getIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId);
    await IndexSheetsService.setAllFiles(token, ownerSheetId, index.files, pnIdentifier, accountId, index.updatedAt, 'owner');
    
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
          const contentClassIndex = await this.getContentClassOwnerIndex(token, contentTypeFolderId, pnIdentifier, contentTypeFolderName as 'media' | 'thoughts' | 'collections', accountId);
          if (contentClassIndex && contentClassIndex.files) {
            const contentClassInitialLength = contentClassIndex.files.length;
            contentClassIndex.files = contentClassIndex.files.filter(
              (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
            );
            
            if (contentClassIndex.files.length !== contentClassInitialLength) {
              contentClassIndex.updatedAt = new Date().toISOString();
              const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
              const ownerSheetId = await IndexSheetsService.getIndexSheet(token, contentTypeFolderId, 'owner', pnIdentifier, accountId, contentTypeFolderName as 'media' | 'thoughts' | 'collections');
              await IndexSheetsService.setAllFiles(token, ownerSheetId, contentClassIndex.files, pnIdentifier, accountId, contentClassIndex.updatedAt, 'owner');
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
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string,
    accountId?: string
  ): Promise<void> {
    try {
    const accessToken = token.access_token; // Keep for backward compatibility in fetch calls
    // Get existing public index to find the file and determine contentClass
    const index = await this.getPublicFileIndex(token, metadataFolderId, pnIdentifier, accountId);
    
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
    
    const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
    const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
    await IndexStorageService.setAllFiles(
      pnIdentifier,
      'public',
      index.files,
      token,
      metadataFolderId,
      accountId,
      index.updatedAt
    );
    const isPortableRemove = await isPortableStorageProvider(pnIdentifier);
    if (!isPortableRemove) {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      const publicSheetId = await IndexSheetsService.getIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId);
      await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
    }

    if (contentClass) {
      const contentTypeFolderName = contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;
      if (isPortableRemove) {
        const contentClassIndex = await IndexStorageService.getContentClassPublicIndex(
          pnIdentifier,
          contentTypeFolderName as 'media' | 'thoughts' | 'collections',
          token,
          metadataFolderId,
          accountId
        );
        if (contentClassIndex?.files) {
          const before = contentClassIndex.files.length;
          contentClassIndex.files = contentClassIndex.files.filter(
            (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
          );
          if (contentClassIndex.files.length !== before) {
            contentClassIndex.updatedAt = new Date().toISOString();
            await IndexStorageService.setAllFiles(
              pnIdentifier,
              'public',
              contentClassIndex.files,
              token,
              metadataFolderId,
              accountId,
              contentClassIndex.updatedAt,
              contentTypeFolderName as 'media' | 'thoughts' | 'collections'
            );
          }
        }
        return;
      }
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

          const contentClassIndex = await this.getContentClassPublicIndex(token, contentTypeFolderId, pnIdentifier, contentTypeFolderName as 'media' | 'thoughts' | 'collections', accountId);
          if (contentClassIndex && contentClassIndex.files) {
            const contentClassInitialLength = contentClassIndex.files.length;
            contentClassIndex.files = contentClassIndex.files.filter(
              (f: any) => f.googleDriveFileId !== fileId && f.fileId !== fileId
            );
            
            if (contentClassIndex.files.length !== contentClassInitialLength) {
              contentClassIndex.updatedAt = new Date().toISOString();
              await IndexStorageService.setAllFiles(
                pnIdentifier,
                'public',
                contentClassIndex.files,
                token,
                metadataFolderId,
                accountId,
                contentClassIndex.updatedAt,
                contentTypeFolderName as 'media' | 'thoughts' | 'collections'
              );
              if (!isPortableRemove) {
                const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
                const publicSheetId = await IndexSheetsService.getIndexSheet(token, contentTypeFolderId, 'public', pnIdentifier, accountId, contentTypeFolderName as 'media' | 'thoughts' | 'collections');
                await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
              }
            }
          }
        }
      }
    }
    } catch (error) {
      const { isIndexSheetNotFoundError } = await import('./server/modules/indexSheetsService');
      if (isIndexSheetNotFoundError(error)) {
        safeLogger.warn('[removeFromPublicIndex] Public index sheet missing; skipping removal', {
          fileIdHash: hashIdentifier(fileId),
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Update public file index
   */
  private async updatePublicFileIndex(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    pnFolderId: string,
    fileMetadata: any,
    accountId?: string,
    options?: { isNewFile?: boolean; skipPublicPermission?: boolean }
  ): Promise<void> {
    const accessToken = token.access_token;
    const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
    const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
    const isPortablePublic = await isPortableStorageProvider(pnIdentifier);

    const existingRootEntry = options?.isNewFile
      ? null
      : await IndexStorageService.getFileById(
          pnIdentifier,
          'public',
          fileMetadata.fileId,
          token,
          metadataFolderId,
          accountId
        );

    const metadataAny = fileMetadata as any;
    const contentClass = determineContentClass({
      fileType: metadataAny.fileType,
      collection: metadataAny.collection,
      textPost: metadataAny.textPost,
      thought: metadataAny.thought,
      isThoughtThumbnail: metadataAny.isThoughtThumbnail,
      isPartOfCollection: metadataAny.isPartOfCollection
    });
    const contentTypeFolderName =
      contentClass === 'thought' ? 'thoughts' : contentClass === 'collection' ? 'collections' : contentClass;

    if (fileMetadata.visibility === 'public') {
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
        indexingPermissions: fileMetadata.indexingPermissions,
        contentClass,
        isThoughtThumbnail: metadataAny.isThoughtThumbnail,
        mainFileId: metadataAny.mainFileId,
        thumbnailFileId: metadataAny.thumbnailFileId,
        inReplyTo: fileMetadata.inReplyTo,
        repostOf: fileMetadata.repostOf,
        engagement: fileMetadata.engagement
      };

      const isNewPublicFile = !existingRootEntry;

      if (existingRootEntry) {
        const existingAny = existingRootEntry as any;
        if (existingAny.engagement) {
          indexEntry.engagement = {
            views: indexEntry.engagement?.views ?? existingAny.engagement.views ?? 0,
            likes: indexEntry.engagement?.likes ?? existingAny.engagement.likes ?? 0,
            comments: indexEntry.engagement?.comments ?? existingAny.engagement.comments ?? 0,
            shares: indexEntry.engagement?.shares ?? existingAny.engagement.shares ?? 0,
            lastUpdated:
              indexEntry.engagement?.lastUpdated ||
              existingAny.engagement.lastUpdated ||
              fileMetadata.uploadedAt
          };
        }
        await IndexStorageService.updateFile(
          pnIdentifier,
          'public',
          fileMetadata.fileId,
          indexEntry,
          token,
          metadataFolderId,
          accountId
        );
      } else {
        await IndexStorageService.addFile(
          pnIdentifier,
          'public',
          indexEntry,
          token,
          metadataFolderId,
          accountId
        );
      }

      if (isNewPublicFile) {
        try {
          const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
          if (serviceAccountEmail) {
            const permissionsResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions?fields=permissions(emailAddress)`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              }
            );

            let hasPermission = false;
            if (permissionsResponse.ok) {
              const permissionsData = (await permissionsResponse.json()) as {
                permissions?: Array<{ emailAddress?: string }>;
              };
              hasPermission =
                permissionsData.permissions?.some(
                  (p: any) => p.emailAddress === serviceAccountEmail
                ) ?? false;
            }

            if (!hasPermission) {
              await fetch(`https://www.googleapis.com/drive/v3/files/${pnFolderId}/permissions`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  role: 'reader',
                  type: 'user',
                  emailAddress: serviceAccountEmail
                })
              });
            }
          }
        } catch (shareError: any) {
          console.warn(
            `[Upload] Failed to share folder with service account:`,
            shareError?.message || shareError
          );
        }
      }
    } else if (existingRootEntry) {
      await IndexStorageService.removeFile(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        token,
        metadataFolderId,
        accountId
      );
    }

    if (!isPortablePublic && !options?.skipPublicPermission) {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      const publicSheetId = await IndexSheetsService.getIndexSheet(
        token,
        metadataFolderId,
        'public',
        pnIdentifier,
        accountId
      );
      await this.setPublicPermissionOnDriveFile(accessToken, publicSheetId);
    }

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
          const createData = (await createRes.json()) as { id: string };
          contentTypeFolderId = createData.id;
        }
      }
    }

    if (!contentTypeFolderName) {
      return;
    }

    const ccFolder = contentTypeFolderName as 'media' | 'thoughts' | 'collections';
    const contentClassFolderId = isPortablePublic ? metadataFolderId : contentTypeFolderId;
    if (!contentClassFolderId) {
      return;
    }

    const existingContentClassEntry = options?.isNewFile
      ? null
      : await IndexStorageService.getFileById(
          pnIdentifier,
          'public',
          fileMetadata.fileId,
          token,
          contentClassFolderId,
          accountId,
          ccFolder
        );

    if (fileMetadata.visibility === 'public') {
      const contentClassIndexEntry: any = isPortablePublic
        ? {
            ...this.companionToPublicMetadata(fileMetadata, fileMetadata.owner.did),
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
            indexingPermissions: fileMetadata.indexingPermissions
          }
        : {
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
            indexingPermissions: fileMetadata.indexingPermissions,
            contentClass,
            isThoughtThumbnail: metadataAny.isThoughtThumbnail,
            mainFileId: metadataAny.mainFileId,
            thumbnailFileId: metadataAny.thumbnailFileId,
            engagement: fileMetadata.engagement
          };

      if (existingContentClassEntry) {
        const existingAny = existingContentClassEntry as any;
        if (existingAny.engagement) {
          contentClassIndexEntry.engagement = {
            views: contentClassIndexEntry.engagement?.views ?? existingAny.engagement.views ?? 0,
            likes: contentClassIndexEntry.engagement?.likes ?? existingAny.engagement.likes ?? 0,
            comments: contentClassIndexEntry.engagement?.comments ?? existingAny.engagement.comments ?? 0,
            shares: contentClassIndexEntry.engagement?.shares ?? existingAny.engagement.shares ?? 0,
            lastUpdated:
              contentClassIndexEntry.engagement?.lastUpdated ||
              existingAny.engagement.lastUpdated ||
              fileMetadata.uploadedAt
          };
        }
        await IndexStorageService.updateFile(
          pnIdentifier,
          'public',
          fileMetadata.fileId,
          contentClassIndexEntry,
          token,
          contentClassFolderId,
          accountId,
          ccFolder
        );
      } else {
        await IndexStorageService.addFile(
          pnIdentifier,
          'public',
          contentClassIndexEntry,
          token,
          contentClassFolderId,
          accountId,
          ccFolder
        );
      }
    } else if (existingContentClassEntry) {
      await IndexStorageService.removeFile(
        pnIdentifier,
        'public',
        fileMetadata.fileId,
        token,
        contentClassFolderId,
        accountId,
        ccFolder
      );
    }

    if (!isPortablePublic && contentTypeFolderId && !options?.skipPublicPermission) {
      const { IndexSheetsService } = await import('./server/modules/indexSheetsService');
      const contentClassPublicSheetId = await IndexSheetsService.getIndexSheet(
        token,
        contentTypeFolderId,
        'public',
        pnIdentifier,
        accountId,
        ccFolder
      );
      await this.setPublicPermissionOnDriveFile(accessToken, contentClassPublicSheetId);
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
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    folderId: string,
    pnIdentifier: string,
    contentClass: 'media' | 'thoughts' | 'collections',
    accountId?: string
  ): Promise<any | null> {
    try {
      const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
      return IndexStorageService.getContentClassPublicIndex(
        pnIdentifier,
        contentClass,
        token,
        folderId,
        accountId
      );
    } catch (e) {
      console.warn('[getContentClassPublicIndex]', e);
      return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
    }
  }

  /**
   * Get content class-specific owner index (Sheets)
   */
  private async getContentClassOwnerIndex(
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    folderId: string,
    pnIdentifier: string,
    contentClass: 'media' | 'thoughts' | 'collections',
    accountId?: string
  ): Promise<any | null> {
    try {
      const { IndexStorageService } = await import('./server/modules/storage/indexStorageService');
      return IndexStorageService.getContentClassOwnerIndex(
        pnIdentifier,
        contentClass,
        token,
        folderId,
        accountId
      );
    } catch (e) {
      console.warn('[getContentClassOwnerIndex]', e);
      return { identifier: pnIdentifier, files: [], updatedAt: new Date().toISOString() };
    }
  }

  private async setupRoutes(): Promise<void> {
    registerCoreRoutes(this.app, NODE_ENV);

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
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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

    this.app.post('/api/auth/verify', (_req, res) => {
      return res.status(410).json({
        error: 'gone',
        error_description: 'Legacy auth verify removed. Use pN OAuth (/oauth/token).'
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
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
          files: [],
          total: 0,
          hasMore: false
        });
      }
    });

    // API Routes (v1) - OAuth, Data Points, Content Portability
    const {
      setupIdentityPublicRoutes,
      setupOAuthRoutes,
      setupDataPointRoutes,
      setupDataPointUserRoutes,
      setupContentPortabilityRoutes
    } = await import('./server/modules/apiRoutes');
    setupIdentityPublicRoutes(this.app);
    setupOAuthRoutes(this.app);
    setupDataPointRoutes(this.app);
    setupDataPointUserRoutes(this.app);
    setupContentPortabilityRoutes(this.app);

    // Feed Routes - Posts, Subscriptions, Payment Webhooks
    const { setupFeedRoutes } = await import('./server/modules/feedRoutes');
    setupFeedRoutes(this.app);

    const { setupPrismRoutes } = await import('./server/modules/prismRoutes');
    setupPrismRoutes(this.app);

    const { setupAggregatorRoutes } = await import('./server/modules/aggregatorRoutes');
    setupAggregatorRoutes(this.app, {
      aggregatorLimiter,
      metadataIndexReadLimiter,
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
      scheduleDriveIndexUpdates: (token, pnIdentifier, metadataFolderId, pnFolderId, fileMetadata, accountId, options) =>
        this.scheduleDriveIndexUpdates(token, pnIdentifier, metadataFolderId, pnFolderId, fileMetadata, accountId, options),
    });

    const { setupEngagementRoutes } = await import('./server/modules/engagementRoutes');
    setupEngagementRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
    });

    const { setupContentNoticeRoutes } = await import('./server/modules/contentNoticeRoutes');
    setupContentNoticeRoutes(this.app);

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

        if (!(await gateStorageCredentialsPut(req, res, pnIdentifier))) return;

        if (!credentials) {
          return res.status(400).json({ error: 'Missing credentials in request body' });
        }

        const { isPnRevokedForNetwork } = await import('./server/modules/identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description:
              'This pN identifier is retired on the par Noir network. Use your successor identity for storage and services.'
          });
        }

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { isDeviceCloudCustodyEnabled } = await import('./server/modules/socialMailboxService');
        let credentialsToStore = credentials;
        if (isDeviceCloudCustodyEnabled()) {
          // Prefer layout-only persistence; clients seal secrets on device.
          credentialsToStore = storageCredentialsService.stripCloudSecrets(
            credentials as Record<string, unknown>
          );
          console.log(
            `[StorageCredentials PUT] DEVICE_CLOUD_CUSTODY=1 — stripped cloud secrets for identity`
          );
        }
        const record = await storageCredentialsService.upsertCredentials(
          pnIdentifier,
          credentialsToStore,
          cid
        );
        
        // SECURITY: Use sanitized identityId in logs
        console.log(`[StorageCredentials PUT] Successfully saved credentials for identityId: ${sanitizedIdentityId}`);

        let directoryBuilt = true;
        let folderInitError: string | null = null;

        try {
          const {
            inferPrimaryProviderFromCredentials,
            shouldInitializePortable,
            initializePortableStorage
          } = await import('./server/modules/storage/storageInitService');
          const inferred = inferPrimaryProviderFromCredentials(credentials);
          if (shouldInitializePortable(inferred) && inferred.primaryProvider !== 'google_drive') {
            await initializePortableStorage(pnIdentifier, inferred);
            console.log(`[StorageCredentials PUT] Initialized portable storage for ${inferred.primaryProvider}`);
          }
        } catch (portableInitErr: any) {
          console.warn(`[StorageCredentials PUT] Portable init warning:`, portableInitErr?.message || portableInitErr);
          folderInitError = portableInitErr?.message || 'Portable storage init failed';
        }

        // Initialize Google Drive folder structure if this is a new Google Drive connection
        const hasGoogleDrive = credentials?.googleDriveAccounts?.length > 0 || credentials?.googleDrive;
        const deviceCustody = isDeviceCloudCustodyEnabled();
        let clientSideLayoutRequired = false;
        if (hasGoogleDrive) {
          try {
            const googleDriveAccounts = credentials.googleDriveAccounts ||
              (credentials.googleDrive ? [credentials.googleDrive] : []);

            if (googleDriveAccounts.length > 0) {
              if (deviceCustody) {
                // OAuth secrets are device-held — server POST /storage/initialize cannot run.
                // Dashboard must discover/build Drive layout with the local Google token.
                clientSideLayoutRequired = true;
                directoryBuilt = true;
                console.log(
                  `[StorageCredentials PUT] DEVICE_CLOUD_CUSTODY — client-side Drive layout required for identityId: ${sanitizedIdentityId}`
                );
              } else {
                // Credentials are saved. The full Drive layout build is a long, multi-minute
                // operation that must run inside a request that is actually awaited by the client.
                // The dashboard always calls POST /api/storage/initialize right after this PUT and
                // awaits it, so we do NOT fire-and-forget here (that races and can be abandoned when
                // the HTTP response returns). Just report that init still needs to run.
                console.log(`[StorageCredentials PUT] Credentials saved; Drive layout build deferred to /storage/initialize for identityId: ${sanitizedIdentityId}`);
                directoryBuilt = false;
              }
            }
          } catch (err: any) {
            directoryBuilt = false;
            folderInitError = err?.message || String(err);
            console.warn(`[StorageCredentials PUT] Failed to prepare folder init for identityId: ${sanitizedIdentityId}`, folderInitError);
          }
        }

        return res.json({
          success: true,
          identityId: record.identityId,
          cid: record.cid ?? null,
          updatedAt: record.updatedAt,
          directoryBuilt,
          initInProgress: hasGoogleDrive && !directoryBuilt && !clientSideLayoutRequired,
          ...(clientSideLayoutRequired && { clientSideLayoutRequired: true }),
          ...(folderInitError != null && { folderInitError })
        });
      } catch (error: any) {
        console.error('Error saving storage credentials:', error);
        return res.status(500).json({
          error: 'Failed to save storage credentials',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

        const { isPnRevokedForNetwork } = await import('./server/modules/identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description:
              'This pN identifier is retired on the par Noir network. Cloud storage and synced state are bound to your successor identity.'
          });
        }

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
          record = await storageCredentialsService.getCredentials(pnIdentifier);
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
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // POST /api/storage/initialize/:identityId - Re-initialize Google Drive folder structure
    this.app.post('/api/storage/initialize/:identityId', async (req, res) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        const sanitizedIdentityId = identityId.replace(/[^a-zA-Z0-9-]/g, '');
        const pnIdentifier = sanitizedIdentityId.startsWith('pn-') ? sanitizedIdentityId : `pn-${sanitizedIdentityId}`;

        const { isPnRevokedForNetwork } = await import('./server/modules/identitySuccessionService');
        if (isPnRevokedForNetwork(pnIdentifier)) {
          return res.status(403).json({
            error: 'identity_superseded',
            error_description: 'This pN identifier is retired on the par Noir network.'
          });
        }

        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        
        const credentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!credentials?.credentials) {
          return res.status(404).json({ error: 'No storage credentials found for identity' });
        }

        const googleDriveAccounts = credentials.credentials.googleDriveAccounts || 
          (credentials.credentials.googleDrive ? [credentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive accounts connected' });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;

        // Use a fresh (auto-refreshed) access token from the proxy. Init can take several minutes;
        // a token minted at OAuth time may expire mid-build and silently stall folder/sheet creation.
        let freshAccessToken: string | null = null;
        try {
          freshAccessToken = await googleDriveProxyService.getAccessToken(
            pnIdentifier,
            accountId,
            [pnIdentifier]
          );
        } catch (tokenErr: any) {
          console.warn(
            `[StorageInitialize POST] Could not refresh access token, falling back to stored token:`,
            tokenErr?.message || tokenErr
          );
        }

        const token = {
          access_token: freshAccessToken || account.access_token || account.accessToken,
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const accessToken = token.access_token;

        if (!accessToken) {
          return res.status(400).json({
            error: 'No Google Drive access token available for this identity'
          });
        }

        console.log(`[StorageInitialize POST] Re-initializing folder structure for identityId: ${sanitizedIdentityId}`);
        
        try {
          const { runDriveInitOnce } = await import('./server/modules/driveInitCoordinator');
          const { withGoogleRetry } = await import('./server/modules/googleApiRetry');
          const { metadataFolderId, pnFolderId } = await withGoogleRetry(
            'driveInitFull',
            () =>
              runDriveInitOnce(pnIdentifier, () =>
                this.initializeGoogleDriveStorage(
                  token,
                  pnIdentifier,
                  accountId,
                  credentials.credentials as Record<string, unknown>,
                  sanitizedIdentityId,
                  `[StorageInitialize POST]`
                )
              ),
            3
          );

          return res.json({
            success: true,
            message: 'Google Drive folder structure initialized successfully',
            identityId: pnIdentifier,
            metadataFolderId,
            pnFolderId
          });
        } catch (initError: any) {
          console.error(`[StorageInitialize POST] Failed to initialize:`, initError);
          const { isRetryableGoogleError } = await import('./server/modules/googleApiRetry');
          const retryable = isRetryableGoogleError(initError);
          return res.status(retryable ? 503 : 500).json({
            error: 'Failed to initialize Google Drive folder structure',
            message: initError.message || String(initError),
            retryable,
            details: 'Check Railway logs for more details'
          });
        }
      } catch (error: any) {
        console.error('Error in storage initialize endpoint:', error);
        return res.status(500).json({
          error: 'Failed to initialize storage',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    // GET /api/storage/initialize/:identityId/status - Poll Drive layout init progress
    this.app.get('/api/storage/initialize/:identityId/status', async (req, res) => {
      try {
        const { identityId } = req.params;
        if (!identityId) {
          return res.status(400).json({ error: 'Missing identityId parameter' });
        }

        const sanitizedIdentityId = identityId.replace(/[^a-zA-Z0-9-]/g, '');
        const pnIdentifier = sanitizedIdentityId.startsWith('pn-')
          ? sanitizedIdentityId
          : `pn-${sanitizedIdentityId}`;

        const { isDriveInitInFlight } = await import('./server/modules/driveInitCoordinator');
        const { getDriveInitProgress, isDriveInitProgressActive } = await import(
          './server/modules/driveInitProgress'
        );

        const progress = getDriveInitProgress(pnIdentifier);
        const inFlight = isDriveInitInFlight(pnIdentifier) || isDriveInitProgressActive(pnIdentifier);

        return res.json({
          identityId: pnIdentifier,
          inFlight,
          progress,
        });
      } catch (error: unknown) {
        console.error('Error in storage initialize status endpoint:', error);
        return res.status(500).json({
          error: 'Failed to read storage initialize status',
          message: safeClientErrorMessage(error, NODE_ENV === 'production'),
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
        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;
        const contentClassFilter = req.query.contentClass as string | undefined;

        const { isPortableSocialCloud } = await import('./server/modules/storage/storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          const { handleGetOwnerIndex } = await import('./server/modules/storage/indexHttpHandlers');
          await handleGetOwnerIndex(req, res, identityId);
          return;
        }

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');

        // Get user credentials to build token object
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
        const _portableSocial = await isPortableStorageProvider(pnIdentifier || '');
        if (!_portableSocial && googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'Storage not connected' });
        }
        let accountId: string | undefined;
        let token: any = { access_token: '' };
        let accessToken = '';
        let out: any = null;
        if (!_portableSocial) {
          const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
          accountId = this.extractAccountId(account);
          token = {
            access_token: account?.access_token || account?.accessToken || '',
            refresh_token: account?.refresh_token || account?.refreshToken,
            expires_at: account?.expires_at,
            expires_in: account?.expires_in
          };
          accessToken = token.access_token;
          out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        }
        if (!_portableSocial && !out) {
          return res.status(409).json({
            error: 'drive_not_initialized',
            code: 'DRIVE_INDEX_INCOMPLETE',
            message:
              'Google Drive layout is missing or was deleted. Re-save Google Drive in Storage settings to rebuild.',
          });
        }

        // Merged view: aggregate from content-class indices, fallback to root
        const contentTypes: Array<'media' | 'thoughts' | 'collections'> =
          contentClassFilter === 'media' || contentClassFilter === 'thoughts' || contentClassFilter === 'collections'
            ? [contentClassFilter]
            : ['media', 'thoughts', 'collections'];
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
          const idx = await this.getContentClassOwnerIndex(token, folderData.files[0].id, identityId, contentType, accountId);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        // Fallback to root owner index
        const rootIndex = await this.getOwnerFileIndex(token, out.metadataFolderId, identityId, accountId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[OwnerIndex] Error:', error?.message || error);
        const msg = error?.message || String(error);
        if (error?.name === 'DriveIndexError' && error?.code === 'DRIVE_INDEX_STALE') {
          return res.status(409).json({
            error: 'drive_index_stale',
            code: 'DRIVE_INDEX_STALE',
            message: msg,
          });
        }
        if (msg.includes('Sheet not found') || msg.includes('File not found')) {
          try {
            const rawId = req.params.identityId;
            if (rawId) {
              const stalePn = rawId.startsWith('pn-') ? rawId : `pn-${rawId}`;
              const { clearPnDriveIndex } = await import('./server/modules/pnDriveIndex');
              await clearPnDriveIndex(stalePn);
            }
          } catch {
            /* best-effort */
          }
          return res.status(409).json({
            error: 'drive_index_stale',
            code: 'DRIVE_INDEX_STALE',
            message:
              'Google Drive metadata was deleted or is out of date. Re-save Google Drive in Storage settings to rebuild.',
          });
        }
        return res.status(500).json({
          error: 'Failed to read owner index',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

        const { isPortableSocialCloud } = await import('./server/modules/storage/storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          await this.updateOwnerFileIndex(
            { access_token: '' },
            identityId,
            '',
            entry,
            undefined
          );
          return res.json({ ok: true });
        }

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await this.updateOwnerFileIndex(token, identityId, out.metadataFolderId, entry, accountId);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[OwnerIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update owner index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
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

        const { isPortableSocialCloud } = await import('./server/modules/storage/storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          const { handleGetPublicIndex } = await import('./server/modules/storage/indexHttpHandlers');
          await handleGetPublicIndex(req, res, identityId);
          return;
        }

        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'Google Drive not connected for this identity' });
        }
        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const accessToken = token.access_token;

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }

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
          const idx = await this.getContentClassPublicIndex(token, folderData.files[0].id, identityId, contentType, accountId);
          if (idx?.files?.length) allFiles.push(...idx.files);
        }
        if (allFiles.length > 0) {
          return res.json({ identifier: identityId, files: allFiles, updatedAt: new Date().toISOString() });
        }

        const rootIndex = await this.getPublicFileIndex(token, out.metadataFolderId, identityId, accountId);
        if (!rootIndex) {
          return res.json({ identifier: identityId, files: [], updatedAt: new Date().toISOString() });
        }
        return res.json({ identifier: identityId, files: rootIndex.files, updatedAt: rootIndex.updatedAt });
      } catch (error: any) {
        console.error('[PublicIndex] Error:', error?.message || error);
        return res.status(500).json({
          error: 'Failed to read public index',
          message: safeClientErrorMessage(error, NODE_ENV === 'production')
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

        const { isPortableSocialCloud } = await import('./server/modules/storage/storageProviderUtils');
        if (await isPortableSocialCloud(pnIdentifier)) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;
          await this.updatePublicFileIndex(
            { access_token: '' },
            identityId,
            '',
            '',
            entry,
            undefined
          );
          return res.json({ ok: true });
        }

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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };

        const out = await this.getMetadataFolder(token, pnIdentifier, accountId);
        if (!out) {
          return res.status(409).json({ error: 'DRIVE_NOT_INITIALIZED', message: 'Connect and initialize Google Drive first.' });
        }

        await this.updatePublicFileIndex(token, identityId, out.metadataFolderId, out.pnFolderId, entry, accountId);
        return res.json({ ok: true });
      } catch (error: any) {
        console.error('[PublicIndex POST] Error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to update public index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // GET /api/storage/accounts/:identityId — registered in storageRoutes (multi-provider)

    // ============================================================================
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
        res.status(500).json({ error: 'Failed to get recommendations', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
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
        
        let isNewView = false;
        // Try to insert first (optimistic path - most common case)
        try {
          await db.query(`
            INSERT INTO file_views (file_id, user_did, view_duration, viewed_at)
            VALUES ($1, $2, $3::DECIMAL, NOW())
          `, [fileId, userPnIdentifier, viewDuration || 0]);
          isNewView = true;
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

        if (isNewView) {
          // Update aggregator metadata engagement.views (best-effort; do not fail response)
          try {
            const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
            await AggregatorMetadataServiceDB.getInstance().updateEngagement(fileId, 'view', userPnIdentifier);
          } catch (engagementError: any) {
            console.warn('[file-views] Failed to update aggregator metadata engagement:', engagementError?.message || engagementError);
          }

          // Update creator's companion metadata Sheets (best-effort)
          try {
            const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
            const { CompanionMetadataSheets } = await import('./server/modules/companionMetadataSheets');
            const { appendOwnerCompanionEngagement } = await import('./server/modules/engagementCompanionSync');
            const fileMetadata = await AggregatorMetadataServiceDB.getInstance().getFileMetadata(fileId);
            if (fileMetadata) {
              const ownerDid =
                fileMetadata.pnIdentifier ||
                (fileMetadata.metadata as any).creator?.['@id'] ||
                (fileMetadata.metadata as any).author?.did;
              if (ownerDid) {
                await appendOwnerCompanionEngagement(fileId, ownerDid, 'view', {
                    fileId,
                    viewerPnIdentifier: userPnIdentifier,
                    timestamp: new Date().toISOString()
                  });
              }
            }
          } catch (sheetError: any) {
            console.warn('[file-views] Failed to update creator companion metadata sheet for view:', sheetError?.message || sheetError);
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
        return res.status(500).json({ error: 'Failed to sync verification status', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    // Feed CRUD, subscription, saved-feed and discovery routes are registered by
    // setupFeedRoutes (see server/modules/feedRoutes).

    // User-scoped routes (/api/users/*) are registered by setupUserRoutes
    // (see server/modules/userRoutes).

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
        return res.status(500).json({ error: 'Failed to get subscriber index', message: safeClientErrorMessage(error, NODE_ENV === 'production') });
      }
    });

    setupGoogleOAuthRoutes(this.app, { oauthTokenLimiter });

    setupDriveRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      removeFromOwnerIndex: (token, pnIdentifier, metadataFolderId, fileId, accountId) =>
        this.removeFromOwnerIndex(token, pnIdentifier, metadataFolderId, fileId, accountId),
      removeFromPublicIndex: (token, pnIdentifier, metadataFolderId, fileId, accountId) =>
        this.removeFromPublicIndex(token, pnIdentifier, metadataFolderId, fileId, accountId),
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
      captureApiRouteError(err, req);
      const rid =
        (req as express.Request & { requestId?: string }).requestId ||
        (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : 'unknown');
      const errorResponse = {
        error: 'Internal Server Error',
        status: 500,
        timestamp: new Date().toISOString(),
        requestId: rid
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

  /**
   * WebSocket (Socket.IO) setup.
   * Set SOCKET_REQUIRE_AUTH=true in production to require a valid OAuth access token
   * (socket.handshake.auth.token or Authorization: Bearer header). Otherwise connections
   * are anonymous; keep handlers public / non-sensitive only.
   */
  private setupWebSockets(): void {
    const { PNOAuthService } = require('./server/modules/pnOAuthService');
    const requireAuth = process.env.SOCKET_REQUIRE_AUTH === 'true';

    // Always resolve the token when present so we can join the per-pN room for
    // realtime delivery. When SOCKET_REQUIRE_AUTH is on, reject unauthenticated
    // sockets; otherwise allow anonymous connects but still key authenticated ones.
    this.io.use((socket, next) => {
      try {
        const auth = socket.handshake.auth as { token?: string } | undefined;
        const header = socket.handshake.headers.authorization;
        const raw =
          (auth?.token && String(auth.token).trim()) ||
          (typeof header === 'string' && header.startsWith('Bearer ')
            ? header.slice(7).trim()
            : '');
        if (!raw) {
          return requireAuth ? next(new Error('Unauthorized')) : next();
        }
        const tokenPayload = PNOAuthService.validateAccessToken(raw);
        if (!tokenPayload) {
          return requireAuth ? next(new Error('Unauthorized')) : next();
        }
        (socket.data as { oauth?: typeof tokenPayload }).oauth = tokenPayload;
        return next();
      } catch {
        return requireAuth ? next(new Error('Unauthorized')) : next();
      }
    });

    this.io.on('connection', (socket) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Client connected: ${socket.id}`);
      }

      const oauth = (socket.data as { oauth?: { pnIdentifier?: string } }).oauth;
      if (oauth?.pnIdentifier) {
        const { pnRoomId } = require('./server/modules/realtimeEvents');
        socket.join(pnRoomId(oauth.pnIdentifier));
      }

      socket.on('disconnect', () => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Client disconnected: ${socket.id}`);
        }
      });

      // Handle authentication events (challenge/response; no Bearer validation yet)
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

    const { registerRealtimeEmitter } = require('./server/modules/realtimeEvents');
    registerRealtimeEmitter((pn: string, event: string, payload: Record<string, unknown>) => {
      this.emitRealtime(pn, event, payload);
    });
  }

  private emitRealtime(pnIdentifier: string, event: string, payload: Record<string, unknown>): void {
    try {
      const { pnRoomId } = require('./server/modules/realtimeEvents');
      this.io.to(pnRoomId(pnIdentifier)).emit(event, payload);
    } catch (err: unknown) {
      console.warn('[Realtime] emit failed:', (err as Error)?.message);
    }
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
    setupPnOAuthRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      oauthTokenLimiter,
    });

    registerAdminDeveloperRoutes(this.app);
    registerIdentityMigrationRoutes(this.app);
    registerDeviceAuthRoutes(this.app);
    registerRecoveryVaultRoutes(this.app);
    registerDeveloperSelfServiceRoutes(this.app);
    registerPlatformRegistryRoutes(this.app);
    registerOwnedAssetRoutes(this.app);
    registerVerificationRoutes(this.app);
    registerMusicTrackRegistryRoutes(this.app);
    registerStripeMonetizationRoutes(this.app);
    registerCreatorFundPeriodRoutes(this.app);
    registerIntegratorRoutes(this.app);
    registerStorageRoutes(this.app, NODE_ENV);
    registerMailboxRoutes(this.app, NODE_ENV);
  }

  /**
   * Setup notification API endpoints
   */
  private setupNotificationEndpoints(): void {
    // GET /api/notifications - Get user's notifications
    setupMessageRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
      emitRealtime: (pnIdentifier, event, payload) => this.emitRealtime(pnIdentifier, event, payload),
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

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update profile image'
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

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update display name'
        });
      }
    });

    // GET /api/search/personal - Search user's own indexed files (minimal personal history)
    this.app.get('/api/search/personal', async (req, res) => {
      try {
        const userPnIdentifier = String(req.query.userPnIdentifier || '').trim();
        const q = String(req.query.q || '').trim();
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
        const offset = parseInt(String(req.query.offset || '0'), 10) || 0;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }
        const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
        const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
        const service = AggregatorMetadataServiceDB.getInstance();
        const result = await service.searchMetadata(q, {
          authorDid: normalized,
          limit: limit + offset,
          offset: 0
        });
        const slice = result.files.slice(offset, offset + limit);
        return res.json({
          files: slice.map((entry: { metadata: unknown }) => entry.metadata),
          total: result.total,
          hasMore: offset + limit < result.total
        });
      } catch (error: unknown) {
        console.error('Error in personal search:', error);
        return res.status(500).json({ error: 'Failed to search personal history' });
      }
    });

    // GET /api/profile/search - Search user profiles by display name or pn id
    this.app.get('/api/profile/search', async (req, res) => {
      try {
        const q = String(req.query.q || '').trim();
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
        if (!q) {
          return res.json({ profiles: [] });
        }
        const db = (await import('./server/utils/database')).getDatabasePool();
        const pattern = `%${q.replace(/[%_]/g, '')}%`;
        const result = await db.query(
          `SELECT pn_identifier, display_name FROM user_profiles
           WHERE display_name ILIKE $1 OR pn_identifier ILIKE $1
           ORDER BY updated_at DESC NULLS LAST
           LIMIT $2`,
          [pattern, limit]
        );
        return res.json({
          profiles: result.rows.map((row: { pn_identifier: string; display_name: string | null }) => ({
            pnIdentifier: row.pn_identifier,
            displayName: row.display_name || row.pn_identifier
          }))
        });
      } catch (error: any) {
        console.error('Error searching profiles:', error);
        return res.status(500).json({ error: 'Failed to search profiles' });
      }
    });

    // POST /api/storage/migrate-volume-id — legacy passcode pn id → canonical publicKey id
    this.app.post('/api/storage/migrate-volume-id', async (req, res) => {
      try {
        const { legacyPnIdentifier, canonicalPnIdentifier, publicKey, driveFolderId } = req.body as {
          legacyPnIdentifier?: string;
          canonicalPnIdentifier?: string;
          publicKey?: string;
          driveFolderId?: string;
        };
        if (!legacyPnIdentifier || !canonicalPnIdentifier || !publicKey) {
          return res.status(400).json({ error: 'legacyPnIdentifier, canonicalPnIdentifier, and publicKey are required' });
        }
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');
        const record = await storageCredentialsService.migrateIdentityId(
          legacyPnIdentifier.startsWith('pn-') ? legacyPnIdentifier : `pn-${legacyPnIdentifier}`,
          canonicalPnIdentifier.startsWith('pn-') ? canonicalPnIdentifier : `pn-${canonicalPnIdentifier}`,
          { driveFolderId, publicKey }
        );
        if (!record) {
          return res.status(404).json({ error: 'Legacy credentials not found' });
        }
        return res.json({ success: true, identityId: record.identityId });
      } catch (error: any) {
        console.error('Error migrating volume id:', error);
        return res.status(500).json({ error: 'Failed to migrate volume id' });
      }
    });

    // Recovery requests + custodian roster (Drive-backed)
    this.app.post('/api/recovery/requests', async (req, res) => {
      try {
        const { userPnIdentifier, requestId, publicKey, threshold, claimantName, status } = req.body;
        if (!userPnIdentifier || !requestId || !publicKey) {
          return res.status(400).json({ error: 'userPnIdentifier, requestId, and publicKey are required' });
        }
        const ctx = await this.getRecoveryDriveContext(userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./server/modules/recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        await RecoverySheetsService.upsertRecoveryRequest(
          ctx.token,
          spreadsheetId,
          {
            requestId,
            publicKey,
            status: status || 'pending',
            threshold: threshold || 2,
            sharesJson: '[]',
            claimantName: claimantName || '',
            createdAt: new Date().toISOString()
          },
          ctx.pnIdentifier,
          ctx.accountId
        );
        return res.json({ success: true, spreadsheetId });
      } catch (error: any) {
        console.error('Error saving recovery request:', error);
        return res.status(500).json({ error: 'Failed to save recovery request' });
      }
    });

    this.app.get('/api/recovery/:userPnIdentifier/requests', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        const ctx = await this.getRecoveryDriveContext(userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./server/modules/recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        const requests = await RecoverySheetsService.listRecoveryRequests(
          ctx.token, spreadsheetId, ctx.pnIdentifier, ctx.accountId
        );
        return res.json({ requests });
      } catch (error: any) {
        console.error('Error listing recovery requests:', error);
        return res.status(500).json({ error: 'Failed to list recovery requests' });
      }
    });

    this.app.get('/api/recovery/:userPnIdentifier/requests/:requestId', async (req, res) => {
      try {
        const { userPnIdentifier, requestId } = req.params;
        const ctx = await this.getRecoveryDriveContext(userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./server/modules/recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        const requests = await RecoverySheetsService.listRecoveryRequests(
          ctx.token, spreadsheetId, ctx.pnIdentifier, ctx.accountId
        );
        const reqRow = requests.find((r) => r.requestId === requestId);
        if (!reqRow) return res.status(404).json({ error: 'Recovery request not found' });
        return res.json({ request: reqRow });
      } catch (error: any) {
        console.error('Error fetching recovery request:', error);
        return res.status(500).json({ error: 'Failed to fetch recovery request' });
      }
    });

    this.app.post('/api/recovery/requests/:requestId/approvals', async (req, res) => {
      try {
        const { requestId } = req.params;
        const { userPnIdentifier, approval, threshold } = req.body;
        if (!userPnIdentifier || !approval?.approvalZkp || !approval?.custodianshipZkp || !approval?.custodianId) {
          return res.status(400).json({ error: 'userPnIdentifier and approval ZKP payload are required' });
        }
        const result = await evaluateRecoveryApprovalUpdate({
          userPnIdentifier,
          requestId,
          approval,
          threshold,
        });
        if (!result.ok) {
          return res.status(result.httpStatus || 500).json({
            error: result.error,
            reason: result.reason,
          });
        }
        return res.json({
          success: true,
          status: result.status,
          approvalCount: result.approvalCount,
          includesUnrevokableShare: result.includesUnrevokableShare,
          reason: result.reason,
        });
      } catch (error: any) {
        console.error('Error submitting recovery approval:', error);
        return res.status(500).json({ error: 'Failed to submit recovery approval' });
      }
    });

    /** @deprecated Use POST /api/recovery/requests/:requestId/approvals */
    this.app.post('/api/recovery/requests/:requestId/shares', async (req, res) => {
      return res.status(410).json({ error: 'Share submission deprecated; use /approvals with ZK authorization' });
    });

    this.app.get('/api/recovery/:userPnIdentifier/requests/:requestId/vault-shares', async (req, res) => {
      try {
        const { userPnIdentifier, requestId } = req.params;
        const result = await fetchVaultSharesForRequest({ userPnIdentifier, requestId });
        return res.status(result.httpStatus).json(result.body);
      } catch (error: any) {
        console.error('Error fetching vault shares:', error);
        return res.status(500).json({ error: 'Failed to fetch vault shares' });
      }
    });

    this.app.get('/api/recovery/:userPnIdentifier/custodians', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.custodiansRead, userPnIdentifier))) return;
        const summary = await getRecoveryCustodianSummary(userPnIdentifier);
        if (!summary) return res.status(404).json({ error: 'Drive not connected' });
        return res.json({
          custodians: summary.custodians.map((c) => ({
            custodianId: c.custodianId,
            name: c.name,
            custodianType: c.custodianType,
            shareIndex: c.shareIndex,
            custodianshipCredential: c.custodianshipCredential,
            status: c.status,
            createdAt: c.createdAt,
            unrevokable: c.unrevokable,
            custodianPublicKey: c.custodianPublicKey,
            custodianPnIdentifier: c.custodianPnIdentifier,
          })),
          pending: summary.pending,
          counts: summary.counts,
        });
      } catch (error: any) {
        console.error('Error listing custodians:', error);
        return res.status(500).json({ error: 'Failed to list custodians' });
      }
    });

    this.app.post('/api/recovery/custodians', async (req, res) => {
      try {
        const {
          userPnIdentifier,
          custodianId,
          name,
          custodianType,
          encryptedShare,
          shareIndex,
          custodianshipCredential,
          unrevokable,
        } = req.body;
        if (!userPnIdentifier || !custodianId || !encryptedShare) {
          return res.status(400).json({ error: 'userPnIdentifier, custodianId, and encryptedShare are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.recoveryCustodianManage, userPnIdentifier))) return;

        if (custodianshipCredential) {
          const { verifyCustodianshipCredential } = await import('./server/modules/recoveryZkService');
          const verified = verifyCustodianshipCredential(custodianshipCredential);
          if (!verified.ok) {
            return res.status(400).json({ error: 'Invalid custodianship credential', reason: verified.reason });
          }
          if (verified.data?.custodianId !== custodianId) {
            return res.status(400).json({ error: 'Custodianship custodianId mismatch' });
          }
        }
        const ctx = await this.getRecoveryDriveContext(userPnIdentifier);
        if (!ctx) return res.status(404).json({ error: 'Drive not connected' });
        const { RecoverySheetsService } = await import('./server/modules/recoverySheetsService');
        const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
          ctx.token, ctx.metadataFolderId, ctx.pnIdentifier, ctx.accountId
        );
        await RecoverySheetsService.upsertCustodian(
          ctx.token,
          spreadsheetId,
          {
            custodianId,
            name: name || '',
            custodianType: custodianType || 'person',
            encryptedShare,
            shareIndex: shareIndex || 0,
            custodianshipCredential: custodianshipCredential || '',
            status: 'invited',
            createdAt: new Date().toISOString(),
            unrevokable: unrevokable === true,
          },
          ctx.pnIdentifier,
          ctx.accountId
        );
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error saving custodian share:', error);
        return res.status(500).json({ error: 'Failed to save custodian' });
      }
    });

    // GET /api/profile/:userPnIdentifier - Get user profile
    this.app.get('/api/profile/:userPnIdentifier', async (req, res) => {
      try {
        const { userPnIdentifier } = req.params;
        if (!userPnIdentifier) {
          return res.status(400).json({ error: 'userPnIdentifier is required' });
        }

        if (!(await gateOwnerSelfRoute(req, res, DEVICE_CAPABILITIES.profileRead, userPnIdentifier))) return;

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
          const driveProfile = await (async () => {
            try {
              const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
              if (!userCredentials?.credentials) return null;
              const googleDriveAccounts =
                userCredentials.credentials.googleDriveAccounts ||
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              if (googleDriveAccounts.length === 0) return null;
              const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
              const accountId = account ? this.extractAccountId(account) : undefined;
              const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';
              const metadataFolder = await this.getMetadataFolder(
                {
                  access_token: account?.access_token || account?.accessToken || '',
                  refresh_token: account?.refresh_token || account?.refreshToken,
                  expires_at: account?.expires_at,
                  expires_in: account?.expires_in
                },
                pnIdentifier,
                accountId
              );
              if (!metadataFolder?.metadataFolderId) return null;
              return ProfileService.getProfile(userAccessToken, metadataFolder.metadataFolderId);
            } catch {
              return null;
            }
          })();

          return res.json({
            displayName: dbProfile.display_name || null,
            profileImageFileId: dbProfile.profile_image_file_id || null,
            mlKemPublicKey: driveProfile?.mlKemPublicKey || null
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

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        // Use normalized pn identifier for access token retrieval
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';

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
          profileImageFileId: profile?.profileImageFileId || null,
          mlKemPublicKey: profile?.mlKemPublicKey || null
        });
      } catch (error: any) {
        console.error('Error getting profile:', error);
        return res.status(500).json({
          error: 'Failed to get profile',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get profile'
        });
      }
    });

    this.app.post('/api/profile/ml-kem-public-key', async (req, res) => {
      try {
        const { userPnIdentifier, mlKemPublicKey } = req.body;
        if (!userPnIdentifier || !mlKemPublicKey) {
          return res.status(400).json({ error: 'userPnIdentifier and mlKemPublicKey are required' });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, userPnIdentifier))) return;

        const { ProfileService } = await import('./server/modules/profileService');
        const { googleDriveProxyService } = await import('./server/modules/googleDriveProxy');
        const { storageCredentialsService } = await import('./server/modules/storageCredentialsService');

        const pnIdentifier = String(userPnIdentifier);
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }
        const googleDriveAccounts =
          userCredentials.credentials.googleDriveAccounts ||
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        if (googleDriveAccounts.length === 0) {
          return res.status(404).json({ error: 'No Google Drive connected' });
        }
        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        const userAccessToken = account ? await googleDriveProxyService.getAccessToken(pnIdentifier, accountId) : '';
        const metadataFolder = await this.getMetadataFolder(
          {
            access_token: account?.access_token || account?.accessToken || '',
            refresh_token: account?.refresh_token || account?.refreshToken,
            expires_at: account?.expires_at,
            expires_in: account?.expires_in
          },
          pnIdentifier,
          accountId
        );
        if (!metadataFolder?.metadataFolderId) {
          return res.status(404).json({ error: 'Metadata folder not found' });
        }
        const existingProfile = await ProfileService.getProfileFile(
          userAccessToken,
          metadataFolder.metadataFolderId
        );
        const profile = {
          identifier: existingProfile?.identifier || pnIdentifier,
          displayName: existingProfile?.displayName,
          profileImageFileId: existingProfile?.profileImageFileId,
          storageTier: existingProfile?.storageTier,
          updatedAt: new Date().toISOString(),
          mlKemPublicKey
        };
        await ProfileService.updateProfileFile(
          userAccessToken,
          metadataFolder.metadataFolderId,
          pnIdentifier,
          profile
        );
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Error updating ML-KEM public key:', error);
        return res.status(500).json({
          error: 'Failed to update messaging public key',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production')
        });
      }
    });

    setupGroupRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      emitRealtime: (pnIdentifier, event, payload) => this.emitRealtime(pnIdentifier, event, payload),
    });

    setupConnectionRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
    });

    setupUserRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
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

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        // Get query parameters
        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
        const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
        const activityType = req.query.activityType as string | undefined;

        // Get activities
        const result = await ActivityLedgerService.getUserActivities(
          token,
          metadataFolderId,
          pnIdentifier,
          accountId,
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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get activity ledger'
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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const MAX_NOTIFICATIONS_PAGE_SIZE = 500;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, MAX_NOTIFICATIONS_PAGE_SIZE);
        const offset = parseInt(req.query.offset as string) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type as string | undefined;

        const result = await NotificationService.getUserNotifications(userAccessToken, metadataFolderId, pnIdentifier, accountId, {
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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get notifications'
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

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const count = await NotificationService.getUnreadCount(userAccessToken, metadataFolderId, pnIdentifier, accountId);

        return res.json({ count });
      } catch (error: any) {
        console.error('Failed to get unread count:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get unread count'
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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark notification as read'
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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const count = await NotificationService.markAllAsRead(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json({ success: true, markedRead: count });
      } catch (error: any) {
        console.error('Failed to mark all notifications as read:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark all notifications as read'
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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to delete notification'
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

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const preferences = await NotificationService.getPreferences(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json(preferences);
      } catch (error: any) {
        console.error('Failed to get notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get notification preferences'
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
          const { isPortableStorageProvider } = await import('./server/modules/storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? this.extractAccountId(account) : undefined;
        
        // Build token object from account
        const token = {
          access_token: account?.access_token || account?.accessToken || '',
          refresh_token: account?.refresh_token || account?.refreshToken,
          expires_at: account?.expires_at,
          expires_in: account?.expires_in
        };
        const userAccessToken = token.access_token; // Keep for backward compatibility
        
        let metadataFolderId = '';
        if (account) {
          const _g = await this.getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return this.driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

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
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update notification preferences'
        });
      }
    });

    // POST /api/push/register - Register device token for push notifications
    this.app.post('/api/push/register', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or expired token' });
        }
        const { deviceToken, platform } = req.body;
        if (!deviceToken || !platform || !['ios', 'android'].includes(platform)) {
          return res.status(400).json({ error: 'deviceToken and platform (ios|android) required' });
        }
        const { PushService } = await import('./server/modules/pushService');
        await PushService.registerToken(tokenPayload.pnIdentifier, deviceToken, platform);
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Push register failed:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register'
        });
      }
    });

    // DELETE /api/push/register - Unregister device token
    this.app.delete('/api/push/register', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or expired token' });
        }
        const deviceToken = req.body?.deviceToken || req.query.deviceToken;
        if (!deviceToken) {
          return res.status(400).json({ error: 'deviceToken required' });
        }
        const { PushService } = await import('./server/modules/pushService');
        await PushService.unregisterToken(tokenPayload.pnIdentifier, deviceToken);
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Push unregister failed:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to unregister'
        });
      }
    });
  }

  public async start(): Promise<void> {
    initApiSentry();
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
        // Public aggregator reconcile: first run after 30s, then every 5 minutes
        (async () => {
          try {
            const { runReconcilePublicAggregator } = await import('./server/jobs/reconcilePublicAggregatorJob');
            const run = () =>
              runReconcilePublicAggregator().catch((e: unknown) =>
                console.error('[Reconcile] Scheduled run failed:', e)
              );
            this._reconcileTimer = setTimeout(() => {
              run();
              this._reconcileInterval = setInterval(run, 5 * 60 * 1000);
            }, 30_000);
          } catch (e) {
            console.warn('[Reconcile] Could not schedule reconcile job:', e);
          }
        })();
        (async () => {
          try {
            const { IntegratorWebhookService } = await import('./server/modules/integratorWebhookService');
            setInterval(() => {
              IntegratorWebhookService.processPendingRetries().catch((e: unknown) =>
                console.error('[IntegratorWebhook] retry sweep failed:', e)
              );
            }, 30_000);
          } catch (e) {
            console.warn('[IntegratorWebhook] Could not schedule retry sweeps:', e);
          }
        })();
        (async () => {
          try {
            PlatformRegistrySyncService.startPeriodicSync(5 * 60 * 1000);
          } catch (e) {
            console.warn('[PlatformRegistrySync] Could not schedule sync:', e);
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
    if (this._reconcileTimer) {
      clearTimeout(this._reconcileTimer);
      this._reconcileTimer = null;
    }
    if (this._reconcileInterval) {
      clearInterval(this._reconcileInterval);
      this._reconcileInterval = null;
    }
    try {
      PlatformRegistrySyncService.stopPeriodicSync();
    } catch (error) {
      console.warn('Failed to stop platform registry sync:', error);
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
