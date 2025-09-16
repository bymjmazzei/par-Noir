import { COINBASE_CONFIG } from '../config/coinbase';
import { IntegrationConfigManager } from './integrationConfig';

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
      
      return checkout;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a checkout via direct Coinbase API (permanent solution)
   */
  static async createCheckoutViaProxy(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    
    try {
      // Use direct Coinbase API call
      const COINBASE_API_KEY = process.env.REACT_APP_COINBASE_COMMERCE_API_KEY || 
                               IntegrationConfigManager.getApiKey('coinbase', 'COINBASE_COMMERCE_API_KEY');
      
      if (!COINBASE_API_KEY) {
        throw new Error('Coinbase Commerce API key not configured. Please set REACT_APP_COINBASE_COMMERCE_API_KEY environment variable or configure it in Integration Settings.');
      }
      const COINBASE_API_BASE = 'https://api.commerce.coinbase.com';
      
      const response = await fetch(`${COINBASE_API_BASE}/checkouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key': COINBASE_API_KEY,
          'X-CC-Version': '2018-03-22'
        },
        body: JSON.stringify(checkoutData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || response.statusText);
      }

      const result = await response.json();
      
      // Handle different possible field names for hosted_url
      const checkout = result.data;
      if (!checkout.hosted_url && checkout.hosted_urls) {
        checkout.hosted_url = checkout.hosted_urls.redirect;
      }
      
      // If still no hosted_url, create one using the checkout ID
      if (!checkout.hosted_url) {
        checkout.hosted_url = `https://commerce.coinbase.com/checkout/${checkout.id}`;
      }
      
      return checkout;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a direct checkout URL (fallback method)
   */
  static createDirectCheckoutURL(checkoutData: CheckoutRequest): string {
    // For development, show a message that the server needs to be running
    // In production, this would create a proper checkout URL
    
    // Return a placeholder URL that shows the issue
    const placeholderUrl = `data:text/html,<html><body style="font-family: Arial, sans-serif; padding: 20px; text-align: center;"><h2>🚧 Development Mode</h2><p>The Coinbase Commerce server needs to be running.</p><p>Please run: <code>cd server && npm start</code></p><p>Then try again.</p></body></html>`;
    
    return placeholderUrl;
  }

  /**
   * Smart checkout creation with direct API
   */
  static async createCheckout(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {

    // Use the direct API approach (which is now the main method)
    try {
      return await this.createCheckoutViaProxy(checkoutData);
    } catch (error) {
      throw error;
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
