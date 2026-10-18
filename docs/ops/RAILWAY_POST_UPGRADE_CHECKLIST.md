# Railway Post-Upgrade Checklist

After upgrading from Railway trial to a paid plan, some configuration may have changed. Use this checklist to verify your API server is properly configured.

## Quick Checks

### 1. Verify Service is Running
1. Go to your Railway project dashboard
2. Check that your API service shows a **green status** (running)
3. If it's red/yellow, click on it and check the logs

### 2. Check Environment Variables

Go to your **API service** → **Variables** tab and verify these are set:

#### Required Variables

- **`DATABASE_URL`** 
  - Should be automatically provided by Railway PostgreSQL service
  - Format: `postgresql://user:password@host:port/database`
  - **Action**: If missing, check that PostgreSQL service is connected to your API service

#### Optional Variables (but recommended)

- **`REDIS_URL`**
  - Only needed if you're using Redis for caching
  - Format: `redis://default:password@host:port`
  - **Action**: If you had Redis before, check that it's still connected and copy the URL from Redis service → Variables tab

- **`GOOGLE_SERVICE_ACCOUNT_KEY`**
  - JSON key for Google Drive sync (if using)
  - **Action**: If missing, you'll need to re-add it from Google Cloud Console

- **`NODE_ENV`**
  - Should be set to `production` for production deployments
  - **Action**: Add if missing: `NODE_ENV=production`

### 3. Verify Database Connection

1. Go to your Railway project
2. Check that **PostgreSQL** service exists and is running
3. In your **API service** → **Variables** tab, verify `DATABASE_URL` is present
4. If missing:
   - Go to PostgreSQL service → **Variables** tab
   - Copy the `DATABASE_URL` value
   - Add it to your API service → **Variables** tab

### 4. Check Service Connections

Railway services need to be "connected" to share environment variables:

1. In your Railway project, check that:
   - PostgreSQL service is visible
   - Redis service is visible (if using)
   - API service is visible

2. If services aren't connected:
   - Click on your API service
   - Look for a "Connect" or "Link" option
   - Connect it to PostgreSQL (and Redis if applicable)

### 5. Restart the Service

After verifying/updating environment variables:

1. Go to your API service
2. Click **"Deploy"** or **"Redeploy"** button
3. Wait for deployment to complete
4. Check the logs for startup messages

### 6. Verify Logs

After restart, check the logs. You should see:

```
✅ Database connection pool created
✅ Database schema initialized
✅ [Cache] Redis connected (if Redis is configured)
✅ [Cache] Redis initialized (if Redis is configured)
🚀 Identity Protocol API Server running on port 3001
```

## Common Issues After Upgrade

### Issue: "Database connection failed"

**Symptoms:**
- Logs show: `❌ Failed to initialize database`
- API returns 500 errors

**Solution:**
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` is set in API service variables
3. If `DATABASE_URL` is missing:
   - Go to PostgreSQL service → Variables tab
   - Copy `DATABASE_URL`
   - Add to API service → Variables tab
4. Redeploy API service

### Issue: "Redis connection failed"

**Symptoms:**
- Logs show: `❌ [Cache] Failed to initialize Redis`
- API works but caching is disabled

**Solution:**
1. Verify Redis service exists and is running
2. Go to Redis service → Variables tab
3. Copy `REDIS_URL`
4. Add `REDIS_URL` to API service → Variables tab
5. Redeploy API service

**Note:** Redis is optional - the API will work without it, just without caching.

### Issue: Service won't start

**Symptoms:**
- Service shows as "Failed" or keeps restarting
- Logs show errors on startup

**Solution:**
1. Check logs for specific error messages
2. Verify all required environment variables are set
3. Check that `DATABASE_URL` is correct format
4. Try redeploying the service
5. If still failing, check Railway status page for service issues

### Issue: Environment variables were reset

**Symptoms:**
- Service starts but features don't work
- Missing functionality (Google Drive sync, etc.)

**Solution:**
1. Go through the environment variables checklist above
2. Re-add any missing variables
3. Redeploy service

## Step-by-Step Recovery

If your API server isn't working after upgrade, follow these steps:

### Step 1: Check Service Status
```
Railway Dashboard → Your Project → API Service
```
- Is it green (running)?
- If not, check the logs tab

### Step 2: Verify Database
```
Railway Dashboard → Your Project → PostgreSQL Service → Variables Tab
```
- Copy `DATABASE_URL`
- Go to API Service → Variables Tab
- Verify `DATABASE_URL` exists and matches
- If missing, add it

### Step 3: Verify Redis (if using)
```
Railway Dashboard → Your Project → Redis Service → Variables Tab
```
- Copy `REDIS_URL`
- Go to API Service → Variables Tab
- Verify `REDIS_URL` exists
- If missing, add it

### Step 4: Add Production Environment
```
API Service → Variables Tab → + New Variable
```
- Key: `NODE_ENV`
- Value: `production`
- Add

### Step 5: Redeploy
```
API Service → Deployments Tab → Redeploy
```
- Wait for deployment to complete
- Check logs for success messages

### Step 6: Test API
Test your API endpoint:
```bash
curl https://your-api-url.railway.app/api/health
```

Or check in your browser/dashboard.

## Quick Test Commands

Once your service is running, test these endpoints:

```bash
# Health check
curl https://your-api-url.railway.app/api/health

# Aggregator index (should return data if database is working)
curl https://your-api-url.railway.app/api/aggregator/index
```

## Still Having Issues?

1. **Check Railway Status**: https://status.railway.app
2. **Review Logs**: Look for specific error messages
3. **Verify Service Limits**: Check that your plan supports the resources you're using
4. **Contact Railway Support**: If environment variables keep resetting or services won't connect

## Prevention

To avoid issues in the future:

1. **Document your environment variables** in a secure location
2. **Use Railway's "Generate Domain"** feature for consistent URLs
3. **Set up monitoring** to alert you if the service goes down
4. **Regular backups** of your database

