# Scalability Implementation Plan

**Status:** 🚧 In Progress  
**Branch:** `feature/scalability-improvements`  
**Last Updated:** 2024-12-19 (Phase 1-4 Complete)  
**Goal:** Scale to 10M+ users with pagination, caching, and optimized queries

---

## 📋 Overview

This document tracks the implementation of scalability improvements to handle millions of users efficiently. The implementation includes:

- **Database Optimization**: Indexes for faster queries
- **Backend Pagination**: Limit/offset pagination for API endpoints
- **Frontend Pagination**: Infinite scroll (designed for this, may not be fully implemented yet)
- **Caching Layer**: Redis caching for API responses
- **Performance Optimizations**: Virtual scrolling, lazy loading

**Note:** The UI is designed for infinite scroll - we're implementing pagination to support this properly at scale.

---

## 🎯 Success Metrics

After implementation, target metrics:
- ✅ API response time: < 200ms (with cache)
- ✅ Database query time: < 50ms (with indexes)
- ✅ Initial page load: < 1 second
- ✅ Memory usage: Constant (not growing with dataset)
- ✅ Cache hit rate: > 80%
- ✅ Can handle 10M+ files efficiently

---

## 📊 Current Status

### Phase 1: Database Optimization
- [x] Add composite indexes
- [x] Add GIN index for keywords
- [x] Add partial indexes for public files
- [x] Add GIN index for feedCategories
- [ ] Test query performance (run EXPLAIN ANALYZE)

### Phase 2: Backend Pagination
- [x] Update `getPublicMetadata()` method
- [x] Update `getNSFWMetadata()` method
- [x] Update `getIndexResponse()` method
- [x] Update `getNSFWIndexResponse()` method
- [x] Update API endpoint to accept limit/offset
- [x] Update NSFW API endpoint to accept limit/offset
- [ ] Test pagination endpoints (manual testing needed)

### Phase 3: Frontend Pagination
- [x] Update `CentralMetadataAggregator.fetchAggregatedIndex()`
- [x] Update `CentralMetadataAggregator.fetchNSFWIndex()`
- [x] Update `App.tsx` state management
- [x] Update `MetadataIndexService`
- [x] Add infinite scroll functionality (Intersection Observer)
- [x] Add pagination state (currentPage, hasMore, isLoadingMore)
- [x] Reset pagination on feed/filter changes
- [ ] Test pagination flow (manual testing needed)

### Phase 4: Caching Layer
- [x] Set up Redis connection (uses REDIS_URL env var)
- [x] Add Redis connection to API (initializeCache on startup)
- [x] Create CacheService utility
- [x] Add caching to `getIndexResponse` method
- [x] Implement cache invalidation in `submitMetadata()` and `removeMetadata()`
- [ ] Test cache hit/miss rates (monitoring needed)
- [ ] Create `CacheService` utility
- [ ] Add caching to `getIndexResponse()`
- [ ] Implement cache invalidation
- [ ] Test cache hits/misses

### Phase 5: Frontend Optimizations
- [ ] Implement virtual scrolling (optional)
- [ ] Add lazy loading for thumbnails
- [ ] Verify request deduplication

### Phase 6: Testing & Validation
- [ ] Load testing (1K, 10K, 100K files)
- [ ] Integration testing
- [ ] Performance monitoring setup

### Phase 7: Deployment
- [ ] Database migration (indexes)
- [ ] Deploy backend changes
- [ ] Deploy frontend changes
- [ ] Production testing

---

## 🔧 Implementation Details

### Phase 1: Database Optimization

**File:** `api/src/server/utils/database.ts`  
**Function:** `initializeDatabase()`

**Required Indexes:**

```sql
-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_metadata_public_type_date 
  ON aggregator_metadata((metadata->>'isPublic'), (metadata->>'fileType'), updated_at DESC)
  WHERE metadata->>'isPublic' = 'true';

-- Partial index for public files only (most common query)
CREATE INDEX IF NOT EXISTS idx_metadata_public_only 
  ON aggregator_metadata(updated_at DESC)
  WHERE metadata->>'isPublic' = 'true';

-- GIN index for JSONB array searches (keywords/tags)
CREATE INDEX IF NOT EXISTS idx_metadata_keywords_gin 
  ON aggregator_metadata USING GIN((metadata->'keywords'));

-- Index for feed category filtering
CREATE INDEX IF NOT EXISTS idx_metadata_feed_category
  ON aggregator_metadata USING GIN((metadata->'feedCategories'));
```

