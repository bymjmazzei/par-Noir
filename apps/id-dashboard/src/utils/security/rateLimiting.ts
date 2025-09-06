export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDuration?: number;
}

export interface RateLimitInfo {
  requests: number;
  resetTime: number;
  blocked: boolean;
  blockExpiry?: number;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitInfo> = new Map();
  private config: RateLimitConfig;

  private constructor(config: RateLimitConfig) {
    this.config = config;
    this.cleanupExpired();
  }

  static getInstance(config?: RateLimitConfig): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter(config || {
        maxRequests: 100,
        windowMs: 15 * 60 * 1000, // 15 minutes
        blockDuration: 5 * 60 * 1000 // 5 minutes
      });
    }
    return RateLimiter.instance;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const limit = this.limits.get(identifier);
    
    if (!limit) {
      this.limits.set(identifier, {
        requests: 1,
        resetTime: now + this.config.windowMs
      });
      return true;
    }
    
    // Check if blocked
    if (limit.blocked && limit.blockExpiry && now < limit.blockExpiry) {
      return false;
    }
    
    // Reset if window expired
    if (now > limit.resetTime) {
      limit.requests = 1;
      limit.resetTime = now + this.config.windowMs;
      limit.blocked = false;
      this.limits.set(identifier, limit);
      return true;
    }
    
    // Check if limit exceeded
    if (limit.requests >= this.config.maxRequests) {
      limit.blocked = true;
      limit.blockExpiry = now + (this.config.blockDuration || 0);
      this.limits.set(identifier, limit);
      return false;
    }
    
    // Increment request count
    limit.requests++;
    this.limits.set(identifier, limit);
    return true;
  }

  getLimitInfo(identifier: string): RateLimitInfo | null {
    return this.limits.get(identifier) || null;
  }

  resetLimit(identifier: string): void {
    this.limits.delete(identifier);
  }

  private cleanupExpired(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [identifier, limit] of this.limits.entries()) {
        if (now > limit.resetTime && (!limit.blockExpiry || now > limit.blockExpiry)) {
          this.limits.delete(identifier);
        }
      }
    }, 60000); // Clean up every minute
  }
}