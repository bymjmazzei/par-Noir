const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://yourdomain.com'],
  credentials: true
}));

app.use(express.json());

// Coinbase Commerce API configuration
const COINBASE_API_KEY = process.env.COINBASE_COMMERCE_API_KEY || 'your-coinbase-api-key-here';
const COINBASE_API_BASE = 'https://api.commerce.coinbase.com';

/**
 * Create a Coinbase Commerce checkout
 */
app.post('/api/coinbase/create-checkout', async (req, res) => {
  try {
    const checkoutData = req.body;
    
    console.log('Creating Coinbase checkout with data:', checkoutData);
    
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
      console.error('Coinbase API error:', errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || response.statusText
      });
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
    
    console.log('Processed checkout data:', checkout);
    
    res.json({
      success: true,
      checkout: checkout
    });
  } catch (error) {
    console.error('Server error creating checkout:', error);
    res.status(500).json({
      error: 'Failed to create checkout',
      details: error.message
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Test endpoint to verify Coinbase API connection
 */
app.get('/api/coinbase/test', async (req, res) => {
  try {
    const response = await fetch(`${COINBASE_API_BASE}/charges`, {
      method: 'GET',
      headers: {
        'X-CC-Api-Key': COINBASE_API_KEY,
        'X-CC-Version': '2018-03-22'
      }
    });

    if (response.ok) {
      res.json({ status: 'connected', message: 'Coinbase API is accessible' });
    } else {
      res.status(response.status).json({ 
        status: 'error', 
        message: 'Coinbase API connection failed',
        statusText: response.statusText
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to connect to Coinbase API',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Coinbase API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Test endpoint: http://localhost:${PORT}/api/coinbase/test`);
});
