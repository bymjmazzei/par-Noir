# Setup Guide: Gemini API Key & Coinbase Commerce Configuration

**Last Updated**: December 2024  
**Purpose**: Step-by-step guide to set up required API keys and services

---

## 🤖 Getting a Gemini API Key

### Step 1: Go to Google AI Studio

1. Visit: **https://aistudio.google.com/**
2. Sign in with your Google account
3. If you don't have access, you may need to join the waitlist (usually quick approval)

### Step 2: Create API Key

1. Once logged in, click **"Get API Key"** in the top right
2. Click **"Create API Key"**
3. Choose one of these options:
   - **Create API key in new project** (recommended for new projects)
   - **Create API key in existing project** (if you have a Google Cloud project)
4. Copy your API key immediately (you won't be able to see it again)

### Step 3: Configure API Key Restrictions (Recommended)

1. Go to **Google Cloud Console**: https://console.cloud.google.com/
2. Navigate to **APIs & Services** → **Credentials**
3. Find your API key and click **Edit**
4. Under **API restrictions**, select **"Restrict key"**
5. Select **"Generative Language API"** (Gemini API)
6. Under **Application restrictions**, you can optionally restrict by:
   - HTTP referrers (for web apps)
   - IP addresses (for server-side)
7. Click **Save**

### Step 4: Add API Key to Your Project

#### Option A: Environment Variable (Recommended)

Create or update `.env` file in `apps/id-dashboard/`:

```bash
VITE_GEMINI_API_KEY=your_api_key_here
```

#### Option B: Integration Settings (UI)

1. Open par Noir dashboard
2. Go to **Settings** → **Integrations**
3. Find **Gemini AI** integration
4. Enter your API key
5. Save

### Step 5: Verify Setup

The Gemini API has a **free tier**:
- **1,500 requests per day**
- **15 requests per minute**
- Perfect for getting started!

**Free tier covers**:
- ~45,000 files/month (at 1,500/day)
- Most small to medium usage scenarios

**When you exceed free tier**:
- Images: $0.00025 per image
- Text: $0.50 per 1M input tokens, $1.50 per 1M output tokens
- Very affordable pricing!

---

## 💰 Coinbase Commerce Setup (Already Configured)

Your Coinbase Commerce integration is already set up! Here's what you have:

### Current Configuration

**Files**:
- `apps/id-dashboard/src/utils/coinbaseProxy.ts` - Payment processing
- `apps/id-dashboard/src/config/coinbase.ts` - Configuration
- `apps/id-dashboard/src/utils/coinbaseWebhook.ts` - Webhook handling

**Environment Variables**:
```bash
REACT_APP_COINBASE_COMMERCE_API_KEY=your_coinbase_api_key
COINBASE_WEBHOOK_SECRET=your_webhook_secret
```

### Using Coinbase Commerce for Paid Feeds

The existing `CoinbaseProxy` class can be extended for feed subscriptions:

```typescript
// Example: Creating a checkout for feed subscription
import { CoinbaseProxy } from '../utils/coinbaseProxy';

const checkoutData = {
  name: `Feed Subscription: ${feedName}`,
  description: `Monthly subscription to ${feedName}`,
  pricing_type: 'fixed_price',
  local_price: {
    amount: '5.00',
    currency: 'USD'
  },
  metadata: {
    feedId: feed.id,
    pnId: authenticatedUser.id,
    billingCycle: 'monthly' // or 'annual'
  }
};

const checkout = await CoinbaseProxy.createCheckout(checkoutData);
// Redirect user to checkout.hosted_url
```

### Supported Cryptocurrencies

Coinbase Commerce supports:
- **BTC** (Bitcoin) - 3 confirmations
- **ETH** (Ethereum) - 12 confirmations
- **XRP** (Ripple) - 4 confirmations
- **USDT** (Tether) - 12 confirmations

---

## 🔧 Environment Variables Summary

### Required for Gemini Integration

```bash
# Gemini API Key
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### Already Configured (Coinbase Commerce)

```bash
# Coinbase Commerce API Key
REACT_APP_COINBASE_COMMERCE_API_KEY=your_coinbase_api_key

# Coinbase Webhook Secret (for payment verification)
COINBASE_WEBHOOK_SECRET=your_webhook_secret
```

### Already Configured (Veriff)

```bash
# Veriff API Key
REACT_APP_VERIFF_API_KEY=your_veriff_api_key
REACT_APP_VERIFF_API_SECRET=your_veriff_api_secret
```

### Optional (Subdomain Support)

```bash
# Subdomain domain
VITE_SUBDOMAIN_DOMAIN=parnoir.com
```

---

## 📝 Quick Setup Checklist

### Gemini API
- [ ] Visit https://aistudio.google.com/
- [ ] Sign in with Google account
- [ ] Create API key
- [ ] (Optional) Configure API restrictions
- [ ] Add to `.env` file: `VITE_GEMINI_API_KEY=your_key`
- [ ] Test API connection

### Coinbase Commerce
- [x] Already configured ✅
- [ ] Verify API key is set in environment
- [ ] Test payment flow

### Veriff
- [x] Already configured ✅
- [ ] Verify API keys are set
- [ ] Test verification flow

---

## 🧪 Testing Your Setup

### Test Gemini API

```typescript
// Quick test in browser console or test file
const testGemini = async () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Gemini API key not found');
    return;
  }

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Say hello!' }]
        }]
      })
    }
  );

  const data = await response.json();
  console.log('Gemini response:', data);
};

