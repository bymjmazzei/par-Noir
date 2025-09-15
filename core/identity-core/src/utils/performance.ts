/**
 * Performance optimization utilities for Identity Protocol
 * Inclu caching strategies, monitoring hooks, and optimization helpers
 */

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: string;
  success: boolean;
  metadata?: Record<string, any>;
}

export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics: number = 1000;
  private listeners: Array<(metric: PerformanceMetrics) => void> = [];

  /**
   * Track performance of an operation
   */
  static async track<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      const metric: PerformanceMetrics = {
        operation,
        duration,
        timestamp,
        success: true,
        metadata
      };
      
      PerformanceMonitor.getInstance().recordMetric(metric);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      const metric: PerformanceMetrics = {
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

  /**
   * Track synchronous operation
   */
  static trackSync<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    
    try {
      const result = fn();
      const duration = performance.now() - startTime;
      
      const metric: PerformanceMetrics = {
        operation,
        duration,
        timestamp,
        success: true,
        metadata
      };
      
      PerformanceMonitor.getInstance().recordMetric(metric);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      const metric: PerformanceMetrics = {
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

  private static instance: PerformanceMonitor;

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the latest metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(metric);
      } catch (error) {
        // Console statement removed for production
      }
    });
  }

  /**
   * Add listener for performance metrics
   */
  onMetric(listener: (metric: PerformanceMetrics) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Remove listener
   */
  offMetric(listener: (metric: PerformanceMetrics) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Get metrics for specific operation
   */
  getMetricsForOperation(operation: string): PerformanceMetrics[] {
    return this.metrics.filter(metric => metric.operation === operation);
  }

  /**
   * Get average duration for operation
   */
  getAverageDuration(operation: string): number {
    const operationMetrics = this.getMetricsForOperation(operation);
    if (operationMetrics.length === 0) return 0;
    
    const totalDuration = operationMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return totalDuration / operationMetrics.length;
  }

  /**
   * Get success rate for operation
   */
  getSuccessRate(operation: string): number {
    const operationMetrics = this.getMetricsForOperation(operation);
    if (operationMetrics.length === 0) return 0;
    
    const successful = operationMetrics.filter(metric => metric.success).length;
    return successful / operationMetrics.length;
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}

export class CacheManager {
  private cache = new Map<string, { value: any; timestamp: number; ttl: number }>();
  private config: CacheConfig;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: CacheConfig) {
    this.config = config;
    this.startCleanup();
  }

  /**
   * Set cache entry
   */
  set(key: string, value: any, ttl?: number): void {
    const entryTTL = ttl || this.config.ttl;
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: entryTTL
    });

    // Evict olt entries if cache is full
    if (this.cache.size > this.config.maxSize) {
      this.evictOlt();
    }
  }

  /**
   * Get cache entry
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    missRate: number;
  } {
    const totalRequests = this.cache.size;
    const hits = this.cache.size; // Production implementation required
    const misses = 0; // Production implementation required

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: totalRequests > 0 ? hits / totalRequests : 0,
      missRate: totalRequests > 0 ? misses / totalRequests : 0
    };
  }

  private evictOlt(): void {
    let oltKey: string | null = null;
    let oltTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oltTimestamp) {
        oltTimestamp = entry.timestamp;
        oltKey = key;
      }
    }

    if (oltKey) {
      this.cache.delete(oltKey);
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stop cleanup timer
   */
  troy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

export class DatabaseOptimizer {
  /**
   * Optimize database queries with connection pooling
   */
  static createConnectionPool(config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    min: number;
    max: number;
    idleTimeoutMillis: number;
  }) {
    // This would integrate with your actual database driver
    // Production implementation required
    return {
      ...config,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      troyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false
    };
  }

  /**
   * Generate optimized query with proper indexing hints
   */
  static optimizeQuery(query: string, indexes: string[]): string {
    // Add index hints to query
    if (indexes.length > 0) {
      const indexHint = `/*+ INDEX(${indexes.join(', ')}) */`;
      return query.replace(/SELECT/i, `SELECT ${indexHint}`);
    }
    return query;
  }

  /**
   * Batch operations for better performance
   */
  static batchOperations<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 10
  ): Promise<T[]> {
    const results: T[] = [];
    
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
          
          // Process next batch asynchronously
          const timer_1756915927905_whx45uzwr = setImmediate(processBatch);
        } catch (error) {
          reject(error);
        }
      };
      
      processBatch();
    });
  }
}

export class MemoryOptimizer {
  /**
   * Monitor memory usage
   */
  static getMemoryUsage(): {
    used: number;
    total: number;
    percentage: number;
  } {
    const used = process.memoryUsage();
    const total = used.heapTotal;
    const percentage = (used.heapUsed / total) * 100;
    
    return {
      used: used.heapUsed,
      total,
      percentage
    };
  }

  /**
   * Force garbage collection if available
   */
  static forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Optimize large objects by using object pooling
   */
  static createObjectPool<T>(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 100
  ) {
    const pool: T[] = [];
    
    return {
      acquire(): T {
        return pool.pop() || createFn();
      },
      
      release(obj: T): void {
        if (pool.length < maxSize) {
          resetFn(obj);
          pool.push(obj);
        }
      },
      
      getSize(): number {
        return pool.length;
      }
    };
  }
}

// Export performance tracking decorator
export function trackPerformance(operation: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return PerformanceMonitor.track(operation, () => originalMethod.apply(this, args));
    };
    
    return descriptor;
  };
}

// Export cache decorator
export function cached(ttl?: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cache = new CacheManager({ maxSize: 100, ttl: ttl || 60000, cleanupInterval: 30000 });
    
    descriptor.value = function (...args: any[]) {
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
