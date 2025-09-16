import { COINBASE_CONFIG } from '../config/coinbase';

// Identity Verification Payment Handler
// Handles Coinbase Commerce webhooks for identity verification payments

export interface VerificationPaymentEvent {
  id: string;
  type: 'charge:confirmed' | 'charge:failed' | 'charge:expired' | 'charge:created';
  data: {
    id: string;
    code: string;
    name: string;
    description: string;
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
    timeline: Array<{
      time: string;
      status: string;
    }>;
  };
  created_at: string;
}

export interface VerificationPaymentResult {
  success: boolean;
  verificationId?: string;
  identityId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export class VerificationPaymentHandler {
  /**
   * Process verification payment webhook
   */
  static async processPaymentWebhook(event: VerificationPaymentEvent): Promise<VerificationPaymentResult> {
    try {
      // Verify webhook signature (in production)
      // await this.verifyWebhookSignature(event);

      switch (event.type) {
        case 'charge:confirmed':
          return await this.handlePaymentConfirmed(event);
        case 'charge:failed':
          return await this.handlePaymentFailed(event);
        case 'charge:expired':
          return await this.handlePaymentExpired(event);
        case 'charge:created':
          return await this.handlePaymentCreated(event);
        default:
          return {
            success: false,
            error: `Unsupported event type: ${event.type}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle confirmed payment
   */
  private static async handlePaymentConfirmed(event: VerificationPaymentEvent): Promise<VerificationPaymentResult> {
    try {
      const { data } = event;
      
      // Verify this is an identity verification payment
      if (data.metadata.licenseType !== 'verification') {
        return {
          success: false,
          error: 'Not an identity verification payment'
        };
      }

      // Verify payment amount
      const expectedAmount = parseFloat(data.metadata.licensePrice);
      const paidAmount = parseFloat(data.pricing.local.amount);
      
      if (paidAmount < expectedAmount) {
        return {
          success: false,
          error: `Insufficient payment amount. Expected: $${expectedAmount}, Paid: $${paidAmount}`
        };
      }

      // Generate verification ID
      const verificationId = `veriff_${data.metadata.identityHash}_${Date.now()}`;
      
      // Store verification payment record
      await this.storeVerificationPayment({
        verificationId,
        identityId: data.metadata.identityHash,
        amount: paidAmount,
        currency: data.pricing.local.currency,
        paymentId: data.id,
        confirmedAt: new Date().toISOString()
      });

      // Send verification approval notification
      await this.sendVerificationApprovalNotification(verificationId, data.metadata.identityHash);

      return {
        success: true,
        verificationId,
        identityId: data.metadata.identityHash,
        amount: paidAmount,
        currency: data.pricing.local.currency
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process confirmed payment'
      };
    }
  }

  /**
   * Handle failed payment
   */
  private static async handlePaymentFailed(event: VerificationPaymentEvent): Promise<VerificationPaymentResult> {
    try {
      const { data } = event;
      
      // Log failed payment
      console.log(`Identity verification payment failed for identity: ${data.metadata.identityHash}`);
      
      // Send failure notification
      await this.sendPaymentFailureNotification(data.metadata.identityHash);

      return {
        success: false,
        error: 'Payment failed',
        identityId: data.metadata.identityHash
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process payment failure'
      };
    }
  }

  /**
   * Handle expired payment
   */
  private static async handlePaymentExpired(event: VerificationPaymentEvent): Promise<VerificationPaymentResult> {
    try {
      const { data } = event;
      
      // Log expired payment
      console.log(`Identity verification payment expired for identity: ${data.metadata.identityHash}`);
      
      // Send expiration notification
      await this.sendPaymentExpirationNotification(data.metadata.identityHash);

      return {
        success: false,
        error: 'Payment expired',
        identityId: data.metadata.identityHash
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process payment expiration'
      };
    }
  }

  /**
   * Handle payment created
   */
  private static async handlePaymentCreated(event: VerificationPaymentEvent): Promise<VerificationPaymentResult> {
    try {
      const { data } = event;
      
      // Log payment creation
      console.log(`Identity verification payment created for identity: ${data.metadata.identityHash}`);
      
      return {
        success: true,
        identityId: data.metadata.identityHash,
        amount: parseFloat(data.pricing.local.amount),
        currency: data.pricing.local.currency
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process payment creation'
      };
    }
  }

  /**
   * Store verification payment record
   */
  private static async storeVerificationPayment(payment: {
    verificationId: string;
    identityId: string;
    amount: number;
    currency: string;
    paymentId: string;
    confirmedAt: string;
  }): Promise<void> {
    try {
      // In production, this would store in a database
      // For now, we'll store in localStorage for demo purposes
      const payments = JSON.parse(localStorage.getItem('verification_payments') || '[]');
      payments.push(payment);
      localStorage.setItem('verification_payments', JSON.stringify(payments));
      
      console.log('Verification payment stored:', payment);
    } catch (error) {
      console.error('Failed to store verification payment:', error);
      throw error;
    }
  }

  /**
   * Send verification approval notification
   */
  private static async sendVerificationApprovalNotification(
    verificationId: string, 
    identityId: string
  ): Promise<void> {
    try {
      // In production, this would send an email or push notification
      console.log(`Verification approved for identity ${identityId}, verification ID: ${verificationId}`);
      
      // You could integrate with your existing notification system here
      // await notificationService.sendVerificationApproval(identityId, verificationId);
    } catch (error) {
      console.error('Failed to send verification approval notification:', error);
    }
  }

  /**
   * Send payment failure notification
   */
  private static async sendPaymentFailureNotification(identityId: string): Promise<void> {
    try {
      // In production, this would send an email or push notification
      console.log(`Payment failed for identity ${identityId}`);
      
      // You could integrate with your existing notification system here
      // await notificationService.sendPaymentFailure(identityId);
    } catch (error) {
      console.error('Failed to send payment failure notification:', error);
    }
  }

  /**
   * Send payment expiration notification
   */
  private static async sendPaymentExpirationNotification(identityId: string): Promise<void> {
    try {
      // In production, this would send an email or push notification
      console.log(`Payment expired for identity ${identityId}`);
      
      // You could integrate with your existing notification system here
      // await notificationService.sendPaymentExpiration(identityId);
    } catch (error) {
      console.error('Failed to send payment expiration notification:', error);
    }
  }

  /**
   * Get verification payment status
   */
  static async getPaymentStatus(identityId: string): Promise<{
    hasPayment: boolean;
    isConfirmed: boolean;
    amount?: number;
    currency?: string;
    confirmedAt?: string;
  }> {
    try {
      const payments = JSON.parse(localStorage.getItem('verification_payments') || '[]');
      const payment = payments.find((p: any) => p.identityId === identityId);
      
      if (!payment) {
        return {
          hasPayment: false,
          isConfirmed: false
        };
      }

      return {
        hasPayment: true,
        isConfirmed: true,
        amount: payment.amount,
        currency: payment.currency,
        confirmedAt: payment.confirmedAt
      };
    } catch (error) {
      console.error('Failed to get payment status:', error);
      return {
        hasPayment: false,
        isConfirmed: false
      };
    }
  }

  /**
   * Verify webhook signature (for production)
   */
  private static async verifyWebhookSignature(event: VerificationPaymentEvent): Promise<boolean> {
    // In production, you would verify the webhook signature here
    // This ensures the webhook actually came from Coinbase Commerce
    
    // Example implementation:
    // const signature = request.headers['x-cc-webhook-signature'];
    // const payload = JSON.stringify(event);
    // const expectedSignature = crypto
    //   .createHmac('sha256', COINBASE_CONFIG.WEBHOOK_SECRET)
    //   .update(payload)
    //   .digest('hex');
    
    // return signature === expectedSignature;
    
    return true; // For development
  }
}

// Export singleton instance
export const verificationPaymentHandler = new VerificationPaymentHandler();
