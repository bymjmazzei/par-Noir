// Performance Monitor for tracking key performance indicators
// Helps identify bottlenecks and optimize performance

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PerformanceThreshold {
  name: string;
  warning: number;
  critical: number;
  unit: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private thresholds: Map<string, PerformanceThreshold> = new Map();
  private observers: Map<string, Set<(metric: PerformanceMetric) => void>> = new Map();
  private maxMetricsPerName = 100;

  private constructor() {
    this.initializeThresholds();
    this.startMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Measure function execution time
  measure<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', { ...metadata, error: true });
      throw error;
    }
  }

  // Measure async function execution time
  async measureAsync<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, 'ms', { ...metadata, error: true });
      throw error;
    }
  }

  // Record a custom metric
  recordMetric(name: string, value: number, unit: string, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      metadata
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(metric);

    // Keep only the most recent metrics
    if (metrics.length > this.maxMetricsPerName) {
      metrics.shift();
    }

    // Check thresholds and notify observers
    this.checkThresholds(metric);
    this.notifyObservers(metric);
  }

  // Get metrics for a specific name
  getMetrics(name: string): PerformanceMetric[] {
    return this.metrics.get(name) || [];
  }

  // Get all metrics
  getAllMetrics(): Map<string, PerformanceMetric[]> {
    return new Map(this.metrics);
  }

  // Get performance statistics
  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    average: number;
    median: number;
    p95: number;
    p99: number;
  } | null {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return null;

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const min = values[0];
    const max = values[count - 1];
    const average = values.reduce((sum, val) => sum + val, 0) / count;
    const median = values[Math.floor(count / 2)];
    const p95 = values[Math.floor(count * 0.95)];
    const p99 = values[Math.floor(count * 0.99)];

    return { count, min, max, average, median, p95, p99 };
  }

  // Set performance threshold
  setThreshold(name: string, warning: number, critical: number, unit: string): void {
    this.thresholds.set(name, { name, warning, critical, unit });
  }

  // Subscribe to metric updates
  subscribe(name: string, callback: (metric: PerformanceMetric) => void): () => void {
    if (!this.observers.has(name)) {
      this.observers.set(name, new Set());
    }

    this.observers.get(name)!.add(callback);

    // Return unsubscribe function
    return () => {
      const observers = this.observers.get(name);
      if (observers) {
        observers.delete(callback);
        if (observers.size === 0) {
          this.observers.delete(name);
        }
      }
    };
  }

  // Check if metric exceeds thresholds
  private checkThresholds(metric: PerformanceMetric): void {
    const threshold = this.thresholds.get(metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      // Console statement removed for production`);
    } else if (metric.value >= threshold.warning) {
      // Console statement removed for production`);
    }
  }

  // Notify observers of metric updates
  private notifyObservers(metric: PerformanceMetric): void {
    const observers = this.observers.get(metric.name);
    if (observers) {
      observers.forEach(callback => {
        try {
          callback(metric);
        } catch (error) {
          // Console statement removed for production
        }
      });
    }
  }

  // Initialize default thresholds
  private initializeThresholds(): void {
    // Function execution time thresholds
    this.setThreshold('function_execution', 100, 500, 'ms');
    this.setThreshold('api_call', 200, 1000, 'ms');
    this.setThreshold('crypto_operation', 50, 200, 'ms');
    this.setThreshold('render_time', 16, 50, 'ms'); // 60fps = 16.67ms
    this.setThreshold('memory_usage', 50, 100, 'MB');
  }

  // Start background monitoring
  private startMonitoring(): void {
    // Monitor memory usage
    setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        this.recordMetric('memory_usage', usedMB, 'MB', {
          total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
          limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024)
        });
      }
    }, 10000); // Every 10 seconds

    // Monitor frame rate
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFrameRate = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) { // Every second
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        this.recordMetric('fps', fps, 'fps');
        frameCount = 0;
        lastTime = currentTime;
      }
      
      const timer_1756915927775_un07xqvf8 = requestAnimationFrame(measureFrameRate);
    };
    
    const timer_1756915927775_o36sxslim = requestAnimationFrame(measureFrameRate);
  }

  // Generate performance report
  generateReport(): {
    summary: Record<string, any>;
    recommendations: string[];
    timestamp: string;
  } {
    const summary: Record<string, any> = {};
    const recommendations: string[] = [];
    const timestamp = new Date().toISOString();

    // Analyze each metric
    for (const [name, metrics] of this.metrics) {
      const stats = this.getStats(name);
      if (stats) {
        summary[name] = stats;
        
        // Generate recommendations based on thresholds
        const threshold = this.thresholds.get(name);
        if (threshold) {
          if (stats.p95 >= threshold.critical) {
            recommendations.push(`🚨 ${name} is critically slow (P95: ${stats.p95}${stats.unit})`);
          } else if (stats.p95 >= threshold.warning) {
            recommendations.push(`⚠️ ${name} is slower than expected (P95: ${stats.p95}${stats.unit})`);
          }
        }
      }
    }

    // Overall performance score
    const overallScore = this.calculateOverallScore(summary);
    summary.overallScore = overallScore;

    if (overallScore < 70) {
      recommendations.push('🔧 Overall performance needs improvement');
    } else if (overallScore < 90) {
      recommendations.push('⚡ Performance is good but could be optimized');
    } else {
      recommendations.push('🚀 Performance is excellent!');
    }

    return { summary, recommendations, timestamp };
  }

  // Calculate overall performance score
  private calculateOverallScore(summary: Record<string, any>): number {
    let totalScore = 0;
    let metricCount = 0;

    for (const [name, stats] of Object.entries(summary)) {
      if (name === 'overallScore') continue;
      
      const threshold = this.thresholds.get(name);
      if (threshold) {
        let score = 100;
        
        // Deduct points based on threshold violations
        if (stats.p95 >= threshold.critical) {
          score -= 50;
        } else if (stats.p95 >= threshold.warning) {
          score -= 25;
        }
        
        totalScore += score;
        metricCount++;
      }
    }

    return metricCount > 0 ? Math.round(totalScore / metricCount) : 100;
  }

  // Clear all metrics
  clear(): void {
    this.metrics.clear();
  }

  // Export metrics for analysis
  export(): string {
    return JSON.stringify({
      metrics: Object.fromEntries(this.metrics),
      thresholds: Object.fromEntries(this.thresholds),
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

// Convenience functions
export const measure = <T>(name: string, fn: () => T, metadata?: Record<string, any>): T => {
  return performanceMonitor.measure(name, fn, metadata);
};

export const measureAsync = <T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T> => {
  return performanceMonitor.measureAsync(name, fn, metadata);
};

export const recordMetric = (name: string, value: number, unit: string, metadata?: Record<string, any>): void => {
  performanceMonitor.recordMetric(name, value, unit, metadata);
};