**Testing:**
```sql
-- Verify indexes are used
EXPLAIN ANALYZE 
SELECT * FROM aggregator_metadata 
WHERE metadata->>'isPublic' = 'true' 
ORDER BY updated_at DESC 
LIMIT 50;
```

**Status:** ⏳ Pending

---

### Phase 2: Backend Pagination

#### 2.1 Update `getPublicMetadata` Method

**File:** `api/src/server/modules/aggregatorMetadataServiceDB.ts`  
**Method:** `getPublicMetadata()`

**Changes Required:**

1. Update method signature:
```typescript
async getPublicMetadata(filters?: {
  tags?: string[];
  fileType?: string;
  authorDid?: string;
  indexerId?: string;
  limit?: number;      // NEW
  offset?: number;     // NEW
}): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }>
```

2. Add pagination logic:
```typescript
const limit = filters?.limit || 50;
const offset = filters?.offset || 0;

// ... existing query building ...

// Add pagination to SQL
query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
params.push(limit + 1); // Fetch one extra to check hasMore
params.push(offset);
paramIndex += 2;

// Get total count (for pagination info)
const countQuery = `
  SELECT COUNT(*) as count
  FROM aggregator_metadata am
  WHERE am.metadata->>'isPublic' = 'true'
  AND (
    am.metadata->>'isNSFW' IS NULL 
    OR am.metadata->>'isNSFW' = 'false'
  )
  ${filters?.fileType ? `AND am.metadata->>'fileType' = $1` : ''}
`;
const countParams = filters?.fileType ? [filters.fileType] : [];
const countResult = await db.query(countQuery, countParams);
const total = parseInt(countResult.rows[0].count, 10);

// Execute main query
const result = await db.query(query, params);
const hasMore = result.rows.length > limit;
const files = result.rows.slice(0, limit).map(row => {
  // ... existing mapping logic ...
});

return { files, total, hasMore };
```

**Status:** ⏳ Pending

#### 2.2 Update `getNSFWMetadata` Method

**File:** Same file  
**Method:** `getNSFWMetadata()`

Apply same pagination pattern as `getPublicMetadata()`.

**Status:** ⏳ Pending

#### 2.3 Update `getIndexResponse` Method

**File:** Same file  
**Method:** `getIndexResponse()`

**Changes:**

```typescript
async getIndexResponse(filters?: {
  tags?: string[];
  fileType?: string;
  authorDid?: string;
  indexerId?: string;
  limit?: number;      // NEW
  offset?: number;     // NEW
}): Promise<CentralIndexResponse & { total: number; hasMore: boolean }> {
  let result = await this.getPublicMetadata(filters);
  
  const stats = await this.getStats();
  
  return {
    files: result.files,
    updatedAt: stats.lastUpdated,
    totalFiles: result.total,  // Total matching files
    hasMore: result.hasMore    // Whether more pages exist
  };
}
```

**Status:** ⏳ Pending

#### 2.4 Update API Endpoint

**File:** `api/src/server.ts`  
**Location:** Around line 1236 (`GET /api/aggregator/metadata-index`)

**Changes:**

```typescript
this.app.get('/api/aggregator/metadata-index', async (req, res) => {
  try {
    const { AggregatorMetadataServiceDB } = await import('./server/modules/aggregatorMetadataServiceDB');
    const service = AggregatorMetadataServiceDB.getInstance();

    // Parse query parameters
    const tags = req.query.tags ? (req.query.tags as string).split(',').map(t => t.trim()) : undefined;
    const fileType = req.query.fileType as string | undefined;
    const authorDid = req.query.authorDid as string | undefined;
    const indexerId = req.query.indexerId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;  // NEW
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0; // NEW
    const debug = req.query.debug === 'true';

    const response = await service.getIndexResponse({
      tags,
      fileType,
      authorDid,
      indexerId,
      limit,    // NEW
      offset    // NEW
    });

    // ... rest of handler ...
  }
});
```

**Status:** ⏳ Pending

---

### Phase 3: Frontend Pagination

#### 3.1 Update `CentralMetadataAggregator`

