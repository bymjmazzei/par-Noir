const functions = require('firebase-functions');
const fetch = require('node-fetch');

// Import IPFS MFS metadata service
require('./metadata-service');

// Coinbase Commerce API configuration
const COINBASE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY || functions.config().coinbase?.api_key;
const COINBASE_API_BASE = 'https://api.commerce.coinbase.com';

/**
 * Create a Coinbase Commerce checkout
 */
exports.createCoinbaseCheckout = functions.https.onCall(async (data, context) => {
  try {
    console.log('Creating Coinbase checkout with data:', data);
    
    const response = await fetch(`${COINBASE_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CC-Api-Key': COINBASE_API_KEY,
        'X-CC-Version': '2018-03-22'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Coinbase API error:', errorData);
      throw new functions.https.HttpsError('internal', errorData.error?.message || response.statusText);
    }

    const result = await response.json();
    console.log('Checkout created successfully:', result.data);
    
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
    
    return { success: true, checkout: checkout };
  } catch (error) {
    console.error('Server error creating checkout:', error);
    throw new functions.https.HttpsError('internal', 'Failed to create checkout');
  }
});

/**
 * Test Coinbase API connection
 */
exports.testCoinbaseConnection = functions.https.onCall(async (data, context) => {
  try {
    const response = await fetch(`${COINBASE_API_BASE}/charges`, {
      method: 'GET',
      headers: {
        'X-CC-Api-Key': COINBASE_API_KEY,
        'X-CC-Version': '2018-03-22'
      }
    });

    if (response.ok) {
      return { status: 'connected', message: 'Coinbase API is accessible' };
    } else {
      return { 
        status: 'error', 
        message: 'Coinbase API connection failed',
        statusText: response.statusText
      };
    }
  } catch (error) {
    return { 
      status: 'error', 
      message: 'Failed to connect to Coinbase API',
      error: error.message
    };
  }
});
