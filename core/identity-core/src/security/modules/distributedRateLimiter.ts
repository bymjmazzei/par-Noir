import { RateLimitEntry } from '../types/advancedSecurity';

export class DistributedRateLimiter {
    private limits: Map<string, RateLimitEntry>;

    constructor() {
        this.limits = new Map();
    }

    /**
     * Check if a request is within rate limits
     */
    checkLimit(key: string, limit: number, windowMs: number): boolean {
        const now = Date.now();
        const current = this.limits.get(key);

        if (!current || now > current.resetTime) {
            this.limits.set(key, {
                count: 1,
                resetTime: now + windowMs,
                limit
            });
            return true;
        }

        if (current.count >= limit) {
            return false;
        }

        current.count++;
        return true;
    }

    /**
     * Reset rate limit for a key
     */
    resetLimit(key: string): boolean {
        return this.limits.delete(key);
    }

    /**
     * Get current rate limit status for a key
     */
    getLimitStatus(key: string): RateLimitEntry | undefined {
        return this.limits.get(key);
    }

    /**
     * Get remaining requests for a key
     */
    getRemainingRequests(key: string): number {
        const current = this.limits.get(key);
        if (!current) {
            return 0;
        }
        return Math.max(0, current.limit - current.count);
    }

    /**
     * Get time until reset for a key
     */
    getTimeUntilReset(key: string): number {
        const current = this.limits.get(key);
        if (!current) {
            return 0;
        }
        return Math.max(0, current.resetTime - Date.now());
    }

    /**
     * Check if a key is currently rate limited
     */
    isRateLimited(key: string): boolean {
        const current = this.limits.get(key);
        if (!current) {
            return false;
        }
        return current.count >= current.limit;
    }

    /**
     * Get all active rate limits
     */
    getAllLimits(): Map<string, RateLimitEntry> {
        return new Map(this.limits);
    }

    /**
     * Clear all rate limits
     */
    clearAll(): void {
        this.limits.clear();
    }

    /**
     * Clean up expired rate limits
     */
    cleanupExpired(): number {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, entry] of this.limits.entries()) {
            if (now > entry.resetTime) {
                this.limits.delete(key);
                cleanedCount++;
            }
        }

        return cleanedCount;
    }
}
