import express from 'express';
interface OAuthClient {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    name: string;
}
declare class OAuthServer {
    private app;
    private clients;
    private authorizationCodes;
    private accessTokens;
    private identityCore;
    private jwtSecret;
    constructor();
    private setupMiddleware;
    private rateLimiter;
    private setupRoutes;
    private initializeDefaultClients;
    registerClient(client: OAuthClient): void;
    private handleAuthorization;
    private handleTokenExchange;
    private handleUserInfo;
    private handleTokenRevocation;
    private handleClientRegistration;
    private oauthError;
    start(port?: number): void;
    getRouter(): express.Router;
}
export default OAuthServer;
//# sourceMappingURL=oauth-server.d.ts.map