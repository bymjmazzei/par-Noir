/**
 * Feed Service (Frontend)
 * Connects to backend feed APIs with decentralized subscription support
 */

import { Feed, FeedCategory } from '../types/aggregator';
import * as decentralizedFeed from './decentralizedFeedSubscription';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
const USE_DECENTRALIZED = process.env.REACT_APP_USE_DECENTRALIZED !== 'false'; // Default true

export interface CreateFeedRequest {
  feedName: string;
  feedCategory?: FeedCategory;
  feedDescription?: string;
  creatorDid: string;
  creatorTier?: 'feed' | 'self-hosted';
  feedRatingRange?: string[];
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
  ratingRange?: string[];
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

export class FeedService {
  /**
   * Create a new feed
   */
  static async createFeed(data: CreateFeedRequest): Promise<Feed> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.creatorDid) params.append('creatorDid', filters.creatorDid);
    if (filters?.creatorTier) params.append('creatorTier', filters.creatorTier);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds?${params.toString()}`);

    if (response.status === 429) {
      // Rate limited - return empty result instead of throwing
      console.warn('Rate limited (429) when listing feeds, returning empty result');
      return { feeds: [], total: 0 };
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to list feeds' }));
      throw new Error(error.error || 'Failed to list feeds');
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
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
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
   * Subscribe to feed - uses decentralized IPFS pubsub when available
   */
  static async subscribeToFeed(feedId: string, userDid: string, creatorDid?: string): Promise<void> {
    // Try decentralized first (IPFS pubsub)
    if (USE_DECENTRALIZED && creatorDid) {
      try {
        await decentralizedFeed.subscribeToFeed(userDid, creatorDid, feedId);
        return;
      } catch (error) {
        console.warn('Decentralized subscribe failed, falling back to API:', error);
      }
    }
    
    // Fallback to centralized API (Google Drive)
    // Creator stores subscriber info on their Google Drive
    // Subscriber stores local reference (already handled by UserStateContext)
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        userDid
        // Note: creatorGoogleTokens would be passed if creator is making the call
        // For subscriber-initiated subscriptions, creator's tokens aren't available
        // Subscription is stored in database and synced to Drive when creator is online
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to subscribe to feed' }));
      throw new Error(error.error || 'Failed to subscribe to feed');
    }
  }

  /**
   * Unsubscribe from feed - uses decentralized when available
   */
  static async unsubscribeFromFeed(feedId: string, userDid: string, creatorDid?: string): Promise<void> {
    // Try decentralized first
    if (USE_DECENTRALIZED && creatorDid) {
      try {
        await decentralizedFeed.unsubscribeFromFeed(userDid, creatorDid, feedId);
        return;
      } catch (error) {
        console.warn('Decentralized unsubscribe failed, falling back to API:', error);
      }
    }
    
    // Fallback to centralized API
    // Removes from creator's Google Drive and database
    // Local reference removed by UserStateContext
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to unsubscribe from feed' }));
      throw new Error(error.error || 'Failed to unsubscribe from feed');
    }
  }

  /**
   * Get user's subscriptions
   */
  static async getUserSubscriptions(userDid: string): Promise<Feed[]> {
    const response = await fetch(`${API_ENDPOINT}/api/users/${userDid}/subscriptions`);

    if (!response.ok) {
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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to add post to feed' }));
      throw new Error(error.error || 'Failed to add post to feed');
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
  static async getRecommendedFeeds(userDid: string, limit?: number): Promise<Feed[]> {
    const params = new URLSearchParams();
    params.append('userDid', userDid);
    if (limit) params.append('limit', limit.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds/recommended?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get recommended feeds' }));
      throw new Error(error.error || 'Failed to get recommended feeds');
    }

    const data = await response.json();
    return data.feeds || [];
  }
}

