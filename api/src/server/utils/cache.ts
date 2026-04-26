/**
 * Cache Service for API Response Caching
 * Uses Redis for distributed caching across multiple server instances
 * 
 * SCALABILITY: Enables caching of expensive database queries
 */

import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
export async function initializeCache(): Promise<void> {
  if (redisClient && isConnected) {
    return;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 30000, // 30 seconds for Railway network latency
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('❌ [Cache] Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection limit exceeded');
          }
          return Math.min(retries * 100, 3000); // Exponential backoff, max 3s
        }
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ [Cache] Redis error:', err);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ [Cache] Redis connected');
      isConnected = true;
    });

    redisClient.on('disconnect', () => {
      console.warn('⚠️ [Cache] Redis disconnected');
      isConnected = false;
    });

    await redisClient.connect();
    console.log('✅ [Cache] Redis initialized');
  } catch (error) {
    console.error('❌ [Cache] Failed to initialize Redis:', error);
    console.warn('⚠️ [Cache] Continuing without cache - API will work but may be slower');
    redisClient = null;
    isConnected = false;
  }
}

/**
 * Get Redis client (returns null if not connected)
 */
export function getCacheClient(): RedisClientType | null {
  return isConnected ? redisClient : null;
}

/**
 * Generate cache key from filters and pagination params
 */
function generateCacheKey(
  prefix: string,
  filters?: {
    tags?: string[];
    fileType?: string;
    contentClass?: 'media' | 'thought' | 'collection';
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  }
): string {
  const keyParts = [prefix];
  
  if (filters) {
    if (filters.tags && filters.tags.length > 0) {
      keyParts.push(`tags:${filters.tags.sort().join(',')}`);
    }
    if (filters.fileType) {
      keyParts.push(`type:${filters.fileType}`);
    }
    if (filters.contentClass) {
      keyParts.push(`class:${filters.contentClass}`);
    }
    if (filters.authorDid) {
      keyParts.push(`author:${filters.authorDid}`);
    }
    if (filters.indexerId) {
      keyParts.push(`indexer:${filters.indexerId}`);
    }
    if (filters.limit !== undefined) {
      keyParts.push(`limit:${filters.limit}`);
    }
    if (filters.offset !== undefined) {
      keyParts.push(`offset:${filters.offset}`);
    }
  }
  
  return keyParts.join(':');
}

/**
 * Get cached value
 */
export async function getCache<T>(key: string): Promise<T | null> {
  if (!isConnected || !redisClient) {
    return null;
  }

  try {
    const value = await redisClient.get(key);
    if (value) {
      return JSON.parse(value) as T;
    }
    return null;
  } catch (error) {
    console.error(`❌ [Cache] Failed to get cache key "${key}":`, error);
    return null;
  }
}

/**
 * Set cached value with TTL (time to live in seconds)
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300 // Default 5 minutes
): Promise<void> {
  if (!isConnected || !redisClient) {
    return;
  }

  try {
    await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`❌ [Cache] Failed to set cache key "${key}":`, error);
  }
}

/**
 * Delete cached value
 */
export async function deleteCache(key: string): Promise<void> {
  if (!isConnected || !redisClient) {
    return;
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    console.error(`❌ [Cache] Failed to delete cache key "${key}":`, error);
  }
}

/**
 * Delete all cache keys matching a pattern
 */
export async function deleteCachePattern(pattern: string): Promise<void> {
  if (!isConnected || !redisClient) {
    return;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
      console.log(`🗑️ [Cache] Deleted ${keys.length} cache keys matching "${pattern}"`);
    }
  } catch (error) {
    console.error(`❌ [Cache] Failed to delete cache pattern "${pattern}":`, error);
  }
}

/**
 * Cache metadata index response
 */
export async function getCachedIndex(
  filters?: {
    tags?: string[];
    fileType?: string;
    contentClass?: 'media' | 'thought' | 'collection';
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any | null> {
  const key = generateCacheKey('metadata:index:pubrank-v1', filters);
  return getCache(key);
}

/**
 * Set cached metadata index response
 */
export async function setCachedIndex(
  filters: {
    tags?: string[];
    fileType?: string;
    contentClass?: 'media' | 'thought' | 'collection';
    authorDid?: string;
    indexerId?: string;
    limit?: number;
    offset?: number;
  } | undefined,
  value: any,
  ttlSeconds: number = 300 // 5 minutes default
): Promise<void> {
  const key = generateCacheKey('metadata:index:pubrank-v1', filters);
  await setCache(key, value, ttlSeconds);
}

/**
 * Invalidate all metadata index cache (call when files are added/removed)
 */
export async function invalidateIndexCache(): Promise<void> {
  await deleteCachePattern('metadata:index:*');
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeCache(): Promise<void> {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      console.log('✅ [Cache] Redis connection closed');
    } catch (error) {
      console.error('❌ [Cache] Error closing Redis connection:', error);
    }
    redisClient = null;
    isConnected = false;
  }
}

