/**
 * Coinbase Commerce Webhook Handler
 * Handles payment confirmations for feed subscriptions
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDatabasePool } from '../utils/database';
import { FeedService } from './feedService';

export class CoinbaseWebhookHandler {
  private static readonly WEBHOOK_SECRET = process.env.COINBASE_WEBHOOK_SECRET || '';

  /**
   * Verify webhook signature
   */
  static verifySignature(payload: string, signature: string): boolean {
    if (!this.WEBHOOK_SECRET) {
      console.warn('⚠️ [CoinbaseWebhook] WEBHOOK_SECRET not set, skipping verification');
      return true; // Allow in development
    }

    const hmac = crypto.createHmac('sha256', this.WEBHOOK_SECRET);
    const digest = hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  }

  /**
   * Handle webhook event
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['x-cc-webhook-signature'] as string;
      const payload = JSON.stringify(req.body);

      // Verify signature
      if (!this.verifySignature(payload, signature)) {
        console.error('❌ [CoinbaseWebhook] Invalid signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const event = req.body;
      const eventType = event.type;
      const charge = event.data;

      console.log(`📢 [CoinbaseWebhook] Event received: ${eventType}`, {
        chargeId: charge?.id,
        checkoutId: charge?.checkout?.id
      });

      // Handle charge:confirmed event (payment successful)
      if (eventType === 'charge:confirmed') {
        await this.handlePaymentConfirmed(charge);
      }

      // Handle charge:failed event (payment failed)
      if (eventType === 'charge:failed') {
        await this.handlePaymentFailed(charge);
      }

      // Handle charge:expired event (payment expired)
      if (eventType === 'charge:expired') {
        await this.handlePaymentExpired(charge);
      }

      res.status(200).json({ received: true });
      return;
    } catch (error) {
      console.error('❌ [CoinbaseWebhook] Error handling webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
      return;
    }
  }

  /**
   * Handle payment confirmed
   */
  private static async handlePaymentConfirmed(charge: any): Promise<void> {
    try {
      const checkoutId = charge.checkout?.id;
      if (!checkoutId) {
        console.warn('⚠️ [CoinbaseWebhook] No checkout ID in charge');
        return;
      }

      const db = getDatabasePool();

      // Find subscription by checkout ID
      const result = await db.query(`
        SELECT * FROM feed_subscriptions 
        WHERE checkout_id = $1 AND status = 'pending'
        LIMIT 1
      `, [checkoutId]);

      if (result.rows.length === 0) {
        console.warn(`⚠️ [CoinbaseWebhook] No pending subscription found for checkout ${checkoutId}`);
        return;
      }

      const subscription = result.rows[0];
      const billingCycle = subscription.billing_cycle;
      const now = new Date();
      const expiresAt = new Date(now);
      
      if (billingCycle === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // Activate subscription
      await db.query(`
        UPDATE feed_subscriptions 
        SET status = 'active', 
            expires_at = $1, 
            next_billing_date = $2, 
            activated_at = NOW(),
            payment_id = $3
        WHERE subscription_id = $4
      `, [
        expiresAt.toISOString(),
        expiresAt.toISOString(),
        charge.id,
        subscription.subscription_id
      ]);

      // Subscribe to feed
      await FeedService.subscribeToFeed(subscription.feed_id, subscription.user_did);

      console.log(`✅ [CoinbaseWebhook] Subscription activated: ${subscription.subscription_id}`);
    } catch (error) {
      console.error('❌ [CoinbaseWebhook] Error handling payment confirmed:', error);
    }
  }

  /**
   * Handle payment failed
   */
  private static async handlePaymentFailed(charge: any): Promise<void> {
    try {
      const checkoutId = charge.checkout?.id;
      if (!checkoutId) return;

      const db = getDatabasePool();

      // Mark subscription as failed
      await db.query(`
        UPDATE feed_subscriptions 
        SET status = 'expired', failed_at = NOW()
        WHERE checkout_id = $1 AND status = 'pending'
      `, [checkoutId]);

      console.log(`❌ [CoinbaseWebhook] Payment failed for checkout ${checkoutId}`);
    } catch (error) {
      console.error('❌ [CoinbaseWebhook] Error handling payment failed:', error);
    }
  }

  /**
   * Handle payment expired
   */
  private static async handlePaymentExpired(charge: any): Promise<void> {
    try {
      const checkoutId = charge.checkout?.id;
      if (!checkoutId) return;

      const db = getDatabasePool();

      // Mark subscription as expired
      await db.query(`
        UPDATE feed_subscriptions 
        SET status = 'expired', expired_at = NOW()
        WHERE checkout_id = $1 AND status = 'pending'
      `, [checkoutId]);

      console.log(`⏰ [CoinbaseWebhook] Payment expired for checkout ${checkoutId}`);
    } catch (error) {
      console.error('❌ [CoinbaseWebhook] Error handling payment expired:', error);
    }
  }
}

