import { WebhookSubscription } from '../types/webhookSystem';
import { WEBHOOK_SUBSCRIPTION_STATUS } from '../constants/webhookConstants';

export class SubscriptionManager {
  private subscriptions: Map<string, WebhookSubscription> = new Map();

  /**
   * Create a new webhook subscription
   */
  async createSubscription(clientId: string, url: string, events: string[], secret: string): Promise<WebhookSubscription> {
    const subscription: WebhookSubscription = {
      id: this.generateSubscriptionId(),
      clientId,
      url,
      events,
      secret,
      isActive: true,
      createdAt: new Date(),
      failureCount: 0
    };

    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  /**
   * Get a webhook subscription by ID
   */
  getSubscription(id: string): WebhookSubscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * List all webhook subscriptions
   */
  listSubscriptions(clientId?: string): WebhookSubscription[] {
    let subscriptions = Array.from(this.subscriptions.values());

    if (clientId) {
      subscriptions = subscriptions.filter(sub => sub.clientId === clientId);
    }

    return subscriptions;
  }

  /**
   * Update a webhook subscription
   */
  async updateSubscription(
    id: string,
    updates: Partial<Pick<WebhookSubscription, 'url' | 'events' | 'isActive'>>
  ): Promise<WebhookSubscription | null> {
    const subscription = this.subscriptions.get(id);
    if (!subscription) {
      return null;
    }

    // Validate URL if provided
    if (updates.url) {
      try {
        new URL(updates.url);
      } catch {
        throw new Error('Invalid webhook URL');
      }
    }

    // Update fields
    if (updates.url) {
      subscription.url = updates.url;
    }

    if (updates.events && Array.isArray(updates.events)) {
      subscription.events = updates.events;
    }

    if (typeof updates.isActive === 'boolean') {
      subscription.isActive = updates.isActive;
    }

    return subscription;
  }

  /**
   * Delete a webhook subscription
   */
  deleteSubscription(id: string): boolean {
    return this.subscriptions.delete(id);
  }

  /**
   * Get active subscriptions for a specific event type
   */
  getActiveSubscriptionsForEvent(eventType: string): WebhookSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      sub => sub.isActive && sub.events.includes(eventType)
    );
  }

  /**
   * Update subscription failure count
   */
  updateFailureCount(subscriptionId: string, failureCount: number): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.failureCount = failureCount;
      
      // Deactivate subscription after too many failures
      if (failureCount >= 10) {
        subscription.isActive = false;
      }
    }
  }

  /**
   * Update subscription last delivery time
   */
  updateLastDelivery(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.lastDelivery = new Date();
      subscription.failureCount = 0; // Reset failure count on successful delivery
    }
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
  } {
    const allSubscriptions = Array.from(this.subscriptions.values());
    
    return {
      total: allSubscriptions.length,
      active: allSubscriptions.filter(sub => sub.isActive).length,
      inactive: allSubscriptions.filter(sub => !sub.isActive).length,
      suspended: allSubscriptions.filter(sub => sub.failureCount >= 10).length
    };
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${crypto.getRandomValues(new Uint8Array(1))[0] / 255.toString(36).substr(2, 9)}`;
  }
}