testGemini();
```

### Test Coinbase Commerce

```typescript
// Test checkout creation
import { CoinbaseProxy } from './utils/coinbaseProxy';

const testCheckout = async () => {
  try {
    const checkout = await CoinbaseProxy.createCheckout({
      name: 'Test Payment',
      description: 'Testing Coinbase Commerce',
      pricing_type: 'fixed_price',
      local_price: {
        amount: '1.00',
        currency: 'USD'
      },
      metadata: {
        test: 'true'
      }
    });
    console.log('Checkout created:', checkout.hosted_url);
  } catch (error) {
    console.error('Checkout error:', error);
  }
};
```

---

## 🔒 Security Best Practices

### Gemini API Key
- ✅ **Never commit API keys to git**
- ✅ **Use environment variables**
- ✅ **Restrict API key to specific APIs**
- ✅ **Use different keys for dev/prod**
- ✅ **Rotate keys periodically**

### Coinbase Commerce
- ✅ **Keep webhook secret secure**
- ✅ **Verify webhook signatures**
- ✅ **Use HTTPS for webhooks**
- ✅ **Monitor payment activity**

---

## 📚 Additional Resources

### Gemini API
- **Documentation**: https://ai.google.dev/docs
- **API Reference**: https://ai.google.dev/api
- **Pricing**: https://ai.google.dev/pricing
- **Free Tier Info**: 1,500 requests/day free

### Coinbase Commerce
- **Documentation**: https://commerce.coinbase.com/docs/
- **API Reference**: https://commerce.coinbase.com/docs/api/
- **Webhooks**: https://commerce.coinbase.com/docs/api/#webhooks

### Veriff
- **Documentation**: https://developers.veriff.com/
- **API Reference**: https://developers.veriff.com/#api-reference

---

## 🆘 Troubleshooting

### Gemini API Issues

**Error: "API key not valid"**
- Check that API key is correctly set in environment
- Verify API key hasn't expired
- Check API restrictions in Google Cloud Console

**Error: "Quota exceeded"**
- You've exceeded free tier (1,500/day)
- Wait 24 hours or upgrade to paid tier
- Check usage in Google Cloud Console

**Error: "Model not found"**
- Use correct model name: `gemini-pro` or `gemini-pro-vision`
- Check API availability in your region

### Coinbase Commerce Issues

**Error: "API key not configured"**
- Check `REACT_APP_COINBASE_COMMERCE_API_KEY` is set
- Verify key is correct in Coinbase Commerce dashboard
- Check integration settings in UI

**Payment not confirming**
- Check webhook is configured correctly
- Verify webhook secret matches
- Check payment status in Coinbase Commerce dashboard

---

## ✅ Next Steps

Once you have your Gemini API key:

1. ✅ Add to `.env` file
2. ✅ Update `TECHNICAL_BREAKDOWN.md` to use Coinbase Commerce
3. ✅ Start Sprint 1 implementation (Gemini Integration)
4. ✅ Test Gemini moderation service
5. ✅ Begin implementing paid feed subscriptions with Coinbase Commerce

---

**Ready to start? Get your Gemini API key and begin implementation!**

