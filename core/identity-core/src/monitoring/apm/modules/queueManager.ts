import { APMQueueItem, APMFlushResult, APMTransaction, APMSpan, APMError } from '../types/apm';

export class QueueManager {
  private queue: APMQueueItem[] = [];
  private maxQueueSize: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInterval: number;
  private isFlushing: boolean = false;

  constructor(maxQueueSize: number = 100, flushInterval: number = 5000) {
    this.maxQueueSize = maxQueueSize;
    this.flushInterval = flushInterval;
    this.startFlushTimer();
  }

  /**
   * Add item to queue
   */
  addToQueue(
    type: 'transaction' | 'span' | 'error',
    data: APMTransaction | APMSpan | APMError
  ): boolean {
    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      return false;
    }

    const queueItem: APMQueueItem = {
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0
    };

    this.queue.push(queueItem);
    return true;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is full
   */
  isQueueFull(): boolean {
    return this.queue.length >= this.maxQueueSize;
  }

  /**
   * Check if queue is empty
   */
  isQueueEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get queue items
   */
  getQueueItems(): APMQueueItem[] {
    return [...this.queue];
  }

  /**
   * Get queue items by type
   */
  getQueueItemsByType(type: 'transaction' | 'span' | 'error'): APMQueueItem[] {
    return this.queue.filter(item => item.type === type);
  }

  /**
   * Remove item from queue
   */
  removeFromQueue(index: number): boolean {
    if (index >= 0 && index < this.queue.length) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Start flush timer
   */
  startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      if (!this.isFlushing && !this.isQueueEmpty()) {
        this.flushQueue();
      }
    }, this.flushInterval);
  }

  /**
   * Stop flush timer
   */
  stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Update flush interval
   */
  updateFlushInterval(newInterval: number): void {
    this.flushInterval = newInterval;
    this.startFlushTimer();
  }

  /**
   * Update max queue size
   */
  updateMaxQueueSize(newSize: number): void {
    this.maxQueueSize = newSize;
    
    // Trim queue if it exceeds new size
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    current: number;
    max: number;
    flushed: number;
    byType: Record<string, number>;
    averageWaitTime: number;
  } {
    const now = Date.now();
    const byType: Record<string, number> = {};
    let totalWaitTime = 0;

    for (const item of this.queue) {
      byType[item.type] = (byType[item.type] || 0) + 1;
      totalWaitTime += now - item.timestamp;
    }

    return {
      current: this.queue.length,
      max: this.maxQueueSize,
      flushed: 0, // This would be tracked in production
      byType,
      averageWaitTime: this.queue.length > 0 ? totalWaitTime / this.queue.length : 0
    };
  }

  /**
   * Get queue health status
   */
  getQueueHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    utilization: number;
  } {
    const utilization = (this.queue.length / this.maxQueueSize) * 100;
    
    if (utilization >= 90) {
      return {
        status: 'critical',
        message: 'Queue is nearly full',
        utilization
      };
    } else if (utilization >= 70) {
      return {
        status: 'warning',
        message: 'Queue utilization is high',
        utilization
      };
    } else {
      return {
        status: 'healthy',
        message: 'Queue is operating normally',
        utilization
      };
    }
  }

  /**
   * Retry failed item
   */
  retryItem(index: number, maxRetries: number = 3): boolean {
    if (index >= 0 && index < this.queue.length) {
      const item = this.queue[index];
      
      if (item.retryCount < maxRetries) {
        item.retryCount++;
        item.timestamp = Date.now(); // Reset timestamp for retry
        return true;
      }
    }
    return false;
  }

  /**
   * Get items ready for retry
   */
  getItemsReadyForRetry(maxRetries: number = 3): APMQueueItem[] {
    return this.queue.filter(item => item.retryCount < maxRetries);
  }

  /**
   * Get items that have exceeded max retries
   */
  getItemsExceededMaxRetries(maxRetries: number = 3): APMQueueItem[] {
    return this.queue.filter(item => item.retryCount >= maxRetries);
  }

  /**
   * Remove items that have exceeded max retries
   */
  removeExceededMaxRetries(maxRetries: number = 3): number {
    const initialCount = this.queue.length;
    this.queue = this.queue.filter(item => item.retryCount < maxRetries);
    return initialCount - this.queue.length;
  }

  /**
   * Flush queue (placeholder for actual implementation)
   */
  async flushQueue(): Promise<APMFlushResult> {
    if (this.isFlushing || this.isQueueEmpty()) {
      return {
        success: true,
        itemsProcessed: 0,
        itemsFailed: 0,
        duration: 0
      };
    }

    this.isFlushing = true;
    const startTime = Date.now();
    
    try {
      // Simulate processing
      const itemsToProcess = [...this.queue];
      this.queue = [];
      
      // Simulate success/failure
      const success = crypto.getRandomValues(new Uint8Array(1))[0] / 255 > 0.1; // 90% success rate
      
      if (!success) {
        throw new Error('Failed to flush queue');
      }

      const duration = Date.now() - startTime;
      
      return {
        success: true,
        itemsProcessed: itemsToProcess.length,
        itemsFailed: 0,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      return {
        success: false,
        itemsProcessed: 0,
        itemsFailed: this.queue.length,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): {
    maxQueueSize: number;
    flushInterval: number;
  } {
    return {
      maxQueueSize: this.maxQueueSize,
      flushInterval: this.flushInterval
    };
  }

  /**
   * Destroy queue manager
   */
  troy(): void {
    this.stopFlushTimer();
    this.clearQueue();
  }
}
