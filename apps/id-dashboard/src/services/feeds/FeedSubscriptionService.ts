/**
 * Feed Subscription Service
 * Handles feed subscriptions with Coinbase Commerce integration
 */

import { CoinbaseProxy } from '../../utils/coinbaseProxy';
import { FeedService, Feed } from './FeedService';
import { API_ENDPOINT } from '../../config/api';

export interface Subscription {
  id: string;
  feedId: string;
  subscriberId: string;
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  createdAt: string;
  expiresAt?: string;
  nextBillingDate?: string;
  paymentId?: string;
}

export interface SubscriptionResult {
  success: boolean;
  subscription?: Subscription;
  checkoutUrl?: string;
  error?: string;
}

export class FeedSubscriptionService {
  private static readonly MONTHLY_PRICE = 5.00;
  private static readonly ANNUAL_PRICE = 50.00;

  /**
   * Subscribe to a feed
   */
  static async subscribeToFeed(
    feedId: string,
    billingCycle: 'monthly' | 'annual'
  ): Promise<SubscriptionResult> {
    try {
      const authenticatedUserStr = localStorage.getItem('authenticated_user');
      if (!authenticatedUserStr) {
        return { success: false, error: 'User not authenticated' };
      }

      const authenticatedUser = JSON.parse(authenticatedUserStr);

      // Get feed details
      const feed = await FeedService.getFeed(feedId);
      if (!feed) {
        return { success: false, error: 'Feed not found' };
      }

      if (!feed.isPaid) {
        return { success: false, error: 'Feed is not a paid feed' };
      }

      // Create Coinbase Commerce checkout
      const price = billingCycle === 'monthly' 
        ? (feed.monthlyPrice || this.MONTHLY_PRICE)
        : (feed.annualPrice || this.ANNUAL_PRICE);

      const checkoutData = {
        name: `Feed Subscription: ${feed.feedName}`,
        description: `${billingCycle === 'monthly' ? 'Monthly' : 'Annual'} subscription to ${feed.feedName}`,
        pricing_type: 'fixed_price' as const,
        local_price: {
          amount: price.toFixed(2),
          currency: 'USD'
        },
        metadata: {
          feedId,
          subscriberId: authenticatedUser.id,
          billingCycle,
          type: 'feed_subscription'
        }
      };

      const checkout = await CoinbaseProxy.createCheckout(checkoutData);

      // Store subscription request (pending payment)
      const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authenticatedUser.accessToken || ''}`
        },
        body: JSON.stringify({
          billingCycle,
          checkoutId: checkout.id,
          checkoutUrl: checkout.hosted_url
        })
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || 'Failed to create subscription' };
      }

      return {
        success: true,
        checkoutUrl: checkout.hosted_url
      };
    } catch (error) {
      console.error('Subscription error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe'
      };
    }
  }

  /**
   * Cancel subscription
   */
  static async cancelSubscription(feedId: string): Promise<boolean> {
    try {
      const authenticatedUserStr = localStorage.getItem('authenticated_user');
      if (!authenticatedUserStr) {
        throw new Error('User not authenticated');
      }

      const authenticatedUser = JSON.parse(authenticatedUserStr);
      const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscriptions`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authenticatedUser.accessToken || ''}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Cancel subscription error:', error);
      return false;
    }
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(): Promise<Subscription[]> {
    try {
      const authenticatedUserStr = localStorage.getItem('authenticated_user');
      if (!authenticatedUserStr) {
        return [];
      }

      const authenticatedUser = JSON.parse(authenticatedUserStr);
      const response = await fetch(`${API_ENDPOINT}/api/subscriptions`, {
        headers: {
          'Authorization': `Bearer ${authenticatedUser.accessToken || ''}`
        }
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.subscriptions || [];
    } catch (error) {
      console.error('Get subscriptions error:', error);
      return [];
    }
  }

  /**
   * Check if user is subscribed to a feed
   */
  static async isSubscribed(feedId: string): Promise<boolean> {
    const subscriptions = await this.getUserSubscriptions();
    return subscriptions.some(
      sub => sub.feedId === feedId && sub.status === 'active'
    );
  }

  /**
   * Handle webhook payment confirmation
   */
  static async handlePaymentConfirmation(checkoutId: string): Promise<Subscription | null> {
    try {
      const authenticatedUserStr = localStorage.getItem('authenticated_user');
      if (!authenticatedUserStr) {
        return null;
      }

      const authenticatedUser = JSON.parse(authenticatedUserStr);
      const response = await fetch(`${API_ENDPOINT}/api/subscriptions/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authenticatedUser.accessToken || ''}`
        },
        body: JSON.stringify({ checkoutId })
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Payment confirmation error:', error);
      return null;
    }
  }
}

