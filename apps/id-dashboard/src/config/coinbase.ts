// Coinbase Commerce Configuration
export const COINBASE_CONFIG = {
  // API Key for Coinbase Commerce
  API_KEY: process.env.COINBASE_COMMERCE_API_KEY || 'your-coinbase-api-key-here',
  
  // Webhook secret (set this in your server environment)
  WEBHOOK_SECRET: process.env.COINBASE_WEBHOOK_SECRET || 'your-webhook-secret-here',
  
  // Supported cryptocurrencies
  SUPPORTED_CURRENCIES: [
    'BTC',   // Bitcoin
    'ETH',   // Ethereum
    'XRP',   // Ripple
    'USDT'   // Tether
  ],
  
  // Payment settings
  PAYMENT_SETTINGS: {
    // Payment window timeout (in minutes)
    TIMEOUT_MINUTES: 30,
    
    // Minimum payment confirmation blocks
    CONFIRMATION_BLOCKS: {
      BTC: 3,   // Bitcoin: 3 confirmations
      ETH: 12,  // Ethereum: 12 confirmations
      XRP: 4,   // Ripple: 4 confirmations
      USDT: 12, // USDT: 12 confirmations (same as ETH)
      DEFAULT: 6 // Default for other cryptocurrencies
    },
    
    // Price tolerance (percentage)
    PRICE_TOLERANCE: 0.05, // 5% tolerance for price fluctuations
  },
  
  // Webhook events to handle
  WEBHOOK_EVENTS: [
    'charge:confirmed',  // Payment confirmed
    'charge:failed',     // Payment failed
    'charge:expired',    // Payment expired
    'charge:created'     // Payment created
  ]
};

// Helper function to get confirmation blocks for a currency
export const getConfirmationBlocks = (currency: string): number => {
  return COINBASE_CONFIG.PAYMENT_SETTINGS.CONFIRMATION_BLOCKS[currency as keyof typeof COINBASE_CONFIG.PAYMENT_SETTINGS.CONFIRMATION_BLOCKS] 
    || COINBASE_CONFIG.PAYMENT_SETTINGS.CONFIRMATION_BLOCKS.DEFAULT;
};

// Helper function to check if currency is supported
export const isSupportedCurrency = (currency: string): boolean => {
  return COINBASE_CONFIG.SUPPORTED_CURRENCIES.includes(currency.toUpperCase());
};
