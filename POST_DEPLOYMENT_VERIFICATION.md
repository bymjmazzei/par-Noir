# Post-Deployment Verification Checklist

## ✅ Step 1: Database Migration
- [ ] Migration completed successfully
- [ ] No errors in migration logs
- [ ] Tables `feed_posts`, `feeds`, `feed_subscriptions` have new columns

## ✅ Step 2: API Health Checks

### Basic Health
```bash
curl https://api.parnoir.com/health
```
Expected: `{"status":"healthy","timestamp":"...","uptime":...}`

### API Status
```bash
curl https://api.parnoir.com/api/status
```

## ✅ Step 3: New API Endpoints

### Feed Routes
```bash
# List feeds
curl https://api.parnoir.com/api/feeds

# Get feed by ID (replace :feedId)
curl https://api.parnoir.com/api/feeds/:feedId
```

### Widget Routes
```bash
# Get feed widget (replace :feedId)
curl https://api.parnoir.com/api/widgets/feed/:feedId
```

### Public Index API
```bash
# Get public index (replace :identityId)
curl https://api.parnoir.com/api/public-index/:identityId
```

## ✅ Step 4: Environment Variables Check

Verify these are set in Railway:
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `COINBASE_WEBHOOK_SECRET` - Webhook secret (5795a8d7-5281-4ae4-99b5-0728cff68b66)
- [ ] `GOOGLE_SERVICE_ACCOUNT_KEY` - (if using Google Drive sync)
- [ ] `NODE_ENV=production`

## ✅ Step 5: Frontend Verification

### Check Firebase Environment Variables
- [ ] `VITE_GEMINI_API_KEY` is set
- [ ] `VITE_API_ENDPOINT` points to Railway API

### Test Frontend Features
- [ ] Gemini AI moderation working (upload a file)
- [ ] Reporting system working (report content)
- [ ] Feed creation UI accessible
- [ ] API key activation accessible (License area in dashboard; integrator keys on hosted developer console)

## ✅ Step 6: Coinbase Webhook Setup

1. Go to Coinbase Commerce Dashboard
2. Navigate to Settings → Webhooks
3. Add webhook URL: `https://api.parnoir.com/api/webhooks/coinbase`
4. Set webhook secret: `5795a8d7-5281-4ae4-99b5-0728cff68b66`
5. Select events: `charge:confirmed`, `charge:failed`, `charge:expired`
6. Test webhook delivery

## ✅ Step 7: Feature Testing

### Gemini AI Integration
- [ ] Upload an image → Check if metadata is auto-generated
- [ ] Upload NSFW content → Check if flagged correctly
- [ ] Report content → Check if Gemini re-checks

### Reporting System
- [ ] Report content as NSFW
- [ ] Verify report count increments
- [ ] Test auto-escalation (5 reports → NSFW)

### Feed System
- [ ] Create a new feed
- [ ] Add posts to feed
- [ ] Set top post
- [ ] View feed page

### Paid Feed Features
- [ ] Create paid feed with pricing
- [ ] Subscribe to feed (test payment)
- [ ] Verify subscription activation
- [ ] Test subscription cancellation

### Widget System
- [ ] Generate widget code for feed
- [ ] Embed widget in test page
- [ ] Verify widget displays correctly

## ✅ Step 8: Monitoring

### Railway Logs
- [ ] Check API service logs for errors
- [ ] Monitor database connection
- [ ] Watch for webhook processing

### Error Tracking
- [ ] Check Sentry (if configured) for errors
- [ ] Monitor Gemini API usage/quota
- [ ] Watch Coinbase webhook logs

## 🐛 Troubleshooting

### Migration Errors
- Check if tables already exist
- Verify DATABASE_URL is correct
- Check Railway database logs

### API Errors
- Verify environment variables
- Check Railway deployment logs
- Test endpoints individually

### Webhook Issues
- Verify webhook URL is accessible
- Check webhook secret matches
- Review Coinbase Commerce webhook logs

