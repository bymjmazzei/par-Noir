/**
 * Feed Service (Frontend)
 * Connects to backend feed APIs
 */

import { Feed, FeedCategory } from '../types/aggregator';

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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
   * Subscribe to feed
   */
  static async subscribeToFeed(feedId: string, userDid: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userDid })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to subscribe to feed' }));
      throw new Error(error.error || 'Failed to subscribe to feed');
    }
  }

  /**
   * Unsubscribe from feed
   */
  static async unsubscribeFromFeed(feedId: string, userDid: string): Promise<void> {
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
}

