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
   * Create a checkout via direct API call (may fail due to CORS in browser)
   */
  static async createCheckoutDirect(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    console.log('Attempting direct API call to Coinbase Commerce...');
    
    try {
      const response = await fetch(`${this.API_BASE}/checkouts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CC-Api-Key': this.API_KEY,
          'X-CC-Version': '2018-03-22'
        },
        body: JSON.stringify(checkoutData)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Coinbase API Error: ${errorData.error?.message || response.statusText}`);
      }

      const result = await response.json();
      console.log('Direct API response:', result);
      
      // Handle different possible field names for hosted_url
      const checkout = result.data;
      if (!checkout.hosted_url && checkout.hosted_urls) {
        checkout.hosted_url = checkout.hosted_urls.redirect;
      }
      
      // If still no hosted_url, create one using the checkout ID
      if (!checkout.hosted_url) {
        checkout.hosted_url = `https://commerce.coinbase.com/checkout/${checkout.id}`;
        console.log('Created fallback hosted_url:', checkout.hosted_url);
      }
      
      console.log('Processed checkout data:', checkout);
      return checkout;
    } catch (error) {
      console.error('Direct API call failed:', error);
      throw error;
    }
  }

  /**
   * Create a checkout via server proxy (recommended for production)
   */
  static async createCheckoutViaProxy(checkoutData: CheckoutRequest): Promise<CoinbaseCheckout> {
    console.log('Attempting checkout via server proxy...');
    
    try {
      // Call the server endpoint (adjust URL based on your setup)
      const serverUrl = 'https://pn.parnoir.com'; // Production server URL
      const response = await fetch(`${serverUrl}/api/coinbase/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(checkoutData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server Error: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('Server proxy response:', result);
      return result.checkout;
    } catch (error) {
      console.error('Server proxy call failed:', error);
      throw error;
    }
  }

  /**
   * Create a direct checkout URL (fallback method)
   */
  static createDirectCheckoutURL(checkoutData: CheckoutRequest): string {
    // For production, create a direct Coinbase checkout URL
    console.warn('⚠️ Using direct Coinbase checkout as fallback');
    
    // Create a direct checkout URL using Coinbase Commerce
    const baseUrl = 'https://commerce.coinbase.com/checkout';
    const params = new URLSearchParams({
      name: checkoutData.name,
      description: checkoutData.description,
      pricing_type: checkoutData.pricing_type,
      local_price: JSON.stringify(checkoutData.local_price),
      metadata: JSON.stringify(checkoutData.metadata)
    });
    
    return `${baseUrl}?${params.toString()}`;
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
