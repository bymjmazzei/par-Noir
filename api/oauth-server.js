"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("../core/identity-core/src/index");
class OAuthServer {
    constructor() {
        this.clients = new Map();
        this.authorizationCodes = new Map();
        this.accessTokens = new Map();
        this.app = (0, express_1.default)();
        this.identityCore = new index_1.IdentityCore();
        this.jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
        this.setupMiddleware();
        this.setupRoutes();
        this.initializeDefaultClients();
    }
    setupMiddleware() {
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            next();
        });
        this.app.use(this.rateLimiter());
    }
    rateLimiter() {
        const requests = new Map();
        return (req, res, next) => {
            const ip = req.ip;
            const now = Date.now();
            const windowMs = 15 * 60 * 1000;
            const maxRequests = 100;
            const userRequests = requests.get(ip);
            if (!userRequests || now > userRequests.resetTime) {
                requests.set(ip, { count: 1, resetTime: now + windowMs });
            }
            else if (userRequests.count >= maxRequests) {
                return res.status(429).json({ error: 'rate_limit_exceeded' });
            }
            else {
                userRequests.count++;
            }
            next();
        };
    }
    setupRoutes() {
        this.app.get('/oauth/authorize', this.handleAuthorization.bind(this));
        this.app.post('/oauth/token', this.handleTokenExchange.bind(this));
        this.app.get('/oauth/userinfo', this.handleUserInfo.bind(this));
        this.app.post('/oauth/revoke', this.handleTokenRevocation.bind(this));
        this.app.post('/oauth/clients', this.handleClientRegistration.bind(this));
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
    }
    initializeDefaultClients() {
        this.registerClient({
            clientId: 'test-client',
            clientSecret: crypto.randomBytes(32).toString('hex'),
            redirectUri: process.env.OAUTH_REDIRECT_URI || 'https://yourdomain.com/callback',
            scopes: ['openid', 'profile', 'email'],
            name: 'Test Client'
        });
    }
    registerClient(client) {
        this.clients.set(client.clientId, client);
    }
    async handleAuthorization(req, res) {
        try {
            const { response_type, client_id, redirect_uri, scope, state, nonce } = req.query;
            if (response_type !== 'code') {
                return this.oauthError(res, 'unsupported_response_type', 'Only authorization code flow is supported');
            }
            if (!client_id || !redirect_uri) {
                return this.oauthError(res, 'invalid_request', 'Missing required parameters');
            }
            const client = this.clients.get(client_id);
            if (!client) {
                return this.oauthError(res, 'unauthorized_client', 'Invalid client');
            }
            if (client.redirectUri !== redirect_uri) {
                return this.oauthError(res, 'invalid_request', 'Invalid redirect URI');
            }
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                const loginUrl = `/login?${new URLSearchParams({
                    client_id: client_id,
                    redirect_uri: redirect_uri,
                    scope: scope || 'openid profile email',
                    state: state || '',
                    nonce: nonce || ''
                })}`;
                return res.redirect(loginUrl);
            }
            const token = authHeader.replace('Bearer ', '');
            const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
            const userId = decoded.userId;
            const code = crypto_1.default.randomBytes(32).toString('hex');
            const authorizationCode = {
                code,
                clientId: client_id,
                redirectUri: redirect_uri,
                scope: (scope || 'openid profile email').split(' '),
                state: state,
                nonce: nonce,
                userId,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000)
            };
            this.authorizationCodes.set(code, authorizationCode);
            const redirectUrl = `${redirect_uri}?${new URLSearchParams({
                code,
                state: state || ''
            })}`;
            res.redirect(redirectUrl);
        }
        catch (error) {
            // Authorization error
            this.oauthError(res, 'server_error', 'Internal server error');
        }
    }
    async handleTokenExchange(req, res) {
        try {
            const { grant_type, code, client_id, client_secret, redirect_uri } = req.body;
            if (grant_type !== 'authorization_code') {
                return this.oauthError(res, 'unsupported_grant_type', 'Only authorization code grant is supported');
            }
            const client = this.clients.get(client_id);
            if (!client || client.clientSecret !== client_secret) {
                return this.oauthError(res, 'invalid_client', 'Invalid client credentials');
            }
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
            const accessToken = crypto_1.default.randomBytes(32).toString('hex');
            const tokenInfo = {
                accessToken,
                tokenType: 'Bearer',
                expiresIn: 3600,
                scope: authCode.scope,
                userId: authCode.userId,
                clientId: client_id,
                issuedAt: new Date()
            };
            this.accessTokens.set(accessToken, tokenInfo);
            this.authorizationCodes.delete(code);
            res.json({
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 3600,
                scope: authCode.scope.join(' '),
                state: authCode.state
            });
        }
        catch (error) {
            // Token exchange error
            this.oauthError(res, 'server_error', 'Internal server error');
        }
    }
    async handleUserInfo(req, res) {
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
            const userIdentity = await this.identityCore.getDID(tokenInfo.userId);
            if (!userIdentity) {
                return res.status(404).json({ error: 'user_not_found' });
            }
            const userInfo = {
                sub: userIdentity.id,
                name: userIdentity.metadata.displayName,
                email: userIdentity.metadata.email,
                username: userIdentity.username,
                created_at: userIdentity.createdAt,
                updated_at: userIdentity.updatedAt
            };
            res.json(userInfo);
        }
        catch (error) {
            // User info error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async handleTokenRevocation(req, res) {
        try {
            const { token, token_type_hint } = req.body;
            if (!token) {
                return res.status(400).json({ error: 'invalid_request' });
            }
            this.accessTokens.delete(token);
            res.status(200).json({ message: 'Token revoked successfully' });
        }
        catch (error) {
            // Token revocation error
            res.status(500).json({ error: 'server_error' });
        }
    }
    async handleClientRegistration(req, res) {
        try {
            const { name, redirect_uri, scopes } = req.body;
            if (!name || !redirect_uri) {
                return res.status(400).json({ error: 'invalid_request', message: 'Missing required fields' });
            }
            const clientId = crypto_1.default.randomBytes(16).toString('hex');
            const clientSecret = crypto_1.default.randomBytes(32).toString('hex');
            const client = {
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
        }
        catch (error) {
            // Client registration error
            res.status(500).json({ error: 'server_error' });
        }
    }
    oauthError(res, error, description) {
        res.status(400).json({
            error,
            error_description: description
        });
    }
    start(port = 3001) {
        this.app.listen(port, () => {
            // OAuth server running
        });
    }
    getRouter() {
        const router = express_1.default.Router();
        router.get('/authorize', this.handleAuthorization.bind(this));
        router.post('/token', this.handleTokenExchange.bind(this));
        router.get('/userinfo', this.handleUserInfo.bind(this));
        router.post('/revoke', this.handleTokenRevocation.bind(this));
        router.post('/clients', this.handleClientRegistration.bind(this));
        return router;
    }
}
exports.default = OAuthServer;
//# sourceMappingURL=oauth-server.js.map