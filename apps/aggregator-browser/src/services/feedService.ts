/**
 * Feed Service (Frontend)
 * Connects to backend feed APIs - subscriptions stored on user's cloud storage
 */

import { Feed, FeedCategory } from '../types/aggregator';
import { PNOAuthService } from './pnOAuthService';

import { API_ENDPOINT } from '../config/api';

export interface CreateFeedRequest {
  feedName: string;
  feedCategory?: FeedCategory;
  feedDescription?: string;
  creatorDid: string;
  creatorTier?: 'feed' | 'self-hosted';
  // feedRatingRange removed - feeds accept all content
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
  };
}

export interface UpdateFeedRequest {
  feedName?: string;
  feedDescription?: string;
  feedCategory?: FeedCategory;
  // ratingRange removed - feeds accept all content
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
  };
  creatorDid: string;
}

export interface FeedListResponse {
  feeds: Feed[];
  total: number;
  limit?: number;
  offset?: number;
}

const LIST_FEEDS_TTL_MS = 30_000;
const listFeedsCache = new Map<string, { result: FeedListResponse; ts: number }>();
const pendingListFeeds = new Map<string, Promise<FeedListResponse>>();

function listFeedsCacheKey(filters?: Record<string, unknown>): string {
  return JSON.stringify(filters ?? {});
}