**File:** `apps/aggregator-browser/src/services/storage/CentralMetadataAggregator.ts`  
**Method:** `fetchAggregatedIndex()`

**Changes:**

```typescript
static async fetchAggregatedIndex(
  filters?: { 
    tags?: string[]; 
    fileType?: string; 
    authorDid?: string;
    limit?: number;      // NEW
    offset?: number;     // NEW
  },
  forceRefresh: boolean = false
): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
  // Create a unique key for this request to deduplicate
  const requestKey = JSON.stringify({ ...filters, limit, offset });
  
  // ... existing deduplication logic ...
  
  // Create the request promise
  const requestPromise = this._fetchWithRetry(filters, limit, offset);
  
  // ... rest of method ...
}

private static async _fetchWithRetry(
  filters?: { tags?: string[]; fileType?: string; authorDid?: string },
  limit?: number,      // NEW
  offset?: number,     // NEW
  retryCount: number = 0
): Promise<{ files: CentralIndexEntry[]; total: number; hasMore: boolean }> {
  // ... existing retry logic ...
  
  const params = new URLSearchParams();
  if (filters?.tags) params.append('tags', filters.tags.join(','));
  if (filters?.fileType) params.append('fileType', filters.fileType);
  if (filters?.authorDid) params.append('authorDid', filters.authorDid);
  if (limit !== undefined) params.append('limit', limit.toString());      // NEW
  if (offset !== undefined) params.append('offset', offset.toString());    // NEW

  const response = await fetch(
    `${this.API_ENDPOINT}${this.CENTRAL_INDEX_PATH}?${params.toString()}`,
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (response.ok) {
    const data: CentralIndexResponse & { total?: number; hasMore?: boolean } = await response.json();
    
    return {
      files: data.files || [],
      total: data.totalFiles || data.total || 0,
      hasMore: data.hasMore || false
    };
  }
  
  // ... error handling ...
}
```

**Status:** ⏳ Pending

#### 3.2 Update `App.tsx` State Management

**File:** `apps/aggregator-browser/src/App.tsx`

**Note:** The UI is designed for infinite scroll. We'll implement pagination to support this properly.

**Add State:**

```typescript
const [currentPage, setCurrentPage] = useState(0);
const [hasMore, setHasMore] = useState(true);
const [isLoadingMore, setIsLoadingMore] = useState(false);
const PAGE_SIZE = 50;
```

**Update `discoverFiles` Function:**

```typescript
const discoverFiles = async (page: number = 0, append: boolean = false) => {
  if (isDiscoveringRef.current && !append) return;
  isDiscoveringRef.current = true;
  
  try {
    // ... existing filter building ...
    
    const publicFiles = await metadataIndexService.discoverFiles(
      finalFilters,
      forceRefresh,
      PAGE_SIZE,        // limit
      page * PAGE_SIZE  // offset
    );
    
    setIndexedFiles(prev => {
      if (page === 0 || !append) {
        return publicFiles.files;  // Replace on first page
      } else {
        // Append on subsequent pages (for infinite scroll)
        const existingIds = new Set(prev.map(f => f.metadata.fileId));
        const newFiles = publicFiles.files.filter(f => !existingIds.has(f.metadata.fileId));
        return [...prev, ...newFiles];
      }
    });
    
    setHasMore(publicFiles.hasMore);
    setCurrentPage(page);
  } finally {
    isDiscoveringRef.current = false;
  }
};
```

**Add Infinite Scroll Handler:**

```typescript
// Use Intersection Observer to detect when user scrolls near bottom
useEffect(() => {
  if (viewMode !== 'feed' || !hasMore || isLoadingMore) return;
  
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
        setIsLoadingMore(true);
        discoverFiles(currentPage + 1, true).finally(() => {
          setIsLoadingMore(false);
        });
      }
    },
    { rootMargin: '200px' } // Start loading 200px before reaching bottom
  );
  
  // Observe a sentinel element at the bottom of the feed
  const sentinel = document.getElementById('feed-sentinel');
  if (sentinel) observer.observe(sentinel);
  
  return () => observer.disconnect();
}, [hasMore, isLoadingMore, currentPage, viewMode]);
```

**Status:** ⏳ Pending

#### 3.3 Update `MetadataIndexService`

**File:** Find where `discoverFiles` is implemented

