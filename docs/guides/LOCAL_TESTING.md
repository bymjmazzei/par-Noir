# Local Testing Guide

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or remote)
- Redis (optional but recommended for caching)

---

## Step 1: Set Up Environment Variables

Create a `.env` file in the `api` directory (or set environment variables):

```bash
cd api

# Required
DATABASE_URL=postgresql://user:password@localhost:5432/database_name

# Optional (for caching)
REDIS_URL=redis://localhost:6379

# Optional (for development)
PORT=3001
NODE_ENV=development
```

**Note:** If you don't have Redis, the system will work without it (caching just won't be active).

---

## Step 2: Install Dependencies

```bash
# Install API dependencies
cd api
npm install

# Install frontend dependencies (if testing frontend)
cd ../apps/aggregator-browser
npm install
```

---

## Step 3: Start Redis (Optional)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Verify Redis is running:**
```bash
redis-cli ping
# Should return: PONG
```

---

## Step 4: Start the API Server

```bash
cd api
npm run dev
```

**Expected output:**
```
✅ [Cache] Redis connected (if Redis is running)
✅ Database initialized
🚀 Identity Protocol API Server running on port 3001
```

**If Redis is not available:**
```
⚠️ [Cache] Failed to initialize Redis: ...
⚠️ [Cache] Continuing without cache - API will work but may be slower
✅ Database initialized
🚀 Identity Protocol API Server running on port 3001
```

---

## Step 5: Test Backend Pagination

### Option A: Use the Test Script (Recommended)

```bash
# In a new terminal (keep API server running)
cd api
npm run test:pagination
```

**Expected output:**
```
🧪 Testing Pagination Implementation

API Endpoint: http://localhost:3001/api/aggregator/metadata-index

Test 1: Basic pagination (limit=10, offset=0)
✅ Response received in XXXms
   Files returned: 10
   Total files: 150
   Has more: true
✅ Test 1 passed

Test 2: Second page (limit=10, offset=10)
✅ Response received in XXXms
   Files returned: 10
✅ Test 2 passed

Test 3: Cache performance (requesting same page twice)
   First request: XXXms
   Second request: XXXms
✅ Cache appears to be working (second request faster)

🎉 All pagination tests passed!
```

### Option B: Manual Testing with curl

```bash
# Test basic pagination
curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0"

# Test second page
curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=10"

# Test with filters
curl "http://localhost:3001/api/aggregator/metadata-index?fileType=image&limit=10&offset=0"
```

**Expected response format:**
```json
{
  "files": [...],
  "totalFiles": 150,
  "total": 150,
  "hasMore": true,
  "updatedAt": "2024-12-19T..."
}
```

---

## Step 6: Test Frontend Infinite Scroll

### Start the Frontend

```bash
cd apps/aggregator-browser
npm start
```

This will open `http://localhost:3000` in your browser.

### Test Infinite Scroll

1. **Navigate to the feed view** (should be default)
2. **Scroll down** - you should see:
   - Initial load of ~50 files
   - "Loading more..." indicator when scrolling near bottom
   - New files automatically appending
   - No duplicates

### Check Browser Console

Open browser DevTools (F12) and check the Console tab. You should see:

```
✅ Discovered 50 public files (page 0, hasMore: true)
📜 [Infinite Scroll] Loading next page...
✅ Discovered 50 public files (page 1, hasMore: true)
```

### Verify Pagination State

In browser console, run:
```javascript
// Check if pagination is working
// (This is just for debugging - the UI should work automatically)
```

---

## Step 7: Verify Cache is Working

### Check API Logs

Look at the terminal where your API server is running. You should see:

**First request (cache miss):**
```
🔍 [getIndexResponse] Starting cleanup before returning files...
📤 [getIndexResponse] Returning 50 file(s) after cleanup
💾 [getIndexResponse] Cached response for filters: ...
```

**Second request (cache hit):**
```
✅ [getIndexResponse] Cache hit for filters: ...
```

### Test Cache Performance

```bash
# First request (uncached)
time curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0"

# Wait a moment, then second request (should be cached)
time curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0"
```

The second request should be **significantly faster** (often <50ms vs >200ms).

---

## Step 8: Test Edge Cases

### Test with Filters

```bash
# Test pagination with fileType filter
curl "http://localhost:3001/api/aggregator/metadata-index?fileType=image&limit=10&offset=0"

# Test pagination with tags filter
curl "http://localhost:3001/api/aggregator/metadata-index?tags=art,photography&limit=10&offset=0"
```

### Test Different Page Sizes

```bash
# Small page
curl "http://localhost:3001/api/aggregator/metadata-index?limit=5&offset=0"

# Large page
curl "http://localhost:3001/api/aggregator/metadata-index?limit=100&offset=0"
```

### Test Cache Invalidation

1. Submit new metadata (via API or UI)
2. Check logs - should see:
   ```
   🗑️ [submitMetadata] Invalidated index cache after metadata update
   ```
3. Next request should be uncached (fresh data)

---

## Troubleshooting

### API Server Won't Start

**Error: Database connection failed**
```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"
```

**Error: Redis connection failed**
- This is OK - system works without Redis
- Check logs for: `⚠️ [Cache] Continuing without cache`

### Pagination Test Fails

**Error: "No fetch implementation found"**
```bash
# Check Node.js version (needs 18+)
node --version

# Should be v18.0.0 or higher
```

**Error: "HTTP 500"**
- Check API server logs for errors
- Verify database has data (run a simple query)
- Check database indexes exist

### Frontend Infinite Scroll Not Working

**No files loading:**
- Check browser console for errors
- Verify API endpoint is correct: `http://localhost:3001`
- Check network tab for failed requests

**Files not appending on scroll:**
- Check browser console for pagination logs
- Verify sentinel element exists: `document.getElementById('feed-infinite-scroll-sentinel')`
- Check `hasMore` state: should be `true` if more files exist

**All files load at once:**
- Check if pagination params are being sent (Network tab)
- Verify backend is returning `hasMore: false` when appropriate
- Check if you're on the correct branch: `git branch`

---

## Success Criteria

You'll know everything is working when:

✅ **Backend:**
- API returns paginated responses with `hasMore` field
- Cache hits are faster than cache misses
- Different pages return different files
- Filters work with pagination

✅ **Frontend:**
- Initial load shows ~50 files
- Scrolling down loads more files automatically
- No duplicates appear
- Loading indicator shows when fetching

✅ **Performance:**
- Cached requests: <200ms
- Uncached requests: <500ms
- Memory usage stays constant (doesn't grow infinitely)

---

## Quick Test Commands

```bash
# Test pagination endpoint
curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0" | jq '.hasMore'

# Test cache (should see faster second request)
time curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0" > /dev/null
time curl "http://localhost:3001/api/aggregator/metadata-index?limit=10&offset=0" > /dev/null

# Check Redis is working
redis-cli ping

# Check database indexes exist
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'aggregator_metadata' AND indexname LIKE 'idx_metadata%';"
```

---

## Next Steps

Once local testing passes:
1. ✅ Deploy to staging/production
2. ✅ Monitor performance metrics
3. ✅ Set up production Redis
4. ✅ Verify production infinite scroll

See `NEXT_STEPS.md` for deployment instructions.

