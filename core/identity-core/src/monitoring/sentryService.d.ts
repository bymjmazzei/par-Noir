export interface SentryConfig {
    dsn: string;
    environment: string;
    release: string;
    enabled: boolean;
    debug: boolean;
    tracesSampleRate: number;
    profilesSampleRate: number;
    integrations: string[];
}
export interface SentryEvent {
    message: string;
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    user?: {
        id?: string;
        email?: string;
        username?: string;
        ip_address?: string;
    };
    contexts?: {
        app?: {
            name: string;
            version: string;
        };
        device?: {
            name: string;
            version: string;
        };
        os?: {
            name: string;
            version: string;
        };
        runtime?: {
            name: string;
            version: string;
        };
    };
    breadcrumbs?: SentryBreadcrumb[];
}
export interface SentryBreadcrumb {
    message: string;
    category: string;
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
    data?: Record<string, any>;
    timestamp?: number;
}
export interface SentryPerformance {
    name: string;
    op: string;
    description?: string;
    startTimestamp: number;
    endTimestamp: number;
    tags?: Record<string, string>;
    data?: Record<string, any>;
}
export interface SentryUser {
    id: string;
    email?: string;
    username?: string;
    ip_address?: string;
    segment?: string;
}
export declare class SentryService {
    private config;
    private isInitialized;
    private user;
    private breadcrumbs;
    private performanceSpans;
    constructor(config: SentryConfig);
    initialize(): Promise<void>;
    private simulateSentryConnection;
    captureException(error: Error, context?: Partial<SentryEvent>): Promise<string>;
    captureMessage(message: string, level?: SentryEvent['level'], context?: Partial<SentryEvent>): Promise<string>;
    setUser(user: SentryUser): void;
    clearUser(): void;
    addBreadcrumb(breadcrumb: SentryBreadcrumb): void;
    clearBreadcrumbs(): void;
    startSpan(name: string, op: string, description?: string): string;
    finishSpan(spanId: string, tags?: Record<string, string>, data?: Record<string, any>): void;
    setTag(key: string, value: string): void;
    setExtra(key: string, value: any): void;
    setContext(name: string, context: Record<string, any>): void;
    captureSecurityEvent(event: string, details: Record<string, any>, severity?: 'low' | 'medium' | 'high' | 'critical'): Promise<string>;
    captureAuthEvent(event: 'login' | 'logout' | 'register' | 'password_reset' | 'failed_login', userId: string, details?: Record<string, any>): Promise<string>;
    captureDIDOperation(operation: 'create' | 'update' | 'delete' | 'resolve' | 'verify', didId: string, success: boolean, details?: Record<string, any>): Promise<string>;
    private sendEvent;
    private sendPerformanceData;
    private simulateEventSending;
    private simulatePerformanceSending;
    private sanitizeErrorData;
    private sanitizeMessageData;
    private generateEventId;
    isReady(): boolean;
    getConfig(): SentryConfig;
    updateConfig(newConfig: Partial<SentryConfig>): Promise<void>;
    getCurrentUser(): SentryUser | null;
    getBreadcrumbs(): SentryBreadcrumb[];
    getActiveSpans(): Map<string, SentryPerformance>;
}
export declare const sentryService: SentryService;
//# sourceMappingURL=sentryService.d.ts.map