Ensure it passes pagination parameters through to `CentralMetadataAggregator.fetchAggregatedIndex()`.

**Status:** ⏳ Pending

---

### Phase 4: Caching Layer

#### 4.1 Set Up Redis

**Infrastructure Setup:**

1. **Railway** (Recommended):
   - Add Redis service to Railway project
   - Get Redis URL from Railway dashboard
   - Set `REDIS_URL` environment variable

2. **AWS ElastiCache** (Alternative):
   - Create ElastiCache Redis cluster
   - Configure security groups
   - Set `REDIS_URL` environment variable

3. **Local Development**:
   - Install Redis: `brew install redis` (macOS) or `apt-get install redis` (Linux)
   - Start Redis: `redis-server`
   - Use `REDIS_URL=redis://localhost:6379`

**Status:** ⏳ Pending

#### 4.2 Create Cache Service

**File:** `api/src/server/utils/cache.ts` (new file)

**Create:**

```typescript
import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });
    
    redis.on('error', (err) => {
      console.error('❌ Redis connection error:', err);
    });
    
    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });
  }
  return redis;
}

export class CacheService {
  /**
   * Get value from cache
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const redis = getRedis();
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error(`❌ Cache get error for key ${key}:`, error);
      return null; // Fail gracefully
    }
  }
  
  /**
   * Set value in cache with TTL
   */
  static async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const redis = getRedis();
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error(`❌ Cache set error for key ${key}:`, error);
      // Fail gracefully - don't throw
    }
  }
  
  /**
   * Delete key from cache
   */
  static async delete(key: string): Promise<void> {
    try {
      const redis = getRedis();
      await redis.del(key);
    } catch (error) {
      console.error(`❌ Cache delete error for key ${key}:`, error);
    }
  }
  
  /**
   * Invalidate keys matching pattern
   */
  static async invalidate(pattern: string): Promise<void> {
    try {
      const redis = getRedis();
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`🗑️ Invalidated ${keys.length} cache keys matching ${pattern}`);
      }
    } catch (error) {
      console.error(`❌ Cache invalidate error for pattern ${pattern}:`, error);
    }
  }
  
  /**
   * Close Redis connection
   */
  static async close(): Promise<void> {
    if (redis) {
      await redis.quit();
      redis = null;
    }
  }
}
```

**Install Dependency:**

```bash
cd api
npm install ioredis
npm install --save-dev @types/ioredis
```

**Status:** ⏳ Pending

#### 4.3 Add Caching to `getIndexResponse`

**File:** `api/src/server/modules/aggregatorMetadataServiceDB.ts`

**Changes:**

```typescript
import { CacheService } from '../utils/cache';

async getIndexResponse(filters?: {
  tags?: string[];
  fileType?: string;
  authorDid?: string;
  indexerId?: string;
  limit?: number;
  offset?: number;
}): Promise<CentralIndexResponse & { total: number; hasMore: boolean }> {
  // Create cache key from filters
  const cacheKey = `index:${JSON.stringify(filters || {})}`;
  
  // Check cache first
  const cached = await CacheService.get<CentralIndexResponse & { total: number; hasMore: boolean }>(cacheKey);
  if (cached) {
    console.log(`✅ [getIndexResponse] Cache hit for key: ${cacheKey.substring(0, 50)}...`);
    return cached;
  }
  
  console.log(`🔍 [getIndexResponse] Cache miss, querying database...`);
  
  // Cleanup orphaned files (existing logic)
  try {
    await this.cleanupOrphanedFilesFromIndex();
  } catch (error) {
    console.error('❌ [getIndexResponse] Cleanup failed (non-critical, continuing):', error);
  }
  
  // Fetch from database
  let result = await this.getPublicMetadata(filters);
  const stats = await this.getStats();
  
  const response: CentralIndexResponse & { total: number; hasMore: boolean } = {
    files: result.files,
    updatedAt: stats.lastUpdated,
    totalFiles: result.total,
    hasMore: result.hasMore
  };
  
  // Cache result (1 hour TTL)
  await CacheService.set(cacheKey, response, 3600);
  
  console.log(`📤 [getIndexResponse] Returning ${result.files.length} file(s) after cleanup`);
  
  return response;
}
```

**Status:** ⏳ Pending

#### 4.4 Cache Invalidation

