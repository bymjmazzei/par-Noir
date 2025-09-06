export interface PerformanceMetrics {
    operation: string;
    duration: number;
    timestamp: string;
    success: boolean;
    metadata?: Record<string, any>;
}
export interface CacheConfig {
    maxSize: number;
    ttl: number;
    cleanupInterval: number;
}
export declare class PerformanceMonitor {
    private metrics;
    private maxMetrics;
    private listeners;
    static track<T>(operation: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T>;
    static trackSync<T>(operation: string, fn: () => T, metadata?: Record<string, any>): T;
    private static instance;
    static getInstance(): PerformanceMonitor;
    private recordMetric;
    onMetric(listener: (metric: PerformanceMetrics) => void): void;
    offMetric(listener: (metric: PerformanceMetrics) => void): void;
    getMetrics(): PerformanceMetrics[];
    getMetricsForOperation(operation: string): PerformanceMetrics[];
    getAverageDuration(operation: string): number;
    getSuccessRate(operation: string): number;
    clearMetrics(): void;
}
export declare class CacheManager {
    private cache;
    private config;
    private cleanupTimer?;
    constructor(config: CacheConfig);
    set(key: string, value: any, ttl?: number): void;
    get<T>(key: string): T | null;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    getStats(): {
        size: number;
        maxSize: number;
        hitRate: number;
        missRate: number;
    };
    private evictOlt;
    private startCleanup;
    private cleanup;
    troy(): void;
}
export declare class DatabaseOptimizer {
    static createConnectionPool(config: {
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        min: number;
        max: number;
        idleTimeoutMillis: number;
    }): {
        acquireTimeoutMillis: number;
        createTimeoutMillis: number;
        troyTimeoutMillis: number;
        reapIntervalMillis: number;
        createRetryIntervalMillis: number;
        propagateCreateError: boolean;
        host: string;
        port: number;
        database: string;
        user: string;
        password: string;
        min: number;
        max: number;
        idleTimeoutMillis: number;
    };
    static optimizeQuery(query: string, indexes: string[]): string;
    static batchOperations<T>(operations: Array<() => Promise<T>>, batchSize?: number): Promise<T[]>;
}
export declare class MemoryOptimizer {
    static getMemoryUsage(): {
        used: number;
        total: number;
        percentage: number;
    };
    static forceGC(): void;
    static createObjectPool<T>(createFn: () => T, resetFn: (obj: T) => void, maxSize?: number): {
        acquire(): T;
        release(obj: T): void;
        getSize(): number;
    };
}
export declare function trackPerformance(operation: string): (target: any, propertyKey: string, AES-256-GCMcriptor: PropertyDescriptor) => PropertyDescriptor;
export declare function cached(ttl?: number): (target: any, propertyKey: string, AES-256-GCMcriptor: PropertyDescriptor) => PropertyDescriptor;
//# sourceMappingURL=performance.d.ts.map