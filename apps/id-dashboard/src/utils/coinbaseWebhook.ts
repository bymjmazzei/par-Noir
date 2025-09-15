import { LicenseVerification, LicenseInfo } from './licenseVerification';
import { COINBASE_CONFIG, getConfirmationBlocks } from '../config/coinbase';

interface CoinbaseWebhookEvent {
  id: string;
  type: string;
  data: {
    id: string;
    code: string;
    name: string;
    description: string;
    hosted_url: string;
    created_at: string;
    expires_at: string;
    confirmed_at: string;
    pricing: {
      local: {
        amount: string;
        currency: string;
      };
    };
    metadata: {
      licenseType: string;
      identityHash: string;
      licensePrice: string;
    };
    payments: Array<{
      network: string;
      transaction_id: string;
      status: string;
      value: {
        local: {
          amount: string;
          currency: string;
        };
      };
    }>;
  };
}

export class CoinbaseWebhookHandler {
  private static webhookSecret = COINBASE_CONFIG.WEBHOOK_SECRET;

  /**
   * Verify webhook signature from Coinbase Commerce
   */
  static verifyWebhookSignature(payload: string, signature: string): boolean {
    // In production, implement proper signature verification
    // using crypto.createHmac('sha256', this.webhookSecret)
    return true; // Simplified for demo
  }

  /**
   * Process webhook events from Coinbase Commerce
   */
  static async processWebhook(event: CoinbaseWebhookEvent): Promise<void> {
    try {

      if (event.type === 'charge:confirmed') {
        await this.handlePaymentConfirmed(event.data);
      } else if (event.type === 'charge:failed') {
        await this.handlePaymentFailed(event.data);
      } else if (event.type === 'charge:expired') {
        await this.handlePaymentExpired(event.data);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle confirmed payment and issue license
   */
  private static async handlePaymentConfirmed(checkout: any): Promise<void> {
    try {
      // Verify payment amount matches expected amount
      const expectedAmount = checkout.metadata.licensePrice;
      const paidAmount = checkout.pricing.local.amount;
      
      if (parseFloat(paidAmount) < parseFloat(expectedAmount)) {
        return;
      }

      // Check if this is an ID verification payment
      const serviceType = checkout.metadata.serviceType;
      if (serviceType === 'identity_verification') {
        await this.handleIDVerificationPayment(checkout);
        return;
      }

      // Generate license information for regular licenses
      const licenseKey = `LIC-${checkout.metadata.licenseType.toUpperCase()}-${checkout.metadata.identityHash.substring(0, 8)}-${Date.now()}`;
      const licenseInfo: LicenseInfo = {
        licenseKey,
        type: checkout.metadata.licenseType as 'perpetual' | 'annual',
        identityHash: checkout.metadata.identityHash,
        issuedAt: new Date().toISOString(),
        expiresAt: checkout.metadata.licenseType === 'perpetual' 
          ? 'Never' 
          : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        isCommercial: true
      };

      // Store license in database (in production)
      await LicenseVerification.storeLicense(licenseInfo);

      // Send confirmation email (in production)
      await this.sendLicenseConfirmationEmail(licenseInfo, checkout);

    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle ID verification payment
   */
  private static async handleIDVerificationPayment(checkout: any): Promise<void> {
    try {
      const identityId = checkout.metadata.identityHash;
      const checkoutId = checkout.id;
      
      // Store payment confirmation for ID verification
      const paymentData = {
        checkoutId,
        identityId,
        amount: checkout.pricing.local.amount,
        currency: checkout.pricing.local.currency,
        confirmedAt: new Date().toISOString(),
        status: 'completed'
      };
      
      // Store in localStorage for client-side access
      localStorage.setItem(`id_verification_payment_${checkoutId}`, JSON.stringify(paymentData));
      
      // Trigger ID verification process
      localStorage.setItem(`id_verification_trigger_${identityId}`, JSON.stringify({
        identityId,
        checkoutId,
        triggeredAt: new Date().toISOString(),
        status: 'payment_verified'
      }));
      
      console.log('ID verification payment confirmed:', paymentData);
      
      // In production, you would:
      // 1. Store payment data in database
      // 2. Send confirmation email
      // 3. Trigger verification process
      // 4. Update user's verification status
      
    } catch (error) {
      console.error('Error handling ID verification payment:', error);
      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  private static async handlePaymentFailed(checkout: any): Promise<void> {
    
    // In production, send failure notification email
    // await this.sendPaymentFailureEmail(checkout);
  }

  /**
   * Handle expired payment
   */
  private static async handlePaymentExpired(checkout: any): Promise<void> {
    
    // In production, send expiration notification email
    // await this.sendPaymentExpiredEmail(checkout);
  }

  /**
   * Send license confirmation email
   */
  private static async sendLicenseConfirmationEmail(licenseInfo: LicenseInfo, checkout: any): Promise<void> {
    // In production, implement email sending
    
    // Example email content:
    const emailContent = {
      to: checkout.payer?.email_addresses?.[0]?.address || 'customer@example.com',
      subject: 'Your Identity Protocol License',
      body: `
        Thank you for your purchase!
        
        License Details:
        - License Key: ${licenseInfo.licenseKey}
        - Type: ${licenseInfo.type}
        - Issued: ${licenseInfo.issuedAt}
        - Expires: ${licenseInfo.expiresAt}
        
        You can now use Identity Protocol for commercial purposes.
        
        Best regards,
        Identity Protocol Team
      `
    };
    
  }

  /**
   * Get checkout status from Coinbase Commerce
   */
  static async getCheckoutStatus(checkoutId: string): Promise<any> {
    // In production, make API call to Coinbase Commerce
    // const response = await fetch(`https://api.commerce.coinbase.com/checkouts/${checkoutId}`, {
    //   headers: {
    //     'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY,
    //     'Content-Type': 'application/json'
    //   }
    // });
    // return response.json();
    
    // Mock response for demo
    return {
      id: checkoutId,
      status: 'confirmed',
      confirmed_at: new Date().toISOString()
    };
  }
}

// Express.js webhook endpoint example
export const createWebhookEndpoint = (app: any) => {
  app.post('/webhooks/coinbase', async (req: any, res: any) => {
    try {
      const signature = req.headers['x-cc-webhook-signature'];
      const payload = JSON.stringify(req.body);

      // Verify webhook signature
      if (!CoinbaseWebhookHandler.verifyWebhookSignature(payload, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Process webhook event
      await CoinbaseWebhookHandler.processWebhook(req.body);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
};
