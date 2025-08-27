# Coinbase Commerce Integration Setup

This guide will help you set up Coinbase Commerce for crypto payments in the Identity Protocol license system.

## 🚀 Step 1: Create Coinbase Commerce Account

1. **Go to Coinbase Commerce**: https://commerce.coinbase.com/
2. **Sign up** for a new account
3. **Verify your business details** (required for production)
4. **Complete KYC/AML requirements** if needed

## 🔑 Step 2: Get API Keys

1. **Navigate to Settings** in your Coinbase Commerce dashboard
2. **Go to API Keys section**
3. **Create a new API key** with appropriate permissions
4. **Copy the API key** - you'll need this for the integration

## 🌐 Step 3: Set Up Webhooks

1. **Go to Webhooks section** in your dashboard
2. **Add a new webhook endpoint**:
   - **URL**: `https://yourdomain.com/webhooks/coinbase`
   - **Events**: Select all events (charge:confirmed, charge:failed, charge:expired)
3. **Copy the webhook secret** - you'll need this for signature verification

## ⚙️ Step 4: Environment Variables

Add these environment variables to your `.env` file:

```bash
# Coinbase Commerce API Key
REACT_APP_COINBASE_COMMERCE_API_KEY=your_api_key_here

# Webhook Secret (server-side)
COINBASE_WEBHOOK_SECRET=your_webhook_secret_here
```

## 📦 Step 5: Install Dependencies

```bash
npm install @coinbase/commerce-sdk
```

## 🔧 Step 6: Server Setup

### Express.js Example

```javascript
const express = require('express');
const { createWebhookEndpoint } = require('./src/utils/coinbaseWebhook');

const app = express();
app.use(express.json());

// Add webhook endpoint
createWebhookEndpoint(app);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Next.js API Route Example

Create `pages/api/webhooks/coinbase.js`:

```javascript
import { CoinbaseWebhookHandler } from '../../../src/utils/coinbaseWebhook';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
```

## 🧪 Step 6: Test the Integration

### Test Mode
1. **Use test API keys** first
2. **Make test payments** using Coinbase Commerce test mode
3. **Verify webhook events** are received correctly
4. **Check license generation** works properly

### Production Mode
1. **Switch to production API keys**
2. **Update webhook URL** to production domain
3. **Test with small amounts** first
4. **Monitor webhook events** in production

## 🔒 Step 7: Security Considerations

### Webhook Security
- **Always verify webhook signatures**
- **Use HTTPS** for webhook endpoints
- **Implement rate limiting**
- **Log all webhook events**

### API Key Security
- **Never expose API keys** in client-side code
- **Use environment variables**
- **Rotate keys regularly**
- **Monitor API usage**

### Payment Security
- **Verify payment amounts** match expected amounts
- **Check payment confirmations** before issuing licenses
- **Implement proper error handling**
- **Log all payment events**

## 📊 Step 8: Monitoring

### Key Metrics to Monitor
- **Payment success rate**
- **Webhook delivery success**
- **License generation success**
- **API response times**
- **Error rates**

### Logging
```javascript
// Example logging in webhook handler
console.log('Payment confirmed:', {
  checkoutId: checkout.id,
  amount: checkout.pricing.local.amount,
  licenseType: checkout.metadata.licenseType,
  timestamp: new Date().toISOString()
});
```

## 🚨 Troubleshooting

### Common Issues

1. **Webhook not receiving events**
   - Check webhook URL is accessible
   - Verify webhook secret is correct
   - Check server logs for errors

2. **Payment not confirming**
   - Verify payment amount matches expected
   - Check blockchain confirmations
   - Monitor webhook events

3. **License not generating**
   - Check webhook processing logs
   - Verify metadata is correct
   - Check database connection

### Support Resources
- **Coinbase Commerce Documentation**: https://docs.commerce.coinbase.com/
- **API Reference**: https://docs.commerce.coinbase.com/api/
- **Webhook Guide**: https://docs.commerce.coinbase.com/webhooks

## 🎯 Production Checklist

- [ ] API keys configured
- [ ] Webhooks set up and tested
- [ ] Environment variables set
- [ ] Security measures implemented
- [ ] Monitoring configured
- [ ] Error handling tested
- [ ] Payment flow tested
- [ ] License generation tested
- [ ] Email notifications working
- [ ] Logging implemented

## 💡 Best Practices

1. **Always test in sandbox mode first**
2. **Implement proper error handling**
3. **Use webhook signature verification**
4. **Monitor all payment events**
5. **Keep API keys secure**
6. **Implement retry logic for failed webhooks**
7. **Use proper logging for debugging**
8. **Have a rollback plan ready**

---

**Need help?** Contact the Identity Protocol team or refer to the Coinbase Commerce documentation for additional support.

## 🌐 **Setting Up Subdomain pn.par-noir.com:**

### **Step 1: Add Subdomain in Netlify**
```bash
# In Netlify Dashboard:
1. Go to your site
2. Click "Domain settings"
3. Click "Add custom domain"
4. Enter: pn.par-noir.com
5. Click "Add"
```

### **Step 2: Configure DNS in Namecheap**
```bash
# In Namecheap DNS settings:
# Add this record:

Type: CNAME
Name: pn
Value: your-site-name.netlify.app
```

## 📋 **Detailed Steps:**

### **In Netlify:**
```bash
1. Go to your site dashboard
2. Click "Domain settings" (left sidebar)
3. Click "Add custom domain"
4. Type: pn.par-noir.com
5. Click "Add domain"
6. Netlify will show you DNS instructions
```

### **In Namecheap:**
```bash
1. Log into Namecheap
2. Go to "Domain List"
3. Click "Manage" next to par-noir.com
4. Click "Advanced DNS"
5. Add new record:
   - Type: CNAME
   - Name: pn
   - Value: your-site-name.netlify.app
6. Save the record
```

## 🔧 **DNS Record Example:**

### **What You'll Add:**
```bash
<code_block_to_apply_changes_from>
```

### **Result:**
```bash
✅ pn.par-noir.com → Your Netlify site
✅ Free SSL certificate (automatic)
✅ HTTPS enabled
```

## 🎯 **Why Use Subdomain:**

#
