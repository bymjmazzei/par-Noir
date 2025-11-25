# Deployment Checklist - Comprehensive Upgrade

## ✅ Pre-Deployment Steps

### 1. Database Migrations

Run the database migration to add support for enhanced feed posts and paid subscriptions:

```bash
# Connect to your PostgreSQL database
psql -U your_username -d your_database_name

# Run the migration
\i api/migrations/add_enhanced_feed_posts.sql
```

Or if using a database management tool, execute the SQL file: `api/migrations/add_enhanced_feed_posts.sql`

**What this adds:**
- Enhanced feed_posts table with rich content support (media, buttons, polls, forms)
- Subscription fields (billing_cycle, status, checkout_id, expires_at, etc.)
- Feed pricing fields (is_paid, monthly_price, annual_price, subdomain)

### 2. Environment Variables

Add/update these environment variables in your `.env` files:

#### Frontend (`apps/id-dashboard/.env`)
```bash
# Gemini AI (Required for content moderation)
VITE_GEMINI_API_KEY=your_gemini_api_key_here

# API Endpoint
VITE_API_ENDPOINT=https://api.parnoir.com
# Or for local development:
# VITE_API_ENDPOINT=http://localhost:3001

# Subdomain Domain (optional)
VITE_SUBDOMAIN_DOMAIN=parnoir.com
```

#### Backend (`api/.env`)
```bash
# Coinbase Commerce Webhook Secret (Required for subscription payments)
COINBASE_WEBHOOK_SECRET=your_coinbase_webhook_secret

# Coinbase Commerce API Key (if needed for additional operations)
COINBASE_COMMERCE_API_KEY=your_coinbase_api_key

# API Base URL (for widget generation)
API_BASE_URL=https://api.parnoir.com

# Database (should already be configured)
DATABASE_URL=your_database_url
```

### 3. Coinbase Commerce Webhook Setup

1. Go to Coinbase Commerce Dashboard
2. Navigate to Settings → Webhooks
3. Add webhook URL: `https://api.parnoir.com/api/webhooks/coinbase`
4. Copy the webhook secret and add it to `COINBASE_WEBHOOK_SECRET` in your backend `.env`
5. Select events to listen for:
   - `charge:confirmed` (required)
   - `charge:failed` (recommended)
   - `charge:expired` (recommended)

### 4. Gemini API Key Setup

1. Go to https://aistudio.google.com/
2. Sign in with your Google account
3. Click "Get API Key" → "Create API Key"
4. Copy the key and add it to `VITE_GEMINI_API_KEY` in your frontend `.env`
5. **Important**: Restrict your API key in Google Cloud Console:
   - Go to https://console.cloud.google.com/apis/credentials
   - Click on your API key
   - Restrict to "Generative Language API"
   - Add HTTP referrers/IPs for your application

---

## 🧪 Testing Checklist

### Gemini AI Integration
- [ ] Upload a file and verify Gemini moderation runs
- [ ] Check that metadata is auto-generated
- [ ] Verify content rating is set (safe/nsfw/x-rated)
- [ ] Test with NSFW content to ensure it's flagged

### Reporting System
- [ ] Report content via kebab menu
- [ ] Verify report count increments
- [ ] Test auto-escalation (5 reports → NSFW)
- [ ] Check owner notifications (if implemented)

### API System
- [ ] Open License Modal (should show API key)
- [ ] Activate API key with Veriff verification
- [ ] Test OAuth endpoints (`/api/v1/oauth/authorize`, `/api/v1/oauth/token`)
- [ ] Test data point requests (`/api/v1/data-points/:dataPointId`)
- [ ] Test public index API (`/api/v1/public-index/:identityId`)

### Paid Feed System
- [ ] Create a new paid feed via FeedCreator
- [ ] Set pricing (monthly/annual)
- [ ] Create enhanced top post with media/buttons/polls/forms
- [ ] Add regular posts to feed
- [ ] Browse feeds on FeedDiscovery page
- [ ] Subscribe to a feed (test payment flow)
- [ ] View feed on FeedPage
- [ ] Cancel subscription

### Widgets & Subdomains
- [ ] Generate widget code for a feed
- [ ] Embed widget on a test page
- [ ] Verify widget renders correctly
- [ ] Test subdomain lookup (`/api/feeds/by-subdomain/:subdomain`)
- [ ] Access feed via subdomain (if DNS configured)

### Payment Webhooks
- [ ] Complete a test subscription payment
- [ ] Verify webhook receives `charge:confirmed` event
- [ ] Check subscription is activated automatically
- [ ] Verify subscriber count updates

---

## 🚀 Deployment Steps

### 1. Build Frontend
```bash
cd apps/id-dashboard
npm run build
```

### 2. Build Backend
```bash
cd api
npm run build
```

### 3. Run Database Migration
```bash
# On production database
psql -U production_user -d production_db -f api/migrations/add_enhanced_feed_posts.sql
```

### 4. Deploy Backend
- Deploy API server with new routes
- Ensure webhook endpoint is accessible: `/api/webhooks/coinbase`
- Verify environment variables are set

### 5. Deploy Frontend
- Deploy built frontend files
- Ensure `VITE_GEMINI_API_KEY` is set in production environment
- Verify API endpoint is correct

### 6. DNS Configuration (for subdomains)
If using subdomain support:
- Configure wildcard DNS: `*.parnoir.com` → your server IP
- Set up reverse proxy/load balancer to route subdomains
- Update server to handle subdomain routing

---

## 🔍 Post-Deployment Verification

### Health Checks
- [ ] API health endpoint: `GET /health`
- [ ] API status: `GET /api/status`
- [ ] Feed listing: `GET /api/feeds`
- [ ] Widget generation: `GET /api/widgets/feed/:feedId`

### Monitoring
- [ ] Monitor Coinbase webhook logs
- [ ] Check Gemini API usage/quota
- [ ] Monitor database performance
- [ ] Watch for subscription payment errors

### User Testing
- [ ] Have a test user create a feed
- [ ] Test subscription flow end-to-end
- [ ] Verify widget embedding works
- [ ] Test reporting functionality

---

## 📝 Important Notes

1. **Database Backup**: Always backup your database before running migrations
2. **API Keys**: Never commit API keys to version control
3. **Webhook Security**: Ensure webhook signature verification is working
4. **Rate Limits**: Monitor Gemini API rate limits
5. **Payment Testing**: Use Coinbase Commerce test mode first

---

## 🐛 Troubleshooting

### Gemini API Errors
- Check API key is correct and not expired
- Verify API key restrictions allow your domain
- Check rate limits/quota

### Payment Webhooks Not Working
- Verify webhook URL is accessible
- Check webhook secret matches
- Review Coinbase Commerce webhook logs
- Ensure webhook endpoint accepts POST requests

### Database Errors
- Verify migration ran successfully
- Check table schemas match expected structure
- Review database connection settings

### Widget Not Loading
- Check CORS settings on API
- Verify widget URL is correct
- Check browser console for errors
- Ensure feed exists and has posts

---

## 📚 Documentation

- **API Documentation**: See `docs/api/API_REFERENCE.md`
- **Technical Breakdown**: See `TECHNICAL_BREAKDOWN.md`
- **Implementation Plan**: See `IMPLEMENTATION_PLAN.md`
- **Setup Guide**: See `SETUP_GUIDE.md`

---

## ✅ Ready to Deploy?

Once all checklist items are complete:
1. ✅ Database migration run
2. ✅ Environment variables configured
3. ✅ Webhooks configured
4. ✅ Testing completed
5. ✅ Builds successful
6. ✅ DNS configured (if using subdomains)

You're ready to deploy! 🚀

