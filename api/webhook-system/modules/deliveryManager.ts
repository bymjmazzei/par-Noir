import { WebhookDelivery, WebhookSubscription, WebhookPayload } from '../types/webhookSystem';
import { DEFAULT_WEBHOOK_CONFIG } from '../constants/webhookConstants';

export class DeliveryManager {
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private retryDelays: number[] = DEFAULT_WEBHOOK_CONFIG.retryDelays;

  /**
   * Create a new webhook delivery
   */
  async createDelivery(subscriptionId: string, eventId: string): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: this.generateDeliveryId(),
      subscriptionId,
      eventId,
      status: 'pending',
      attempts: 0
    };

    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }

  /**
   * Get a webhook delivery by ID
   */
  getDelivery(id: string): WebhookDelivery | undefined {
    return this.deliveries.get(id);
  }

  /**
   * List webhook deliveries with filtering
   */
  listDeliveries(subscriptionId?: string, status?: string, limit: number = 50): WebhookDelivery[] {
    let deliveries = Array.from(this.deliveries.values());

    if (subscriptionId) {
      deliveries = deliveries.filter(delivery => delivery.subscriptionId === subscriptionId);
    }

    if (status) {
      deliveries = deliveries.filter(delivery => delivery.status === status);
    }

    // Sort by last attempt cending and limit
    return deliveries
      .sort((a, b) => {
        const aTime = a.lastAttempt ? new Date(a.lastAttempt).getTime() : 0;
        const bTime = b.lastAttempt ? new Date(b.lastAttempt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }

  /**
   * Process webhook delivery
   */
  async processDelivery(
    delivery: WebhookDelivery,
    subscription: WebhookSubscription,
    payload: WebhookPayload
  ): Promise<void> {
    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': this.generateSignature(payload, subscription.secret),
          'X-Webhook-Event': payload.type,
          'X-Webhook-Delivery': delivery.id,
          'User-Agent': 'Identity-Protocol-Webhook/1.0'
        },
        body: JSON.stringify(payload)
      });

      delivery.attempts++;
      delivery.lastAttempt = new Date();
      delivery.responseCode = response.status;

      if (response.ok) {
        delivery.status = 'delivered';
      } else {
        delivery.status = 'failed';
        delivery.responseBody = await response.text();

        // Schedule retry if attempts remaining
        if (delivery.attempts < this.retryDelays.length) {
          const delay = this.retryDelays[delivery.attempts] * 1000;
          delivery.nextRetry = new Date(Date.now() + delay);
          delivery.status = 'pending';
        }
      }

    } catch (error) {
      delivery.attempts++;
      delivery.lastAttempt = new Date();
      delivery.status = 'failed';
      delivery.responseBody = error instanceof Error ? error.message : 'Unknown error';

      // Schedule retry if attempts remaining
      if (delivery.attempts < this.retryDelays.length) {
        const delay = this.retryDelays[delivery.attempts] * 1000;
        delivery.nextRetry = new Date(Date.now() + delay);
        delivery.status = 'pending';
      }
    }
  }

  /**
   * Get pending deliveries ready for retry
   */
  getPendingDeliveries(): WebhookDelivery[] {
    const now = new Date();
    return Array.from(this.deliveries.values()).filter(
      delivery => 
        delivery.status === 'pending' && 
        delivery.nextRetry && 
        now >= delivery.nextRetry
    );
  }

  /**
   * Update delivery status
   */
  updateDeliveryStatus(deliveryId: string, status: 'pending' | 'delivered' | 'failed'): void {
    const delivery = this.deliveries.get(deliveryId);
    if (delivery) {
      delivery.status = status;
    }
  }

  /**
   * Get delivery statistics
   */
  getDeliveryStats(): {
    total: number;
    pending: number;
    delivered: number;
    failed: number;
    averageAttempts: number;
  } {
    const allDeliveries = Array.from(this.deliveries.values());
    
    if (allDeliveries.length === 0) {
      return {
        total: 0,
        pending: 0,
        delivered: 0,
        failed: 0,
        averageAttempts: 0
      };
    }

    const total = allDeliveries.length;
    const pending = allDeliveries.filter(d => d.status === 'pending').length;
    const delivered = allDeliveries.filter(d => d.status === 'delivered').length;
    const failed = allDeliveries.filter(d => d.status === 'failed').length;
    const totalAttempts = allDeliveries.reduce((sum, d) => sum + d.attempts, 0);
    const averageAttempts = totalAttempts / total;

    return {
      total,
      pending,
      delivered,
      failed,
      averageAttempts
    };
  }

  /**
   * Clean up old deliveries
   */
  cleanupOldDeliveries(olderThanDays: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let deletedCount = 0;
    for (const [id, delivery] of this.deliveries.entries()) {
      if (delivery.lastAttempt && new Date(delivery.lastAttempt) < cutoffDate) {
        this.deliveries.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: WebhookPayload, secret: string): string {
    const crypto = require('crypto');
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Generate unique delivery ID
   */
  private generateDeliveryId(): string {
    return `del_${Date.now()}_${crypto.getRandomValues(new Uint8Array(1))[0] / 255.toString(36).substr(2, 9)}`;
  }
}