**File:** `api/src/server/modules/aggregatorMetadataServiceDB.ts`

**Add to `submitMetadata()`:**

```typescript
async submitMetadata(metadata: PublicMetadata, pnIdentifier?: string): Promise<void> {
  // ... existing submission logic ...
  
  // Invalidate cache after metadata update
  await CacheService.invalidate('index:*');
  console.log('🗑️ Invalidated index cache after metadata submission');
}
```

**Add to `removeMetadata()`:**

```typescript
async removeMetadata(fileIdOrBackendFileId: string): Promise<boolean> {
  // ... existing removal logic ...
  
  if (removed) {
    // Invalidate cache after metadata removal
    await CacheService.invalidate('index:*');
    console.log('🗑️ Invalidated index cache after metadata removal');
  }
  
  return removed;
}
```

**Status:** ⏳ Pending

---

### Phase 5: Frontend Optimizations

#### 5.1 Virtual Scrolling (Optional)

**File:** `apps/aggregator-browser/src/components/FullScreenFeed.tsx` or grid component

**Install:**

```bash
cd apps/aggregator-browser
npm install react-window react-window-infinite-loader
```

**Implementation:** (Can be done later, not critical for initial scalability)

**Status:** ⏸️ Optional - Defer

#### 5.2 Lazy Loading Thumbnails

**File:** Where thumbnails are rendered

**Implementation:**

```typescript
import { useEffect, useRef, useState } from 'react';

function LazyThumbnail({ src, alt }: { src: string; alt: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' } // Start loading 50px before visible
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef}>
      {isVisible ? (
        <img src={src} alt={alt} />
      ) : (
        <div className="thumbnail-placeholder">Loading...</div>
      )}
    </div>
  );
}
```

**Status:** ⏸️ Optional - Defer

---

### Phase 6: Testing & Validation

#### 6.1 Load Testing

**Test Scenarios:**

1. **1,000 files:**
   - Verify pagination works
   - Check response times
   - Verify cache hits

2. **10,000 files:**
   - Test multiple pages
   - Verify memory usage stays constant
   - Check database query performance

3. **100,000 files:** (if possible)
   - Stress test pagination
   - Verify cache effectiveness
   - Monitor server resources

**Tools:**
- Use `ab` (Apache Bench) or `wrk` for load testing
- Monitor with APM tools

**Status:** ⏳ Pending

#### 6.2 Integration Testing

**Test Cases:**

- [ ] Pagination: First page loads correctly
- [ ] Pagination: "Load More" fetches next page
- [ ] Pagination: Files append correctly (no duplicates)
- [ ] Pagination: `hasMore` flag works correctly
- [ ] Caching: Cache hit on repeated requests
- [ ] Caching: Cache miss after TTL expires
- [ ] Caching: Cache invalidation works
- [ ] Filters: Pagination works with filters
- [ ] Filters: Cache keys include filters

**Status:** ⏳ Pending

#### 6.3 Performance Monitoring

**Metrics to Track:**

- API response time (p50, p95, p99)
- Database query time
- Cache hit rate
- Memory usage
- Request rate

**Status:** ⏳ Pending

---

### Phase 7: Deployment

#### 7.1 Database Migration

**Steps:**

1. Connect to production database
2. Run index creation SQL:
```sql
-- Run these in order
CREATE INDEX IF NOT EXISTS idx_metadata_public_type_date 
  ON aggregator_metadata((metadata->>'isPublic'), (metadata->>'fileType'), updated_at DESC)
  WHERE metadata->>'isPublic' = 'true';

CREATE INDEX IF NOT EXISTS idx_metadata_public_only 
  ON aggregator_metadata(updated_at DESC)
  WHERE metadata->>'isPublic' = 'true';

CREATE INDEX IF NOT EXISTS idx_metadata_keywords_gin 
  ON aggregator_metadata USING GIN((metadata->'keywords'));

CREATE INDEX IF NOT EXISTS idx_metadata_feed_category
  ON aggregator_metadata USING GIN((metadata->'feedCategories'));
```