export class FeedService {
  /**
   * Create a new feed
   */
  static async createFeed(data: CreateFeedRequest): Promise<Feed> {
    const token = await PNOAuthService.getValidAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_ENDPOINT}/api/feeds`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create feed' }));
      throw new Error(error.error || 'Failed to create feed');
    }

    return response.json();
  }

  /**
   * List feeds with optional filters
   */
  static async listFeeds(filters?: {
    category?: FeedCategory;
    creatorDid?: string;
    creatorTier?: 'free' | 'feed' | 'self-hosted';
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<FeedListResponse> {
    const key = listFeedsCacheKey(filters as Record<string, unknown> | undefined);
    const cached = listFeedsCache.get(key);
    if (cached && Date.now() - cached.ts < LIST_FEEDS_TTL_MS) {
      return cached.result;
    }

    const pending = pendingListFeeds.get(key);
    if (pending) return pending;

    const fetchPromise = (async (): Promise<FeedListResponse> => {
      const params = new URLSearchParams();
      if (filters?.category) params.append('category', filters.category);
      if (filters?.creatorDid) params.append('creatorDid', filters.creatorDid);
      if (filters?.creatorTier) params.append('creatorTier', filters.creatorTier);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(`${API_ENDPOINT}/api/feeds?${params.toString()}`);

      if (response.status === 429) {
        if (import.meta.env.DEV) console.warn('Rate limited (429) when listing feeds, returning empty result');
        return { feeds: [], total: 0 };
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to list feeds' }));
        throw new Error(error.error || 'Failed to list feeds');
      }

      const result: FeedListResponse = await response.json();
      listFeedsCache.set(key, { result, ts: Date.now() });
      return result;
    })();

    pendingListFeeds.set(key, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      pendingListFeeds.delete(key);
    }
  }

  /**
   * Get pinned top post for a feed (branded feed page)
   */
  static async getTopPost(feedId: string): Promise<{ topPost: Record<string, unknown> | null }> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${encodeURIComponent(feedId)}/top-post`);
    if (!response.ok) {
      return { topPost: null };
    }
    return response.json();
  }

  /**
   * Get feed by ID
   */
  static async getFeedById(feedId: string): Promise<Feed> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Feed not found');
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get feed' }));
      throw new Error(error.error || 'Failed to get feed');
    }

    return response.json();
  }

  /**
   * Update feed
   */
  static async updateFeed(feedId: string, data: UpdateFeedRequest): Promise<Feed> {
    const session = PNOAuthService.loadSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update feed' }));
      throw new Error(error.error || 'Failed to update feed');
    }

    return response.json();
  }

  /**
   * Delete feed
   */
  static async deleteFeed(feedId: string, creatorDid: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ creatorDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete feed' }));
      throw new Error(error.error || 'Failed to delete feed');
    }
  }

  /**
   * Subscribe to feed - stores subscription on user's cloud storage (like connection index)
   */
  static async subscribeToFeed(feedId: string, userPnIdentifier: string): Promise<void> {
    // Store subscription via API - backend will save to user's cloud storage
    // Similar to how connection index is stored on user's Google Drive
    const session = PNOAuthService.loadSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }
    
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        userPnIdentifier
        // Backend will store this subscription in the user's cloud storage (Google Drive)
        // Similar to connection index storage pattern
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to subscribe to feed' }));
      throw new Error(error.error || 'Failed to subscribe to feed');
    }
  }

  /**
   * Unsubscribe from feed - removes from user's cloud storage
   */
  static async unsubscribeFromFeed(feedId: string, userPnIdentifier: string): Promise<void> {
    // Remove subscription via API - backend will remove from user's cloud storage
    const session = PNOAuthService.loadSession();
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
    }
    
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscribe`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ userPnIdentifier })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to unsubscribe from feed' }));
      throw new Error(error.error || 'Failed to unsubscribe from feed');
    }
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(userPnIdentifier: string): Promise<Feed[]> {
    const token = await PNOAuthService.getValidAccessToken();
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_ENDPOINT}/api/users/${userPnIdentifier}/subscriptions`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('[FeedService] subscriptions rate limited; using empty list');
        return [];
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get subscriptions' }));
      throw new Error(error.error || 'Failed to get subscriptions');
    }

    const data = await response.json();
    return data.feeds || [];
  }

  /**
   * Get feed posts
   */
  static async getFeedPosts(feedId: string): Promise<string[]> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/posts`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get feed posts' }));
      throw new Error(error.error || 'Failed to get feed posts');
    }

    const data = await response.json();
    return data.fileIds || [];
  }

  /**
   * Add post to feed
   */
  static async addPostToFeed(feedId: string, fileId: string, addedBy: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fileId, addedBy })
    });

    const data = await response.json().catch(() => ({}));
    if (response.status === 202) {
      throw new Error(data.message || "Content is under copyright review. You'll be notified when it's decided.");
    }
    if (response.status === 403) {
      throw new Error(data.message || data.error || 'Your account is restricted due to repeated copyright issues. Contact support if you believe this is an error.');
    }
    if (!response.ok) {
      throw new Error(data.error || 'Failed to add post to feed');
    }
  }

  /**
   * Remove post from feed
   */
  static async removePostFromFeed(feedId: string, fileId: string, creatorDid: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/posts/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ creatorDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to remove post from feed' }));
      throw new Error(error.error || 'Failed to remove post from feed');
    }
  }

  /**
   * Discover feeds (catalogue/store interface)
   */
  static async discoverFeeds(filters?: {
    category?: FeedCategory;
    sort?: 'new' | 'trending' | 'popular';
    limit?: number;
    offset?: number;
  }): Promise<FeedListResponse> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.sort) params.append('sort', filters.sort);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds/discover?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to discover feeds' }));
      throw new Error(error.error || 'Failed to discover feeds');
    }

    return response.json();
  }

  /**
   * Get feed categories with counts
   */
  static async getFeedCategories(): Promise<Array<{ category: FeedCategory; count: number }>> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/categories`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get categories' }));
      throw new Error(error.error || 'Failed to get categories');
    }

    const data = await response.json();
    return data.categories || [];
  }

  /**
   * Get trending feeds
   */
  static async getTrendingFeeds(filters?: {
    limit?: number;
    category?: FeedCategory;
  }): Promise<Feed[]> {
    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.category) params.append('category', filters.category);

    const response = await fetch(`${API_ENDPOINT}/api/feeds/trending?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get trending feeds' }));
      throw new Error(error.error || 'Failed to get trending feeds');
    }

    const data = await response.json();
    return data.feeds || [];
  }

  /**
   * Get recommended feeds for user
   */
  static async getRecommendedFeeds(userPnIdentifier: string, limit?: number): Promise<Feed[]> {
    const params = new URLSearchParams();
    params.append('userPnIdentifier', userPnIdentifier);
    if (limit) params.append('limit', limit.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds/recommended?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get recommended feeds' }));
      throw new Error(error.error || 'Failed to get recommended feeds');
    }

    const data = await response.json();
    return data.feeds || [];
  }

  /**
   * Get delegated feeds for a user
   */
  static async getDelegatedFeeds(userPnIdentifier: string): Promise<Feed[]> {
    const session = PNOAuthService.loadSession();
    
    // Don't make request if no access token - user is not authenticated
    if (!session?.accessToken) {
      return [];
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`
    };

    const response = await fetch(`${API_ENDPOINT}/api/users/${userPnIdentifier}/delegated-feeds`, {
      headers
    });

    if (!response.ok) {
      // Handle 401/403 gracefully - endpoint might require different auth or not be available
      if (response.status === 401 || response.status === 403) {
        // Silently return empty array - user might not have delegated feeds or endpoint not available
        return [];
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get delegated feeds' }));
      throw new Error(error.error || 'Failed to get delegated feeds');
    }

    const data = await response.json();
    return data.feeds || [];
  }

  /**
   * Owned + delegated feed contexts from Sub-pN registry (lock-button switcher).
   */
  static async getControlledFeeds(
    userPnIdentifier: string
  ): Promise<{ owned: Feed[]; delegated: Feed[] }> {
    const session = PNOAuthService.loadSession();
    if (!session?.accessToken) {
      return { owned: [], delegated: [] };
    }

    const response = await fetch(
      `${API_ENDPOINT}/api/users/${encodeURIComponent(userPnIdentifier)}/controlled-feeds`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { owned: [], delegated: [] };
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get controlled feeds' }));
      throw new Error(error.error || 'Failed to get controlled feeds');
    }

    const data = await response.json();
    return {
      owned: data.owned || [],
      delegated: data.delegated || []
    };
  }
}

