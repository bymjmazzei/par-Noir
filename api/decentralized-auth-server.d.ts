import express from 'express';
declare class DecentralizedAuthServer {
    private app;
    private server;
    private io;
    private logger;
    private auth;
    private resolver;
    private identityCore;
    private config;
    constructor();
    private validateEnvironmentVariables;
    private setupLogger;
    private setupMiddleware;
    private setupSecurity;
    private setupRateLimiting;
    private setupRoutes;
    private setupWebSocket;
    private setupErrorHandling;
    private createChallenge;
    private authenticate;
    private getUserInfo;
    private validateSession;
    private logout;
    private resolveDID;
    private oauthCompatibilityAuthorize;
    private oauthCompatibilityToken;
    private oauthCompatibilityUserInfo;
    start(): void;
    getRouter(): express.Router;
}
export default DecentralizedAuthServer;
//# sourceMappingURL=decentralized-auth-server.d.ts.map