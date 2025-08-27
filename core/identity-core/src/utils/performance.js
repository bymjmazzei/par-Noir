"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryOptimizer = exports.DatabaseOptimizer = exports.CacheManager = exports.PerformanceMonitor = void 0;
exports.trackPerformance = trackPerformance;
exports.cached = cached;
class PerformanceMonitor {
    constructor() {
        this.metrics = [];
        this.maxMetrics = 1000;
        this.listeners = [];
    }
    static async track(operation, fn, metadata) {
        const startTime = performance.now();
        const timestamp = new Date().toISOString();
        try {
            const result = await fn();
            const duration = performance.now() - startTime;
            const metric = {
                operation,
                duration,
                timestamp,
                success: true,
                metadata
            };
            PerformanceMonitor.getInstance().recordMetric(metric);
            return result;
        }
        catch (error) {
            const duration = performance.now() - startTime;
            const metric = {
                operation,
                duration,
                timestamp,
                success: false,
                metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' }
            };
            PerformanceMonitor.getInstance().recordMetric(metric);
            throw error;
        }
    }
    static trackSync(operation, fn, metadata) {
        const startTime = performance.now();
        const timestamp = new Date().toISOString();
        try {
            const result = fn();
            const duration = performance.now() - startTime;
            const metric = {
                operation,
                duration,
                timestamp,
                success: true,
                metadata
            };
            PerformanceMonitor.getInstance().recordMetric(metric);
            return result;
        }
        catch (error) {
            const duration = performance.now() - startTime;
            const metric = {
                operation,
                duration,
                timestamp,
                success: false,
                metadata: { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' }
            };
            PerformanceMonitor.getInstance().recordMetric(metric);
            throw error;
        }
    }
    static getInstance() {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }
    recordMetric(metric) {
        this.metrics.push(metric);
        if (this.metrics.length > this.maxMetrics) {
            this.metrics = this.metrics.slice(-this.maxMetrics);
        }
        this.listeners.forEach(listener => {
            try {
                listener(metric);
            }
            catch (error) {
                console.error('Error in performance metric listener:', error);
            }
        });
    }
    onMetric(listener) {
        this.listeners.push(listener);
    }
    offMetric(listener) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    getMetrics() {
        return [...this.metrics];
    }
    getMetricsForOperation(operation) {
        return this.metrics.filter(metric => metric.operation === operation);
    }
    getAverageDuration(operation) {
        const operationMetrics = this.getMetricsForOperation(operation);
        if (operationMetrics.length === 0)
            return 0;
        const totalDuration = operationMetrics.reduce((sum, metric) => sum + metric.duration, 0);
        return totalDuration / operationMetrics.length;
    }
    getSuccessRate(operation) {
        const operationMetrics = this.getMetricsForOperation(operation);
        if (operationMetrics.length === 0)
            return 0;
        const successful = operationMetrics.filter(metric => metric.success).length;
        return successful / operationMetrics.length;
    }
    clearMetrics() {
        this.metrics = [];
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
class CacheManager {
    constructor(config) {
        this.cache = new Map();
        this.config = config;
        this.startCleanup();
    }
    set(key, value, ttl) {
        const entryTTL = ttl || this.config.ttl;
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            ttl: entryTTL
        });
        if (this.cache.size > this.config.maxSize) {
            this.evictOldest();
        }
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    has(key) {
        return this.get(key) !== null;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    getStats() {
        const totalRequests = this.cache.size;
        const hits = this.cache.size;
        const misses = 0;
        return {
            size: this.cache.size,
            maxSize: this.config.maxSize,
            hitRate: totalRequests > 0 ? hits / totalRequests : 0,
            missRate: totalRequests > 0 ? misses / totalRequests : 0
        };
    }
    evictOldest() {
        let oldestKey = null;
        let oldestTimestamp = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
    startCleanup() {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupInterval);
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
    }
}
exports.CacheManager = CacheManager;
class DatabaseOptimizer {
    static createConnectionPool(config) {
        return {
            ...config,
            acquireTimeoutMillis: 30000,
            createTimeoutMillis: 30000,
            destroyTimeoutMillis: 5000,
            reapIntervalMillis: 1000,
            createRetryIntervalMillis: 200,
            propagateCreateError: false
        };
    }
    static optimizeQuery(query, indexes) {
        if (indexes.length > 0) {
            const indexHint = `/*+ INDEX(${indexes.join(', ')}) */`;
            return query.replace(/SELECT/i, `SELECT ${indexHint}`);
        }
        return query;
    }
    static batchOperations(operations, batchSize = 10) {
        const results = [];
        return new Promise((resolve, reject) => {
            let currentIndex = 0;
            const processBatch = async () => {
                const batch = operations.slice(currentIndex, currentIndex + batchSize);
                if (batch.length === 0) {
                    resolve(results);
                    return;
                }
                try {
                    const batchResults = await Promise.all(batch.map(op => op()));
                    results.push(...batchResults);
                    currentIndex += batchSize;
                    setImmediate(processBatch);
                }
                catch (error) {
                    reject(error);
                }
            };
            processBatch();
        });
    }
}
exports.DatabaseOptimizer = DatabaseOptimizer;
class MemoryOptimizer {
    static getMemoryUsage() {
        const used = process.memoryUsage();
        const total = used.heapTotal;
        const percentage = (used.heapUsed / total) * 100;
        return {
            used: used.heapUsed,
            total,
            percentage
        };
    }
    static forceGC() {
        if (global.gc) {
            global.gc();
        }
    }
    static createObjectPool(createFn, resetFn, maxSize = 100) {
        const pool = [];
        return {
            acquire() {
                return pool.pop() || createFn();
            },
            release(obj) {
                if (pool.length < maxSize) {
                    resetFn(obj);
                    pool.push(obj);
                }
            },
            getSize() {
                return pool.length;
            }
        };
    }
}
exports.MemoryOptimizer = MemoryOptimizer;
function trackPerformance(operation) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            return PerformanceMonitor.track(operation, () => originalMethod.apply(this, args));
        };
        return descriptor;
    };
}
function cached(ttl) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const cache = new CacheManager({ maxSize: 100, ttl: ttl || 60000, cleanupInterval: 30000 });
        descriptor.value = function (...args) {
            const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;
            const cached = cache.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
            const result = originalMethod.apply(this, args);
            cache.set(cacheKey, result, ttl);
            return result;
        };
        return descriptor;
    };
}
//# sourceMappingURL=performance.js.map