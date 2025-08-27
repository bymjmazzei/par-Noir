"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sentryService = exports.SentryService = void 0;
class SentryService {
    constructor(config) {
        this.isInitialized = false;
        this.user = null;
        this.breadcrumbs = [];
        this.performanceSpans = new Map();
        this.config = config;
    }
    async initialize() {
        if (!this.config.enabled) {
            console.log('Sentry is disabled');
            return;
        }
        try {
            await this.simulateSentryConnection();
            this.isInitialized = true;
            console.log('Sentry initialized successfully');
        }
        catch (error) {
            throw new Error(`Failed to initialize Sentry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async simulateSentryConnection() {
        await new Promise(resolve => setTimeout(resolve, 100));
        const success = Math.random() > 0.1;
        if (!success) {
            throw new Error('Failed to connect to Sentry');
        }
    }
    async captureException(error, context) {
        if (!this.isInitialized) {
            console.error('Sentry not initialized, logging error:', error);
            return 'sentry_disabled';
        }
        const sanitizedError = this.sanitizeErrorData(error, context);
        const event = {
            message: sanitizedError.message,
            level: 'error',
            tags: {
                type: 'exception',
                ...sanitizedError.tags
            },
            extra: sanitizedError.extra,
            user: sanitizedError.user,
            contexts: {
                app: {
                    name: 'Identity Protocol',
                    version: this.config.release
                },
                device: {
                    name: 'web',
                    version: '[REDACTED]'
                },
                os: {
                    name: 'web',
                    version: '[REDACTED]'
                },
                runtime: {
                    name: 'javascript',
                    version: '1.0'
                }
            },
            breadcrumbs: []
        };
        return this.sendEvent(event);
    }
    async captureMessage(message, level = 'info', context) {
        if (!this.isInitialized) {
            console.log(`Sentry not initialized, logging message: ${message}`);
            return 'sentry_disabled';
        }
        const sanitizedMessage = this.sanitizeMessageData(message, context);
        const event = {
            message: sanitizedMessage.message,
            level,
            tags: {
                type: 'message',
                ...sanitizedMessage.tags
            },
            extra: sanitizedMessage.extra,
            user: sanitizedMessage.user,
            contexts: {
                app: {
                    name: 'Identity Protocol',
                    version: this.config.release
                }
            },
            breadcrumbs: []
        };
        return this.sendEvent(event);
    }
    setUser(user) {
        this.user = user;
    }
    clearUser() {
        this.user = null;
    }
    addBreadcrumb(breadcrumb) {
        this.breadcrumbs.push({
            ...breadcrumb,
            timestamp: breadcrumb.timestamp || Date.now()
        });
        if (this.breadcrumbs.length > 100) {
            this.breadcrumbs = this.breadcrumbs.slice(-100);
        }
    }
    clearBreadcrumbs() {
        this.breadcrumbs = [];
    }
    startSpan(name, op, description) {
        const spanId = `span_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const span = {
            name,
            op,
            description,
            startTimestamp: Date.now(),
            endTimestamp: 0,
            tags: {},
            data: {}
        };
        this.performanceSpans.set(spanId, span);
        return spanId;
    }
    finishSpan(spanId, tags, data) {
        const span = this.performanceSpans.get(spanId);
        if (!span) {
            return;
        }
        span.endTimestamp = Date.now();
        if (tags) {
            span.tags = { ...span.tags, ...tags };
        }
        if (data) {
            span.data = { ...span.data, ...data };
        }
        this.sendPerformanceData(span);
        this.performanceSpans.delete(spanId);
    }
    setTag(key, value) {
        console.log(`Sentry tag set: ${key} = ${value}`);
    }
    setExtra(key, value) {
        console.log(`Sentry extra set: ${key} = ${value}`);
    }
    setContext(name, context) {
        console.log(`Sentry context set: ${name}`, context);
    }
    async captureSecurityEvent(event, details, severity = 'medium') {
        return this.captureMessage(`Security Event: ${event}`, severity === 'critical' ? 'fatal' : severity === 'high' ? 'error' : 'warning', {
            tags: {
                type: 'security',
                event,
                severity
            },
            extra: details
        });
    }
    async captureAuthEvent(event, userId, details) {
        return this.captureMessage(`Authentication Event: ${event}`, 'info', {
            tags: {
                type: 'authentication',
                event
            },
            extra: {
                userId,
                ...details
            }
        });
    }
    async captureDIDOperation(operation, didId, success, details) {
        return this.captureMessage(`DID Operation: ${operation}`, success ? 'info' : 'error', {
            tags: {
                type: 'did_operation',
                operation,
                success: success.toString()
            },
            extra: {
                didId,
                ...details
            }
        });
    }
    async sendEvent(event) {
        try {
            const eventId = this.generateEventId();
            await this.simulateEventSending(event);
            if (this.config.debug) {
                console.log('Sentry event sent:', event);
            }
            return eventId;
        }
        catch (error) {
            console.error('Failed to send Sentry event:', error);
            return 'send_failed';
        }
    }
    async sendPerformanceData(span) {
        try {
            await this.simulatePerformanceSending(span);
            if (this.config.debug) {
                console.log('Sentry performance data sent:', span);
            }
        }
        catch (error) {
            console.error('Failed to send Sentry performance data:', error);
        }
    }
    async simulateEventSending(event) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send event to Sentry');
        }
    }
    async simulatePerformanceSending(span) {
        await new Promise(resolve => setTimeout(resolve, 30));
        const success = Math.random() > 0.05;
        if (!success) {
            throw new Error('Failed to send performance data to Sentry');
        }
    }
    sanitizeErrorData(error, context) {
        const sensitivePatterns = [
            /password/i,
            /token/i,
            /key/i,
            /secret/i,
            /private.*key/i,
            /mnemonic/i,
            /seed.*phrase/i,
            /did.*document/i,
            /crypto.*key/i,
            /encryption.*key/i,
            /jwt.*secret/i,
            /api.*key/i,
            /auth.*token/i,
            /session.*secret/i
        ];
        let sanitizedMessage = error.message;
        sensitivePatterns.forEach(pattern => {
            sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
        });
        let sanitizedStack = error.stack;
        if (sanitizedStack) {
            sensitivePatterns.forEach(pattern => {
                sanitizedStack = sanitizedStack.replace(pattern, '[REDACTED]');
            });
        }
        const sanitizedExtra = {};
        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                const stringValue = String(value);
                let sanitizedValue = stringValue;
                sensitivePatterns.forEach(pattern => {
                    sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
                });
                sanitizedExtra[key] = sanitizedValue;
            });
        }
        const sanitizedUser = this.user ? {
            id: this.user.id ? `user_${this.user.id.slice(0, 8)}` : undefined,
            email: undefined,
            username: undefined,
            ip_address: undefined
        } : undefined;
        return {
            message: sanitizedMessage,
            tags: context?.tags || {},
            extra: {
                stack: sanitizedStack,
                ...sanitizedExtra
            },
            user: sanitizedUser
        };
    }
    sanitizeMessageData(message, context) {
        const sensitivePatterns = [
            /password/i,
            /token/i,
            /key/i,
            /secret/i,
            /private.*key/i,
            /mnemonic/i,
            /seed.*phrase/i,
            /did.*document/i,
            /crypto.*key/i,
            /encryption.*key/i,
            /jwt.*secret/i,
            /api.*key/i,
            /auth.*token/i,
            /session.*secret/i
        ];
        let sanitizedMessage = message;
        sensitivePatterns.forEach(pattern => {
            sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
        });
        const sanitizedExtra = {};
        if (context?.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
                const stringValue = String(value);
                let sanitizedValue = stringValue;
                sensitivePatterns.forEach(pattern => {
                    sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
                });
                sanitizedExtra[key] = sanitizedValue;
            });
        }
        const sanitizedUser = this.user ? {
            id: this.user.id ? `user_${this.user.id.slice(0, 8)}` : undefined,
            email: undefined,
            username: undefined,
            ip_address: undefined
        } : undefined;
        return {
            message: sanitizedMessage,
            tags: context?.tags || {},
            extra: sanitizedExtra,
            user: sanitizedUser
        };
    }
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    isReady() {
        return this.isInitialized;
    }
    getConfig() {
        return { ...this.config };
    }
    async updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.enabled !== undefined && newConfig.enabled !== this.config.enabled) {
            await this.initialize();
        }
    }
    getCurrentUser() {
        return this.user;
    }
    getBreadcrumbs() {
        return [...this.breadcrumbs];
    }
    getActiveSpans() {
        return new Map(this.performanceSpans);
    }
}
exports.SentryService = SentryService;
exports.sentryService = new SentryService({
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    release: process.env.SENTRY_RELEASE || '1.0.0',
    enabled: process.env.SENTRY_ENABLED === 'true',
    debug: process.env.NODE_ENV === 'development',
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    integrations: ['http', 'console', 'dom']
});
//# sourceMappingURL=sentryService.js.map