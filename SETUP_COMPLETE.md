# ✅ Setup Complete - What I Did For You

## Automatically Configured:

1. ✅ **Gemini API Key** - Already set in `apps/id-dashboard/.env`
   - `VITE_GEMINI_API_KEY=AIzaSyBbUwbfoUnkttrXJiZJIqQtJcZzZK94Hy4`

2. ✅ **Frontend API Endpoint** - Added to `apps/id-dashboard/.env`
   - `VITE_API_ENDPOINT=https://api.parnoir.com`
   - `VITE_SUBDOMAIN_DOMAIN=parnoir.com`

3. ✅ **Backend Config Placeholders** - Added to `api/.env`
   - `COINBASE_WEBHOOK_SECRET=` (you need to fill this in)
   - `API_BASE_URL=https://api.parnoir.com`

4. ✅ **Migration Script** - Created `api/scripts/run-migration.js`
   - Ready to run when you deploy to Railway

---

## ⚠️ What You Still Need To Do:

### 1. Add Coinbase Webhook Secret

**Where:** `api/.env`

**How:**
1. Go to Coinbase Commerce Dashboard → Settings → Webhooks
2. Add webhook URL: `https://api.parnoir.com/api/webhooks/coinbase`
3. Copy the webhook secret
4. Add it to `api/.env`:
   ```
   COINBASE_WEBHOOK_SECRET=your_secret_here
   ```

### 2. Run Database Migration

**When:** After deploying to Railway (or when you have database access)

**How:**
```bash
# Option 1: On Railway (after deployment)
railway run node api/scripts/run-migration.js

# Option 2: Via Railway Dashboard
# Go to your Railway project → Database → Query
# Copy/paste contents of api/migrations/add_enhanced_feed_posts.sql
```

**Or:** The migration will run automatically if you add it to your Railway deployment script.

---

## 🚀 Ready to Deploy?

Everything is configured! Just:
1. Add the Coinbase webhook secret
2. Deploy to Railway
3. Run the migration

That's it! 🎉

