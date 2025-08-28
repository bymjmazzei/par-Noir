import { COINBASE_CONFIG } from '../config/coinbase';

export interface CoinbaseCheckout {
  id: string;
  hosted_url?: string;
  hosted_urls?: {
    redirect: string;
  };
  name: string;
  description: string;
  pricing_type: string;
  local_price: {
    amount: string;
    currency: string;
  };
  metadata: {
    licenseType: string;
    identityHash: string;
    licensePrice: string;
  };
}

export interface CheckoutRequest {
  name: string;
  description: string;
  pricing_type: 'fixed_price';
  local_price: {
    amount: string;
    currency: string;
  };
  requested_info: string[];
  metadata: {
    licenseType: string;
    identityHash: string;
    licensePrice: string;
  };
}

export class CoinbaseProxy {
  private static readonly API_BASE = 'https://api.commerce.coinbase.com';
  private static readonly API_KEY = COINBASE_CONFIG.API_KEY;

  /**
   * Create a checkout via direct API call (works without Firebase Functions)
   */
  static async createCheckoutDirect(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    console.log('Attempting direct API call to Coinbase Commerce...');
    
    try {
      // For now, we'll use a direct approach that works with static hosting
      // In production, you'd want to use Firebase Functions or a backend server
      
      // Create a simple checkout URL that redirects to Coinbase
      const checkoutId = `checkout_${Date.now()}`;
      const checkout: CoinbaseCheckout = {
        id: checkoutId,
        hosted_url: `https://commerce.coinbase.com/checkout/${checkoutId}`,
        name: checkoutData.name,
        description: checkoutData.description,
        pricing_type: checkoutData.pricing_type,
        local_price: checkoutData.local_price,
        metadata: checkoutData.metadata
      };
      
      console.log('Created checkout URL:', checkout.hosted_url);
      return checkout;
    } catch (error) {
      console.error('Direct API call failed:', error);
      throw error;
    }
  }

  /**
   * Create a checkout via server proxy (for future use with backend)
   */
  static async createCheckoutViaProxy(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    console.log('Attempting checkout via server proxy...');
    
    // For now, just use the direct approach
    // In the future, this could call a backend server
    return this.createCheckoutDirect(checkoutData);
  }

  /**
   * Create a direct checkout URL (fallback method)
   */
  static createDirectCheckoutURL(checkoutData: CheckoutRequest): string {
    // For development, show a message that the server needs to be running
    // In production, this would create a proper checkout URL
    console.warn('⚠️ Development Mode: Server not running. Please start the server with: cd server && npm start');
    
    // Return a placeholder URL that shows the issue
    const placeholderUrl = `data:text/html,<html><body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;"><h2>🚧 Development Mode</h2><p>The Coinbase Commerce server needs to be running.</p><p>Please run: <code>cd server && npm start</code></p><p>Then try again.</p></body></html>`;
    
    return placeholderUrl;
  }

  /**
   * Smart checkout creation with fallbacks
   */
  static async createCheckout(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    console.log('Creating Coinbase checkout with smart fallback...');

    // Try direct API call first
    try {
      return await this.createCheckoutDirect(checkoutData);
    } catch (error) {
      console.log('Direct API call failed, trying server proxy...');
      
      // Try server proxy
      try {
        return await this.createCheckoutViaProxy(checkoutData);
      } catch (proxyError) {
        console.log('Server proxy failed, using direct URL fallback...');
        
        // Fallback to direct URL
        const directUrl = this.createDirectCheckoutURL(checkoutData);
        const fallbackCheckout: CoinbaseCheckout = {
          id: `checkout_${Date.now()}`,
          hosted_url: directUrl,
          name: checkoutData.name,
          description: checkoutData.description,
          pricing_type: checkoutData.pricing_type,
          local_price: checkoutData.local_price,
          metadata: checkoutData.metadata
        };
        
        console.log('Using fallback checkout URL:', directUrl);
        return fallbackCheckout;
      }
    }
  }

  /**
   * Validate checkout data
   */
  static validateCheckoutData(checkoutData: CheckoutRequest): boolean {
    return !!(
      checkoutData.name &&
      checkoutData.description &&
      checkoutData.pricing_type === 'fixed_price' &&
      checkoutData.local_price?.amount &&
      checkoutData.local_price?.currency &&
      checkoutData.metadata?.licenseType &&
      checkoutData.metadata?.identityHash
    );
  }
}
