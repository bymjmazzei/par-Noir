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
import path from 'path';
import { isOAuthBrowserHtmlEntryGet, isOAuthConsentSameOriginGet } from './server/utils/oauthBrowserHtmlEntry';
import { captureApiRouteError, initApiSentry } from './server/utils/sentry';
import { generateChallenge } from './server/utils/identifierGenerators';
import { registerAdminDeveloperRoutes, requireAdminApiKey } from './server/modules/adminDeveloperRoutes';
import { registerIdentityMigrationRoutes } from './server/modules/identityMigrationService';
import { registerDeviceAuthRoutes } from './server/modules/deviceAuthRoutes';
import { registerRecoveryVaultRoutes } from './server/modules/recoveryVaultRoutes';
import { registerRecoveryFailsafeRoutes } from './server/modules/recoveryFailsafeRoutes';
import { registerDeveloperSelfServiceRoutes } from './server/modules/developerSelfServiceRoutes';
import { registerPlatformRegistryRoutes } from './server/modules/platformRegistryRoutes';
import { PlatformRegistrySyncService } from './server/modules/platformRegistrySyncService';
import { registerOwnedAssetRoutes } from './server/modules/ownedAssetRoutes';
import { registerPublicNameRoutes } from './server/modules/publicNameRoutes';
import {
  registerVerificationRoutes,
  registerVerificationSyncRoute,
} from './server/modules/verificationRoutes';
import { registerMusicTrackRegistryRoutes } from './server/modules/musicTrackRegistryRoutes';
import { registerStripeMonetizationRoutes } from './server/modules/stripeMonetizationRoutes';
import { registerIntegratorRoutes } from './server/modules/integratorRoutes';
import { registerStorageRoutes } from './server/modules/storage/storageRoutes';
import {
  setupStorageCredentialsRoutes,
  setupStorageVolumeMigrationRoute,
} from './server/modules/storage/storageCredentialsRoutes';
import { setupStorageIndexRoutes } from './server/modules/storage/storageIndexRoutes';
import {
  removeFromOwnerIndex,
  removeFromPublicIndex,
  scheduleDriveIndexUpdates,
} from './server/modules/storage/fileIndexHelpers';
import { registerMailboxRoutes } from './server/modules/mailboxRoutes';
import { registerCreatorFundPeriodRoutes } from './server/modules/creatorFundPeriodRoutes';
import { registerCoreRoutes } from './server/modules/coreRoutes';
import { registerThirdPartyRoutes } from './server/modules/thirdPartyRoutes';
import { registerAuthChallengeRoutes } from './server/modules/authChallengeRoutes';
import { registerDidCreateRoute, registerDidResolveRoute } from './server/modules/didRoutes';
import { registerSearchRoutes, registerPersonalSearchRoute } from './server/modules/searchRoutes';
import { registerCoinbaseWebhookRoutes } from './server/modules/coinbaseWebhookRoutes';
import { registerRecommendationRoutes } from './server/modules/recommendationRoutes';
import { registerFileViewRoutes } from './server/modules/fileViewRoutes';
import { registerCreatorSubscriberRoutes } from './server/modules/creatorSubscriberRoutes';
import { setupActivityLedgerRoutes } from './server/modules/activityLedgerRoutes';
import { setupNotificationRoutes } from './server/modules/notificationRoutes';
import { setupProfileRoutes } from './server/modules/profileRoutes';
import { setupRecoveryRequestRoutes } from './server/modules/recoveryRequestRoutes';
import { setupMessageRoutes } from './server/modules/messageRoutes';
import { setupGroupRoutes } from './server/modules/groupRoutes';
import { setupConnectionRoutes } from './server/modules/connectionRoutes';
import { setupUserRoutes } from './server/modules/userRoutes';
import { setupGoogleOAuthRoutes } from './server/modules/googleOAuthRoutes';
import { setupDriveRoutes } from './server/modules/driveRoutes';
import { setupPnOAuthRoutes } from './server/modules/pnOAuthRoutes';

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
      // OAuth consent is a cross-origin popup. Any non-unsafe-none COOP on this
      // document (including same-origin-allow-popups) nulls window.opener, so
      // browse never receives ML-KEM messagingHandoff via postMessage.
      crossOriginOpenerPolicy: false,
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

      // SECURITY FIX: In production, block no-origin requests except for public endpoints,
      // OAuth consent HTML entry, and consent same-origin GETs (grant poll / catalog).
      if (
        !origin &&
        NODE_ENV === 'production' &&
        !isPublicPath &&
        !isOAuthBrowserHtmlEntryGet(req) &&
        !isOAuthConsentSameOriginGet(req)
      ) {
        console.error(`[CORS] Blocked no-origin request to ${path} in production`);
        res.status(403).json({ error: 'Origin header required in production' });
        return;
      }

      // Continue to standard CORS middleware
      next();
    });

    this.app.use((req, res, next) => {
      const allowNoOriginOAuthHtml = isOAuthBrowserHtmlEntryGet(req);
      const allowNoOriginConsentXhr = isOAuthConsentSameOriginGet(req);
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
            if (allowNoOriginConsentXhr) {
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
          // Ephemeral Drive token under device cloud custody (reconnect / device register)
          'X-PN-Cloud-Access-Token',
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
    this.app.use((req, res, next) => {
      // Skip rate limiting for aggregator endpoints (they get their own limiter)
      if (req.path.startsWith('/api/aggregator/')) {
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

  private async setupRoutes(): Promise<void> {
    registerCoreRoutes(this.app, NODE_ENV);

    registerThirdPartyRoutes(this.app);

    registerAuthChallengeRoutes(this.app, { authLimiter });

    // pN OAuth 2.0 endpoints
    this.setupPNOAuthEndpoints();

    // Notification endpoints
    this.setupNotificationEndpoints();

    registerDidCreateRoute(this.app);

    registerSearchRoutes(this.app);

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
      scheduleDriveIndexUpdates,
    });

    const { registerPublicContentRoutes } = await import('./server/modules/publicContentRoutes');
    registerPublicContentRoutes(this.app);

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
    await registerCoinbaseWebhookRoutes(this.app);

    // Migration endpoint removed - feed system migration completed successfully
    // Tables created: feed_payments, feed_delegations

    setupStorageCredentialsRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
    });

    setupStorageIndexRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
    });

    // GET /api/storage/accounts/:identityId — registered in storageRoutes (multi-provider)

    registerRecommendationRoutes(this.app);

    registerFileViewRoutes(this.app);

    registerVerificationSyncRoute(this.app);

    // Feed CRUD, subscription, saved-feed and discovery routes are registered by
    // setupFeedRoutes (see server/modules/feedRoutes).

    // User-scoped routes (/api/users/*) are registered by setupUserRoutes
    // (see server/modules/userRoutes).

    registerCreatorSubscriberRoutes(this.app);

    setupGoogleOAuthRoutes(this.app, { oauthTokenLimiter });

    setupDriveRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      removeFromOwnerIndex,
      removeFromPublicIndex,
    });

    registerDidResolveRoute(this.app);

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
        const challenge = generateChallenge();
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

  /**
   * Setup pN OAuth 2.0 endpoints
   * Implements authorization code flow similar to Google OAuth
   */
  private setupPNOAuthEndpoints(): void {
    setupPnOAuthRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      oauthTokenLimiter,
      authLimiter,
    });

    registerAdminDeveloperRoutes(this.app);
    registerIdentityMigrationRoutes(this.app);
    registerDeviceAuthRoutes(this.app);
    registerRecoveryVaultRoutes(this.app);
    registerRecoveryFailsafeRoutes(this.app);
    registerDeveloperSelfServiceRoutes(this.app);
    registerPlatformRegistryRoutes(this.app);
    registerOwnedAssetRoutes(this.app);
    registerPublicNameRoutes(this.app);
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
    setupMessageRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
      emitRealtime: (pnIdentifier, event, payload) => this.emitRealtime(pnIdentifier, event, payload),
    });

    setupProfileRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
    });

    registerPersonalSearchRoute(this.app);

    setupStorageVolumeMigrationRoute(this.app);

    setupRecoveryRequestRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
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

    setupActivityLedgerRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
    });

    setupNotificationRoutes(this.app, {
      extractAccountId: (account) => this.extractAccountId(account),
      getMetadataFolder: (token, pnIdentifier, accountId) => this.getMetadataFolder(token, pnIdentifier, accountId),
      driveNotInitialized: (res) => this.driveNotInitialized(res),
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
