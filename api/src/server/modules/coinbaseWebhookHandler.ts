/**
 * Coinbase Commerce Webhook Handler
 * Handles payment confirmations (e.g. feed creation). Platform-hosted paid
 * feed subscriptions are disabled; see feedSubscriptionPolicy.
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
      const checkoutId = charge.checkout?.id || charge.id;
      const metadata = charge.metadata || {};
      const licenseType = metadata.licenseType;

      if (!checkoutId) {
        console.warn('⚠️ [CoinbaseWebhook] No checkout ID in charge');
        return;
      }

      const db = getDatabasePool();

      // Handle feed creation payment
      if (licenseType === 'feed_creation') {
        const creatorDid = metadata.creatorDid;
        const feedName = metadata.feedName;
        
        if (!creatorDid || !feedName) {
          console.warn('⚠️ [CoinbaseWebhook] Missing feed creation metadata');
          return;
        }

        // Create pending feed (status: pending_verification)
        const feedId = `feed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        await db.query(`
          INSERT INTO feeds (
            feed_id, feed_name, feed_category, feed_description, creator_did, creator_tier,
            is_paid, monthly_price, annual_price, subdomain, branding, created_at, updated_at,
            subscriber_count, post_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          feedId,
          feedName,
          metadata.feedCategory || null,
          metadata.feedDescription || null,
          creatorDid,
          'feed',
          true,
          parseFloat(metadata.monthlyPrice || '5.00'),
          parseFloat(metadata.annualPrice || '50.00'),
          metadata.subdomain || null,
          JSON.stringify({}),
          now,
          now,
          0,
          0
        ]);

        // Store payment info for feed activation
        await db.query(`
          INSERT INTO feed_payments (
            feed_id, checkout_id, payment_id, status, created_at
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (checkout_id) DO UPDATE SET
            payment_id = $3,
            status = $4,
            updated_at = NOW()
        `, [
          feedId,
          checkoutId,
          charge.id,
          'pending_verification',
          now
        ]);

        console.log(`✅ [CoinbaseWebhook] Pending feed created: ${feedId} (checkout: ${checkoutId})`);
        return;
      }

      // Platform-hosted paid feed subscriptions are not offered (no Coinbase activation).
      const pendingSub = await db.query(
        `SELECT 1 FROM feed_subscriptions WHERE checkout_id = $1 AND status = 'pending' LIMIT 1`,
        [checkoutId]
      );
      if (pendingSub.rows.length > 0) {
        console.warn(
          '[CoinbaseWebhook] Ignoring feed subscription payment; platform-hosted feed subscriptions are disabled'
        );
      }
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

