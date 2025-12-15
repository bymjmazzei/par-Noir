# Railway Database Connection Fix

## Problem
The API server was crashing on startup with:
```
❌ Failed to initialize database schema: Error: Connection terminated due to connection timeout
```

## Root Causes
1. **Connection timeout too short**: Was set to 2 seconds, which is too short for Railway's network
2. **SSL detection**: Wasn't properly detecting Railway database URLs that require SSL
3. **No retry logic**: Failed immediately on first connection attempt

## Fixes Applied

### 1. Increased Connection Timeout
- Changed from `2000ms` (2 seconds) to `10000ms` (10 seconds)
- Gives Railway's network enough time to establish connections

### 2. Improved SSL Detection
Now automatically detects SSL requirement for:
- Railway URLs (`railway.app`, `railway.internal`)
- Supabase URLs
- Neon.tech URLs
- Render.com URLs
- Any URL with `sslmode=require`

### 3. Added Retry Logic
- Tests database connection before schema initialization
- Retries up to 3 times with 2-second delays
- Provides better error messages

## What to Check in Railway

### 1. Verify DATABASE_URL is Set
1. Go to Railway Dashboard → Your Project
2. Click on your **API service**
3. Go to **Variables** tab
4. Verify `DATABASE_URL` exists and is correct

### 2. Verify PostgreSQL Service is Connected
1. Check that PostgreSQL service exists in your Railway project
2. The `DATABASE_URL` should be automatically provided
3. If missing:
   - Go to PostgreSQL service → **Variables** tab
   - Copy the `DATABASE_URL` value
   - Add it to API service → **Variables** tab

### 3. Check PostgreSQL Service Status
1. Go to PostgreSQL service in Railway
2. Verify it shows **green status** (running)
3. If it's not running, start it

### 4. Redeploy API Service
After verifying the above:
1. Go to API service → **Deployments** tab
2. Click **Redeploy** (or it will auto-deploy if you've pushed changes)
3. Watch the logs for:
   ```
   ✅ Database connection test successful
   ✅ Database connection pool created
   ✅ Database schema initialized
   🚀 Identity Protocol API Server running on port 3001
   ```

## Expected Log Output

After the fix, you should see:
```
✅ Database connection pool created
✅ Database connection test successful
✅ Database schema initialized
✅ [Cache] Redis connected (if Redis is configured)
🚀 Identity Protocol API Server running on port 3001
```

## If Still Failing

If you still see connection errors:

1. **Check DATABASE_URL format**:
   - Should start with `postgresql://` or `postgres://`
   - Should include host, port, database name, username, password
   - Railway format: `postgresql://postgres:password@host:port/railway`

2. **Verify network connectivity**:
   - Check Railway status: https://status.railway.app
   - Ensure PostgreSQL service is in the same project/region

3. **Check service limits**:
   - Verify your Railway plan supports the database size
   - Check if you've hit any connection limits

4. **Try manual connection test**:
   - Use Railway's PostgreSQL service → **Connect** tab
   - Try connecting via Railway's provided connection string
   - If that fails, the issue is with the database service itself

## Next Steps

1. ✅ Code has been fixed and rebuilt
2. ⏳ Push changes to trigger Railway deployment (or manually redeploy)
3. ⏳ Verify logs show successful database connection
4. ⏳ Test API endpoints to confirm everything works

## Deployment

The changes have been built. To deploy:

```bash
# Commit and push the changes
git add api/src/server/utils/database.ts
git commit -m "Fix Railway database connection timeout and add retry logic"
git push
```

Railway will automatically deploy, or you can manually trigger a redeploy from the Railway dashboard.

