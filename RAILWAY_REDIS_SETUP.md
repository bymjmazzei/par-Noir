# Setting Up Redis in Railway

## Step-by-Step Guide

### Step 1: Add Redis Service

1. **Go to Railway Dashboard**
   - Open https://railway.app
   - Log in to your account
   - Select your project

2. **Add Redis Service**
   - Click **"+ New"** button (top right)
   - Select **"Database"** → **"Add Redis"**
   - Railway will create a new Redis instance

3. **Wait for Redis to Provision**
   - Railway will automatically provision Redis
   - This usually takes 1-2 minutes
   - You'll see a green checkmark when ready

### Step 2: Get Redis Connection URL

1. **Click on the Redis Service** you just created
2. **Go to the "Variables" tab**
3. **Look for `REDIS_URL`** - this is your connection string
   - It will look like: `redis://default:password@redis.railway.internal:6379`
   - Or: `redis://default:password@containers-us-west-xxx.railway.app:6379`

4. **Copy the `REDIS_URL` value**

### Step 3: Add Redis URL to API Service

1. **Go back to your API service** (the one that runs your Node.js app)
2. **Click on the API service**
3. **Go to the "Variables" tab**
4. **Click "+ New Variable"**
5. **Add:**
   - **Key:** `REDIS_URL`
   - **Value:** (paste the Redis URL you copied)
6. **Click "Add"**

### Step 4: Redeploy API Service

1. **Go to your API service**
2. **Click "Deploy"** or **"Redeploy"** (if auto-deploy is off)
3. **Wait for deployment to complete**

### Step 5: Verify Redis is Working

Once deployed, check your API logs:

1. **Go to API service → "Deployments" tab**
2. **Click on the latest deployment**
3. **Check logs for:**
   ```
   ✅ [Cache] Redis connected
   ✅ [Cache] Redis initialized
   ```

If you see these messages, Redis is working!

---

## Troubleshooting

### Redis URL Not Found

If you don't see `REDIS_URL` in Variables:
- Check the "Connect" tab instead
- Railway might show connection details there
- Look for connection string format: `redis://...`

### Connection Failed

If you see errors like:
```
❌ [Cache] Failed to initialize Redis
```

**Check:**
1. Redis URL is correct (copy-paste, no typos)
2. Redis service is running (green status)
3. API service has the `REDIS_URL` variable set
4. Redeploy API service after adding the variable

### Using Internal vs External URL

Railway provides two types of URLs:
- **Internal** (`*.railway.internal`) - Works only within Railway network
- **External** (`*.railway.app`) - Works from anywhere

**For API service → Redis:**
- Use **internal URL** (faster, more secure)
- Format: `redis://default:password@redis.railway.internal:6379`

---

## What Happens Next

Once Redis is set up:

1. **Cache will activate automatically**
   - API responses will be cached for 5 minutes
   - Subsequent requests will be faster

2. **You'll see cache logs:**
   ```
   ✅ [getIndexResponse] Cache hit for filters: ...
   💾 [getIndexResponse] Cached response for filters: ...
   ```

3. **Performance improvement:**
   - Cached requests: <200ms
   - Uncached requests: <500ms

---

## Quick Checklist

- [ ] Redis service added to Railway project
- [ ] Redis URL copied from Variables tab
- [ ] `REDIS_URL` added to API service environment variables
- [ ] API service redeployed
- [ ] Logs show "✅ [Cache] Redis connected"
- [ ] Test API endpoint - second request should be faster

---

## Need Help?

If you get stuck:
1. Check Railway logs for specific error messages
2. Verify Redis service is running (green status)
3. Make sure `REDIS_URL` variable is set correctly
4. Try redeploying the API service

