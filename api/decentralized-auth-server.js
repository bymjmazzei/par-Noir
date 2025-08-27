"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const winston_1 = __importDefault(require("winston"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const DecentralizedAuth_1 = require("../core/identity-core/dist/distributed/DecentralizedAuth");
const DIDResolver_1 = require("../core/identity-core/dist/distributed/DIDResolver");
const index_1 = require("../core/identity-core/dist/index");
dotenv_1.default.config();
class DecentralizedAuthServer {
    constructor() {
        this.validateEnvironmentVariables();
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: process.env['ALLOWED_ORIGINS']?.split(',') || ['https://yourdomain.com'],
                methods: ['GET', 'POST']
            }
        });
        this.config = {
            port: parseInt(process.env.PORT || '3001'),
            corsOrigins: process.env['ALLOWED_ORIGINS']?.split(',') || ['https://yourdomain.com'],
            rateLimitWindow: 15 * 60 * 1000,
            rateLimitMax: 100,
            challengeExpiry: 5 * 60 * 1000,
            sessionExpiry: 24 * 60 * 60 * 1000
        };
        this.resolver = new DIDResolver_1.DIDResolver();
        this.auth = new DecentralizedAuth_1.DecentralizedAuth(this.resolver);
        this.identityCore = new index_1.IdentityCore();
        this.setupLogger();
        this.setupMiddleware();
        this.setupSecurity();
        this.setupRateLimiting();
        this.setupRoutes();
        this.setupWebSocket();
        this.setupErrorHandling();
    }
    validateEnvironmentVariables() {
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
    setupLogger() {
        this.logger = winston_1.default.createLogger({
            level: process.env['LOG_LEVEL'] || 'info',
            format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
            defaultMeta: { service: 'decentralized-auth-server' },
            transports: [
                new winston_1.default.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston_1.default.transports.File({ filename: 'logs/combined.log' }),
                new winston_1.default.transports.Console({
                    format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.simple())
                })
            ]
        });
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)({
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
        this.app.use((0, cors_1.default)({
            origin: this.config.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-identity-did']
        }));
        this.app.use((0, compression_1.default)());
        this.app.use(express_1.default.json({ limit: '10mb' }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
        this.app.use((req, res, next) => {
            this.logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            next();
        });
    }
    setupSecurity() {
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });
    }
    setupRateLimiting() {
        const limiter = (0, express_rate_limit_1.default)({
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
    setupRoutes() {
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'decentralized-auth-server',
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
        this.app.post('/auth/challenge', this.createChallenge.bind(this));
        this.app.post('/auth/authenticate', this.authenticate.bind(this));
        this.app.get('/auth/userinfo', this.getUserInfo.bind(this));
        this.app.get('/auth/validate', this.validateSession.bind(this));
        this.app.post('/auth/logout', this.logout.bind(this));
        this.app.get('/auth/resolve/:did', this.resolveDID.bind(this));
        this.app.get('/oauth/authorize', this.oauthCompatibilityAuthorize.bind(this));
        this.app.post('/oauth/token', this.oauthCompatibilityToken.bind(this));
        this.app.get('/oauth/userinfo', this.oauthCompatibilityUserInfo.bind(this));
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'not_found',
                message: 'Endpoint not found'
            });
        });
    }
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            this.logger.info('WebSocket client connected', { socketId: socket.id });
            socket.on('auth_challenge', async (data) => {
                try {
                    const { did } = data;
                    const challenge = await this.auth.createChallenge(did);
                    socket.emit('challenge_created', challenge);
                }
                catch (error) {
                    socket.emit('error', { error: 'challenge_creation_failed' });
                }
            });
            socket.on('disconnect', () => {
                this.logger.info('WebSocket client disconnected', { socketId: socket.id });
            });
        });
    }
    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
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
    async createChallenge(req, res) {
        try {
            const { did } = req.body;
            if (!did) {
                res.status(400).json({
                    error: 'missing_did',
                    message: 'DID is required'
                });
                return;
            }
            const challenge = await this.auth.createChallenge(did, this.config.challengeExpiry);
            this.logger.info('Challenge created', { did, challengeId: challenge.challenge.substring(0, 8) });
            res.json(challenge);
        }
        catch (error) {
            this.logger.error('Challenge creation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(400).json({
                error: 'challenge_creation_failed',
                message: 'Failed to create authentication challenge'
            });
        }
    }
    async authenticate(req, res) {
        try {
            const { did, signature } = req.body;
            if (!did || !signature) {
                res.status(400).json({
                    error: 'missing_parameters',
                    message: 'DID and signature are required'
                });
                return;
            }
            const session = await this.auth.authenticate(did, signature);
            if (!session) {
                res.status(401).json({
                    error: 'authentication_failed',
                    message: 'Authentication failed'
                });
                return;
            }
            this.logger.info('Authentication successful', { did, deviceId: session.deviceId });
            res.json({
                session_id: session.did,
                authenticated_at: session.authenticatedAt,
                expires_at: session.expiresAt,
                permissions: session.permissions,
                device_id: session.deviceId
            });
        }
        catch (error) {
            this.logger.error('Authentication failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(401).json({
                error: 'authentication_failed',
                message: 'Authentication failed'
            });
        }
    }
    async getUserInfo(req, res) {
        try {
            const did = req.headers['x-identity-did'];
            if (!did) {
                res.status(401).json({
                    error: 'missing_identity',
                    message: 'Identity DID is required'
                });
                return;
            }
            const isAuthenticated = await this.auth.isAuthenticated(did);
            if (!isAuthenticated) {
                res.status(401).json({
                    error: 'not_authenticated',
                    message: 'Identity is not authenticated'
                });
                return;
            }
            const resolution = await this.resolver.resolve(did);
            if (!resolution) {
                res.status(404).json({
                    error: 'identity_not_found',
                    message: 'Identity not found'
                });
                return;
            }
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
        }
        catch (error) {
            this.logger.error('Get user info failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to get user information'
            });
        }
    }
    async validateSession(req, res) {
        try {
            const did = req.headers['x-identity-did'];
            if (!did) {
                res.status(401).json({
                    error: 'missing_identity',
                    message: 'Identity DID is required'
                });
                return;
            }
            const isAuthenticated = await this.auth.isAuthenticated(did);
            res.json({
                authenticated: isAuthenticated,
                did: did
            });
        }
        catch (error) {
            this.logger.error('Session validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to validate session'
            });
        }
    }
    async logout(req, res) {
        try {
            const did = req.headers['x-identity-did'];
            if (!did) {
                res.status(400).json({
                    error: 'missing_identity',
                    message: 'Identity DID is required'
                });
                return;
            }
            await this.auth.logout(did);
            this.logger.info('Logout successful', { did });
            res.json({
                message: 'logged_out',
                did: did
            });
        }
        catch (error) {
            this.logger.error('Logout failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to logout'
            });
        }
    }
    async resolveDID(req, res) {
        try {
            const { did } = req.params;
            if (!did) {
                res.status(400).json({
                    error: 'missing_did',
                    message: 'DID is required'
                });
                return;
            }
            const resolution = await this.resolver.resolve(did);
            if (!resolution) {
                res.status(404).json({
                    error: 'did_not_found',
                    message: 'DID not found'
                });
                return;
            }
            res.json(resolution);
        }
        catch (error) {
            this.logger.error('DID resolution failed', { error: error instanceof Error ? error.message : 'Unknown error' });
            res.status(500).json({
                error: 'server_error',
                message: 'Failed to resolve DID'
            });
        }
    }
    async oauthCompatibilityAuthorize(req, res) {
        try {
            const { client_id, redirect_uri, state, scope } = req.query;
            const authUrl = `/auth/decentralized?${new URLSearchParams({
                client_id: client_id,
                redirect_uri: redirect_uri,
                state: state,
                scope: scope || 'openid profile email'
            })}`;
            res.redirect(authUrl);
        }
        catch (error) {
            res.status(400).json({
                error: 'invalid_request',
                message: 'Invalid OAuth request'
            });
        }
    }
    async oauthCompatibilityToken(req, res) {
        try {
            const { grant_type, did, signature } = req.body;
            if (grant_type !== 'decentralized_auth') {
                res.status(400).json({
                    error: 'unsupported_grant_type',
                    message: 'Only decentralized authentication is supported'
                });
                return;
            }
            const session = await this.auth.authenticate(did, signature);
            if (!session) {
                res.status(401).json({
                    error: 'invalid_grant',
                    message: 'Authentication failed'
                });
                return;
            }
            res.json({
                access_token: session.did,
                token_type: 'Bearer',
                expires_in: Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
                scope: session.permissions.join(' '),
                did: session.did
            });
        }
        catch (error) {
            res.status(400).json({
                error: 'invalid_request',
                message: 'Invalid token request'
            });
        }
    }
    async oauthCompatibilityUserInfo(req, res) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                res.status(401).json({ error: 'invalid_token' });
                return;
            }
            const did = authHeader.replace('Bearer ', '');
            const isAuthenticated = await this.auth.isAuthenticated(did);
            if (!isAuthenticated) {
                res.status(401).json({ error: 'invalid_token' });
                return;
            }
            const resolution = await this.resolver.resolve(did);
            if (!resolution) {
                res.status(404).json({ error: 'user_not_found' });
                return;
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
        }
        catch (error) {
            res.status(500).json({ error: 'server_error' });
        }
    }
    start() {
        this.server.listen(this.config.port, () => {
            this.logger.info(`Decentralized Auth Server started`, {
                port: this.config.port,
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString()
            });
        });
    }
    getRouter() {
        const router = express_1.default.Router();
        router.post('/challenge', this.createChallenge.bind(this));
        router.post('/authenticate', this.authenticate.bind(this));
        router.get('/userinfo', this.getUserInfo.bind(this));
        router.get('/validate', this.validateSession.bind(this));
        router.post('/logout', this.logout.bind(this));
        router.get('/resolve/:did', this.resolveDID.bind(this));
        return router;
    }
}
exports.default = DecentralizedAuthServer;
//# sourceMappingURL=decentralized-auth-server.js.map