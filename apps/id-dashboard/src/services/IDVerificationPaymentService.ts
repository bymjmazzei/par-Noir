import { CoinbaseProxy, CheckoutRequest, CoinbaseCheckout } from '../utils/coinbaseProxy';
import { COINBASE_CONFIG } from '../config/coinbase';

export interface IDVerificationPaymentRequest {
  identityId: string;
  amount: number;
  currency: string;
  description?: string;
}

export interface IDVerificationPaymentResult {
  checkoutId: string;
  hostedUrl: string;
  amount: string;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  expiresAt: Date;
}

export interface PaymentStatus {
  checkoutId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  amount: string;
  currency: string;
  transactionHash?: string;
  confirmedAt?: Date;
}

/**
 * ID Verification Payment Service
 * Handles cryptocurrency payments for identity verification using Coinbase Commerce
 */
export class IDVerificationPaymentService {
  private static readonly VERIFICATION_PRICE = 5.00; // $5.00 USD
  private static readonly VERIFICATION_CURRENCY = 'USD';
  private static readonly PAYMENT_TIMEOUT_MINUTES = 30;

  /**
   * Create a payment checkout for ID verification
   */
  static async createVerificationPayment(
    request: IDVerificationPaymentRequest
  ): Promise<IDVerificationPaymentResult> {
    try {
      // Validate request
      if (!request.identityId) {
        throw new Error('Identity ID is required');
      }

      if (request.amount !== this.VERIFICATION_PRICE) {
        throw new Error(`Verification fee must be $${this.VERIFICATION_PRICE}`);
      }

      // Create checkout request
      const checkoutData: CheckoutRequest = {
        name: 'par Noir Identity Verification',
        description: 'Government ID verification with secure processing',
        pricing_type: 'fixed_price',
        local_price: {
          amount: request.amount.toFixed(2),
          currency: request.currency || this.VERIFICATION_CURRENCY
        },
        requested_info: ['email'],
        metadata: {
          licenseType: 'id_verification',
          identityHash: request.identityId,
          licensePrice: request.amount.toFixed(2),
          serviceType: 'identity_verification',
          verificationType: 'government_id'
        }
      };

      // Create checkout via Coinbase Commerce
      const checkout = await CoinbaseProxy.createCheckout(checkoutData);

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + this.PAYMENT_TIMEOUT_MINUTES);

      // Store payment status locally
      await this.storePaymentStatus({
        checkoutId: checkout.id,
        status: 'pending',
        amount: checkout.local_price.amount,
        currency: checkout.local_price.currency
      });

      return {
        checkoutId: checkout.id,
        hostedUrl: checkout.hosted_url || '',
        amount: checkout.local_price.amount,
        currency: checkout.local_price.currency,
        status: 'pending',
        expiresAt
      };
    } catch (error) {
      throw new Error(`Payment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check payment status
   */
  static async checkPaymentStatus(checkoutId: string): Promise<PaymentStatus> {
    try {
      // First check local storage
      const localStatus = await this.getLocalPaymentStatus(checkoutId);
      if (localStatus) {
        return localStatus;
      }

      // If not found locally, check with Coinbase Commerce API
      return await this.checkCoinbasePaymentStatus(checkoutId);
    } catch (error) {
      throw new Error(`Payment status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify payment completion and process verification
   */
  static async verifyPaymentAndProcess(checkoutId: string, identityId: string): Promise<boolean> {
    try {
      const paymentStatus = await this.checkPaymentStatus(checkoutId);
      
      if (paymentStatus.status === 'completed') {
        // Mark payment as processed
        await this.markPaymentProcessed(checkoutId);
        
        // Trigger ID verification process
        await this.triggerIDVerification(identityId, checkoutId);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Payment verification failed:', error);
      return false;
    }
  }

  /**
   * Get supported currencies for ID verification
   */
  static getSupportedCurrencies(): string[] {
    return COINBASE_CONFIG.SUPPORTED_CURRENCIES;
  }

  /**
   * Get verification price in different currencies
   */
  static getVerificationPrice(currency: string = 'USD'): number {
    // For now, we'll use a simple conversion
    // In production, you'd want to use real-time exchange rates
    const exchangeRates: { [key: string]: number } = {
      'USD': 5.00,
      'BTC': 0.00012, // Approximate BTC price for $5
      'ETH': 0.002,   // Approximate ETH price for $5
      'XRP': 8.5,     // Approximate XRP price for $5
      'USDT': 5.00    // 1:1 with USD
    };

    return exchangeRates[currency.toUpperCase()] || 5.00;
  }

  /**
   * Store payment status locally
   */
  private static async storePaymentStatus(status: PaymentStatus): Promise<void> {
    try {
      const key = `id_verification_payment_${status.checkoutId}`;
      const data = {
        ...status,
        storedAt: new Date().toISOString()
      };
      
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to store payment status locally:', error);
    }
  }

  /**
   * Get payment status from local storage
   */
  private static async getLocalPaymentStatus(checkoutId: string): Promise<PaymentStatus | null> {
    try {
      const key = `id_verification_payment_${checkoutId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const data = JSON.parse(stored);
        return {
          checkoutId: data.checkoutId,
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          transactionHash: data.transactionHash,
          confirmedAt: data.confirmedAt ? new Date(data.confirmedAt) : undefined
        };
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to get local payment status:', error);
      return null;
    }
  }

  /**
   * Check payment status with Coinbase Commerce API
   */
  private static async checkCoinbasePaymentStatus(checkoutId: string): Promise<PaymentStatus> {
    try {
      const COINBASE_API_KEY = process.env.REACT_APP_COINBASE_COMMERCE_API_KEY;
      
      if (!COINBASE_API_KEY) {
        throw new Error('Coinbase Commerce API key not configured');
      }

      const response = await fetch(`https://api.commerce.coinbase.com/checkouts/${checkoutId}`, {
        method: 'GET',
        headers: {
          'X-CC-Api-Key': COINBASE_API_KEY,
          'X-CC-Version': '2018-03-22'
        }
      });

      if (!response.ok) {
        throw new Error(`Coinbase API error: ${response.statusText}`);
      }

      const result = await response.json();
      const checkout = result.data;

      // Map Coinbase status to our status
      let status: PaymentStatus['status'] = 'pending';
      if (checkout.timeline) {
        const latestEvent = checkout.timeline[checkout.timeline.length - 1];
        if (latestEvent) {
          switch (latestEvent.status) {
            case 'NEW':
            case 'PENDING':
              status = 'pending';
              break;
            case 'COMPLETED':
              status = 'completed';
              break;
            case 'EXPIRED':
              status = 'expired';
              break;
            case 'UNRESOLVED':
              status = 'failed';
              break;
            default:
              status = 'processing';
          }
        }
      }

      const paymentStatus: PaymentStatus = {
        checkoutId: checkout.id,
        status,
        amount: checkout.pricing.local.amount,
        currency: checkout.pricing.local.currency,
        transactionHash: checkout.transactions?.[0]?.hash,
        confirmedAt: status === 'completed' ? new Date() : undefined
      };

      // Store updated status locally
      await this.storePaymentStatus(paymentStatus);

      return paymentStatus;
    } catch (error) {
      throw new Error(`Coinbase payment status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark payment as processed
   */
  private static async markPaymentProcessed(checkoutId: string): Promise<void> {
    try {
      const key = `id_verification_payment_${checkoutId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        const data = JSON.parse(stored);
        data.processedAt = new Date().toISOString();
        data.status = 'completed';
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.warn('Failed to mark payment as processed:', error);
    }
  }

  /**
   * Trigger ID verification process after payment
   */
  private static async triggerIDVerification(identityId: string, checkoutId: string): Promise<void> {
    try {
      // Store verification trigger
      const verificationData = {
        identityId,
        checkoutId,
        triggeredAt: new Date().toISOString(),
        status: 'payment_verified'
      };
      
      localStorage.setItem(`id_verification_trigger_${identityId}`, JSON.stringify(verificationData));
      
      // In a real implementation, this would trigger the verification process
      console.log('ID verification triggered for identity:', identityId, 'with payment:', checkoutId);
    } catch (error) {
      console.error('Failed to trigger ID verification:', error);
    }
  }

  /**
   * Get verification trigger status
   */
  static async getVerificationTrigger(identityId: string): Promise<any> {
    try {
      const key = `id_verification_trigger_${identityId}`;
      const stored = localStorage.getItem(key);
      
      if (stored) {
        return JSON.parse(stored);
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to get verification trigger:', error);
      return null;
    }
  }

  /**
   * Clear verification trigger after processing
   */
  static async clearVerificationTrigger(identityId: string): Promise<void> {
    try {
      const key = `id_verification_trigger_${identityId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to clear verification trigger:', error);
    }
  }
}
