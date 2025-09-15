/**
 * Comprehensive Rate Limiting System
 * Provides rate limiting for various operations across the Identity Protocol
 */

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
  handler?: (req: any, res: any) => void;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  store?: RateLimitStore;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitInfo | null>;
  set(key: string, info: RateLimitInfo): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  key: string;
}

export class MemoryStore implements RateLimitStore {
  private store: Map<string, { info: RateLimitInfo; timestamp: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor(cleanupIntervalMs: number = 60000) {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  async get(key: string): Promise<RateLimitInfo | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() > entry.timestamp + entry.info.resetTime) {
      this.store.delete(key);
      return null;
    }

    return entry.info;
  }

  async set(key: string, info: RateLimitInfo): Promise<void> {
    this.store.set(key, {
      info,
      timestamp: Date.now()
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.timestamp + entry.info.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

export class RateLimiter {
  private config: RateLimitConfig;
  private store: RateLimitStore;
  private keyGenerators: Map<string, (req: any) => string> = new Map();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      standardHeaders: true,
      legacyHeaders: false,
      ...config
    };

    this.store = config.store || new MemoryStore();
    this.setupDefaultKeyGenerators();
  }

  /**
   * Set up default key generators for different operations
   */
  private setupDefaultKeyGenerators(): void {
    // Authentication key generator
    this.keyGenerators.set('auth', (req: any) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const userAgent = req.headers?.['user-agent'] || 'unknown';
      return `auth:${ip}:${userAgent}`;
    });

    // DID creation key generator
    this.keyGenerators.set('did_creation', (req: any) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      return `did_creation:${ip}`;
    });

    // DID resolution key generator
    this.keyGenerators.set('did_resolution', (req: any) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const did = req.params?.did || req.body?.did || 'unknown';
      return `did_resolution:${ip}:${did}`;
    });

    // API key generator
    this.keyGenerators.set('api', (req: any) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const endpoint = req.path || req.url || 'unknown';
      return `api:${ip}:${endpoint}`;
    });

    // User action key generator
    this.keyGenerators.set('user_action', (req: any) => {
      const userId = req.user?.id || req.body?.userId || 'anonymous';
      const action = req.body?.action || req.params?.action || 'unknown';
      return `user_action:${userId}:${action}`;
    });

    // File upload key generator
    this.keyGenerators.set('file_upload', (req: any) => {
      const userId = req.user?.id || req.body?.userId || 'anonymous';
      return `file_upload:${userId}`;
    });

    // Recovery key generator
    this.keyGenerators.set('recovery', (req: any) => {
      const email = req.body?.email || req.body?.phone || 'unknown';
      return `recovery:${email}`;
    });
  }

  /**
   * Check if request is allowed
   */
  async checkLimit(
    key: string,
    config?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const limitConfig = { ...this.config, ...config };
    const now = Date.now();

    // Get current rate limit info
    let info = await this.store.get(key);

    if (!info) {
      // First request
      info = {
        limit: limitConfig.maxRequests,
        current: 1,
        remaining: limitConfig.maxRequests - 1,
        resetTime: now + limitConfig.windowMs
      };
    } else {
      // Check if window has reset
      if (now > info.resetTime) {
        info = {
          limit: limitConfig.maxRequests,
          current: 1,
          remaining: limitConfig.maxRequests - 1,
          resetTime: now + limitConfig.windowMs
        };
      } else {
        // Increment current count
        info.current++;
        info.remaining = Math.max(0, info.limit - info.current);
      }
    }

    // Check if limit exceeded
    const allowed = info.current <= info.limit;

    // Calculate retry after if limit exceeded
    let retryAfter: number | undefined;
    if (!allowed) {
      retryAfter = Math.ceil((info.resetTime - now) / 1000);
    }

    // Store updated info
    await this.store.set(key, info);

    return {
      allowed,
      limit: info.limit,
      remaining: info.remaining,
      resetTime: info.resetTime,
      retryAfter,
      key
    };
  }

  /**
   * Check rate limit for specific operation type
   */
  async checkOperationLimit(
    operationType: string,
    req: any,
    config?: Partial<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const keyGenerator = this.keyGenerators.get(operationType) || this.config.keyGenerator;
    if (!keyGenerator) {
      throw new Error(`No key generator found for operation type: ${operationType}`);
    }

    const key = keyGenerator(req);
    return this.checkLimit(key, config);
  }

  /**
   * Create middleware for Express.js
   */
  createMiddleware(
    operationType: string,
    config?: Partial<RateLimitConfig>
  ) {
    return async (req: any, res: any, next: any) => {
      try {
        const result = await this.checkOperationLimit(operationType, req, config);

        if (!result.allowed) {
          // Set rate limit headers
          if (this.config.standardHeaders) {
            res.set({
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
            });
          }

          if (this.config.legacyHeaders) {
            res.set({
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': Math.floor(result.resetTime / 1000).toString()
            });
          }

          // Set retry after header
          if (result.retryAfter) {
            res.set('Retry-After', result.retryAfter.toString());
          }

          // Call custom handler or return error
          if (this.config.handler) {
            this.config.handler(req, res);
          } else {
            res.status(429).json({
              error: 'Too Many Requests',
              message: 'Rate limit exceeded',
              retryAfter: result.retryAfter
            });
          }

          return;
        }

        // Set rate limit headers for successful requests
        if (this.config.standardHeaders) {
          res.set({
            'X-RateLimit-Limit': result.limit.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
          });
        }

        next();
      } catch (error) {
        // Log error but allow request to continue
        next();
      }
    };
  }

  /**
   * Create rate limiter for specific operations
   */
  createOperationLimiter(operationType: string, config?: Partial<RateLimitConfig>) {
    return {
      check: (req: any) => this.checkOperationLimit(operationType, req, config),
      middleware: this.createMiddleware(operationType, config)
    };
  }

  /**
   * Add custom key generator
   */
  addKeyGenerator(operationType: string, generator: (req: any) => string): void {
    this.keyGenerators.set(operationType, generator);
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /**
   * Get rate limit info for a key
   */
  async getLimitInfo(key: string): Promise<RateLimitInfo | null> {
    return this.store.get(key);
  }

  /**
   * Clear all rate limits
   */
  async clearAll(): Promise<void> {
    await this.store.clear();
  }

  /**
   * Get rate limit statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    activeKeys: number;
    storeType: string;
  }> {
    // This is a simplified implementation
    // In a real implementation, you'd want to get actual statistics from the store
    return {
      totalKeys: 0,
      activeKeys: 0,
      storeType: this.store.constructor.name
    };
  }
}

// Pre-configured rate limiters for common operations
export const rateLimiters = {
  // Authentication rate limiter (5 attempts per 15 minutes)
  auth: new RateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 5
  }),

  // DID creation rate limiter (10 creations per hour)
  didCreation: new RateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10
  }),

  // DID resolution rate limiter (100 resolutions per minute)
  didResolution: new RateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 100
  }),

  // API rate limiter (1000 requests per hour)
  api: new RateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 1000
  }),

  // User action rate limiter (100 actions per hour)
  userAction: new RateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 100
  }),

  // File upload rate limiter (10 uploads per hour)
  fileUpload: new RateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10
  }),

  // Recovery rate limiter (3 attempts per hour)
  recovery: new RateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 3
  })
};

// Export default rate limiter instance
export const defaultRateLimiter = new RateLimiter();