3. Verify indexes:
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'aggregator_metadata';
```

**Status:** ⏳ Pending

#### 7.2 Deploy Backend

**Steps:**

1. Set up Redis instance (Railway/AWS)
2. Add `REDIS_URL` to environment variables
3. Deploy API changes to Railway/server
4. Verify Redis connection in logs
5. Test API endpoints with pagination

**Status:** ⏳ Pending

#### 7.3 Deploy Frontend

**Steps:**

1. Build frontend: `npm run build`
2. Deploy to Firebase: `firebase deploy --only hosting`
3. Test pagination in production
4. Monitor performance metrics

**Status:** ⏳ Pending

---

## 🔍 Testing Checklist

### Backend Testing

- [ ] Test API endpoint with `?limit=10&offset=0`
- [ ] Test API endpoint with `?limit=50&offset=100`
- [ ] Verify `totalFiles` in response
- [ ] Verify `hasMore` flag is correct
- [ ] Test cache hit (make same request twice)
- [ ] Test cache miss (wait for TTL or invalidate)
- [ ] Test cache invalidation (update metadata, verify cache cleared)

### Frontend Testing

- [ ] Initial page load shows first 50 files
- [ ] "Load More" button appears when `hasMore=true`
- [ ] Clicking "Load More" fetches next page
- [ ] Files append correctly (no duplicates)
- [ ] "Load More" button disappears when `hasMore=false`
- [ ] Pagination works with filters (tags, fileType, etc.)
- [ ] Switching feeds resets pagination

### Performance Testing

- [ ] API response time < 200ms (cached)
- [ ] API response time < 500ms (uncached)
- [ ] Database query time < 50ms
- [ ] Memory usage stays constant
- [ ] Cache hit rate > 80%

---

## 📝 Notes & Gotchas

### Important Considerations

1. **Cache Key Generation:**
   - Must include all filter parameters
   - Must be deterministic (same filters = same key)
   - Consider using a hash function for long keys

2. **Pagination Consistency:**
   - Results may change between pages if data is updated
   - Consider using cursor-based pagination for better consistency (future improvement)

3. **Database Connection Pool:**
   - Current pool size is 20
   - May need to increase with more concurrent requests
   - Monitor connection pool usage

4. **Redis Failover:**
   - Cache failures should not break the app
   - Always fail gracefully (return null, continue without cache)

5. **Cache TTL:**
   - 1 hour (3600 seconds) is a good starting point
   - Adjust based on how often data changes
   - Consider shorter TTL for frequently updated data

### Known Issues

- None yet (will update as issues are discovered)

---

## 🚀 Quick Start Guide

For new developers joining this work:

1. **Check Current Status:**
   - Review this document's "Current Status" section
   - Check git commit history for recent changes
   - Review any open PRs

2. **Set Up Development Environment:**
   ```bash
   # Install dependencies
   cd api && npm install
   cd ../apps/aggregator-browser && npm install
   
   # Set up Redis (local)
   redis-server
   
   # Set environment variables
   export REDIS_URL=redis://localhost:6379
   export DATABASE_URL=your_database_url
   ```

3. **Run Tests:**
   ```bash
   # Backend tests
   cd api && npm test
   
   # Frontend tests
   cd apps/aggregator-browser && npm test
   ```

4. **Continue Implementation:**
   - Pick up from the first unchecked item in "Current Status"
   - Update this document as you make progress
   - Commit frequently with descriptive messages

---

## 📚 Reference Links

- [PostgreSQL Index Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Redis Documentation](https://redis.io/docs/)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [React Window (Virtual Scrolling)](https://github.com/bvaughn/react-window)

---

## 🔄 Update Log

- **2024-12-19**: Initial document created, implementation plan outlined
- **2024-12-19**: Phase 1 Complete - Database indexes added
- **2024-12-19**: Phase 2 Complete - Backend pagination implemented
- **2024-12-19**: Phase 3 Complete - Frontend pagination with infinite scroll implemented
- **2024-12-19**: Phase 4 Complete - Redis caching layer implemented

---

## ✅ Completion Checklist

When all phases are complete:

- [ ] All database indexes created and verified
- [ ] Backend pagination implemented and tested
- [ ] Frontend pagination implemented and tested
- [ ] Redis caching implemented and tested
- [ ] Cache invalidation working correctly
- [ ] Load testing completed
- [ ] Performance metrics meet targets
- [ ] Deployed to production
- [ ] Production monitoring set up
- [ ] Documentation updated

---

**Next Steps:** Start with Phase 1 (Database Optimization) when ready to begin implementation.

