# Railway Environment Variable Setup

## Set UV_THREADPOOL_SIZE for Faster Message Decryption

To enable parallel PBKDF2 operations (faster message decryption), you need to set the `UV_THREADPOOL_SIZE` environment variable in Railway.

### Steps:

1. **Go to your Railway project dashboard**
   - Navigate to https://railway.app
   - Select your par-Noir API project

2. **Open your service**
   - Click on the API service (the one running the Node.js server)

3. **Go to Variables tab**
   - Click on the "Variables" tab in the service settings

4. **Add new variable**
   - Click "New Variable" or "+" button
   - **Variable name:** `UV_THREADPOOL_SIZE`
   - **Value:** `16`
   - Click "Add" or "Save"

5. **Redeploy**
   - Railway will automatically redeploy when you add/change environment variables
   - Or manually trigger a redeploy from the "Deployments" tab

### Why this helps:

- Node.js default thread pool size is **4**
- This limits parallel crypto operations (PBKDF2) to 4 at a time
- With 8 messages, 4 decrypt in parallel, then 4 more queue = **slow**
- Setting to **16** allows all 8 messages to decrypt in parallel = **much faster**

### Note:

The code already sets `UV_THREADPOOL_SIZE=16` as a fallback in `api/src/server.ts` (before any crypto imports), but setting it as a Railway environment variable is more reliable because:
- Environment variables are set before Node.js starts
- Code-based setting may not work in all deployment scenarios
- Railway environment variables are the recommended approach

### Verification:

After redeploy, check the logs. You should see faster decryption times (under 1 second instead of 3-4 seconds for 8 messages).
