import { SentryBreadcrumb } from '../types/sentry';

export class BreadcrumbManager {
  private breadcrumbs: SentryBreadcrumb[] = [];
  private maxBreadcrumbs: number = 100;

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    const newBreadcrumb: SentryBreadcrumb = {
      ...breadcrumb,
      timestamp: breadcrumb.timestamp || Date.now()
    };

    this.breadcrumbs.push(newBreadcrumb);

    // Keep only last N breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Add breadcrumb with category
   */
  addBreadcrumbWithCategory(
    message: string,
    category: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    data?: Record<string, any>
  ): void {
    this.addBreadcrumb({
      message,
      category,
      level,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Add navigation breadcrumb
   */
  addNavigationBreadcrumb(
    from: string,
    to: string,
    data?: Record<string, any>
  ): void {
    this.addBreadcrumb({
      message: `Navigation: ${from} → ${to}`,
      category: 'navigation',
      level: 'info',
      data: { from, to, ...data },
      timestamp: Date.now()
    });
  }

  /**
   * Add HTTP request breadcrumb
   */
  addHttpBreadcrumb(
    method: string,
    url: string,
    statusCode?: number,
    data?: Record<string, any>
  ): void {
    this.addBreadcrumb({
      message: `${method} ${url}${statusCode ? ` (${statusCode})` : ''}`,
      category: 'http',
      level: statusCode && statusCode >= 400 ? 'error' : 'info',
      data: { method, url, statusCode, ...data },
      timestamp: Date.now()
    });
  }

  /**
   * Add user action breadcrumb
   */
  addUserActionBreadcrumb(
    action: string,
    element?: string,
    data?: Record<string, any>
  ): void {
    this.addBreadcrumb({
      message: `User action: ${action}${element ? ` on ${element}` : ''}`,
      category: 'user',
      level: 'info',
      data: { action, element, ...data },
      timestamp: Date.now()
    });
  }

  /**
   * Add error breadcrumb
   */
  addErrorBreadcrumb(
    error: Error,
    context?: string,
    data?: Record<string, any>
  ): void {
    this.addBreadcrumb({
      message: `Error: ${error.message}`,
      category: 'error',
      level: 'error',
      data: { 
        errorType: error.constructor.name,
        errorMessage: error.message,
        context,
        ...data 
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get all breadcrumbs
   */
  getBreadcrumbs(): SentryBreadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Get breadcrumbs by category
   */
  getBreadcrumbsByCategory(category: string): SentryBreadcrumb[] {
    return this.breadcrumbs.filter(b => b.category === category);
  }

  /**
   * Get breadcrumbs by level
   */
  getBreadcrumbsByLevel(level: 'fatal' | 'error' | 'warning' | 'info' | 'debug'): SentryBreadcrumb[] {
    return this.breadcrumbs.filter(b => b.level === level);
  }

  /**
   * Get breadcrumbs by time range
   */
  getBreadcrumbsByTimeRange(start: number, end: number): SentryBreadcrumb[] {
    return this.breadcrumbs.filter(b => 
      b.timestamp && b.timestamp >= start && b.timestamp <= end
    );
  }

  /**
   * Get recent breadcrumbs
   */
  getRecentBreadcrumbs(limit: number = 10): SentryBreadcrumb[] {
    return this.breadcrumbs.slice(-limit);
  }

  /**
   * Clear all breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Clear breadcrumbs by category
   */
  clearBreadcrumbsByCategory(category: string): number {
    const initialCount = this.breadcrumbs.length;
    this.breadcrumbs = this.breadcrumbs.filter(b => b.category !== category);
    return initialCount - this.breadcrumbs.length;
  }

  /**
   * Clear breadcrumbs by time range
   */
  clearBreadcrumbsByTimeRange(start: number, end: number): number {
    const initialCount = this.breadcrumbs.length;
    this.breadcrumbs = this.breadcrumbs.filter(b => 
      !b.timestamp || b.timestamp < start || b.timestamp > end
    );
    return initialCount - this.breadcrumbs.length;
  }

  /**
   * Get breadcrumb count
   */
  getBreadcrumbCount(): number {
    return this.breadcrumbs.length;
  }

  /**
   * Get breadcrumb statistics
   */
  getBreadcrumbStats(): {
    total: number;
    byCategory: Record<string, number>;
    byLevel: Record<string, number>;
    byTimeRange: Record<string, number>;
  } {
    const stats = {
      total: this.breadcrumbs.length,
      byCategory: {} as Record<string, number>,
      byLevel: {} as Record<string, number>,
      byTimeRange: {} as Record<string, number>
    };

    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    for (const breadcrumb of this.breadcrumbs) {
      // Count by category
      stats.byCategory[breadcrumb.category] = (stats.byCategory[breadcrumb.category] || 0) + 1;
      
      // Count by level
      stats.byLevel[breadcrumb.level] = (stats.byLevel[breadcrumb.level] || 0) + 1;
      
      // Count by time range
      if (breadcrumb.timestamp) {
        const age = now - breadcrumb.timestamp;
        if (age < oneHour) {
          stats.byTimeRange['last_hour'] = (stats.byTimeRange['last_hour'] || 0) + 1;
        } else if (age < oneDay) {
          stats.byTimeRange['last_day'] = (stats.byTimeRange['last_day'] || 0) + 1;
        } else {
          stats.byTimeRange['older'] = (stats.byTimeRange['older'] || 0) + 1;
        }
      }
    }

    return stats;
  }

  /**
   * Set maximum breadcrumb limit
   */
  setMaxBreadcrumbs(max: number): void {
    this.maxBreadcrumbs = max;
    
    // Trim if current count exceeds new limit
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  /**
   * Get maximum breadcrumb limit
   */
  getMaxBreadcrumbs(): number {
    return this.maxBreadcrumbs;
  }

  /**
   * Export breadcrumbs for debugging
   */
  exportBreadcrumbs(): string {
    return JSON.stringify(this.breadcrumbs, null, 2);
  }

  /**
   * Import breadcrumbs from string
   */
  importBreadcrumbs(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.breadcrumbs = imported;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
