/**
 * Feed Service (Frontend)
 * Manages feeds, feed creation, and feed operations
 */

import type { FeedCategory } from '../../types/aggregator';
import { API_ENDPOINT } from '../../config/api';
import { ownerFetch, ownerGet } from '../ownerApiService';

export interface Feed {
  feedId: string;
  feedName: string;
  feedCategory?: FeedCategory;
  feedDescription?: string;
  creatorId: string;
  creatorTier: 'free' | 'feed' | 'self-hosted';
  branding?: {
    bannerImage?: string;
    avatar?: string;
    bio?: string;
    links?: Array<{
      label: string;
      url: string;
    }>;
  };
  createdAt: string;
  updatedAt: string;
  subscriberCount?: number;
  postCount?: number;
  isPaid: boolean;
  monthlyPrice?: number;
  annualPrice?: number;
  subdomain?: string;
}

export interface FeedPost {
  id: string;
  feedId: string;
  content: string;
  media?: Array<{
    type: 'image' | 'video';
    url: string;
    thumbnail?: string;
  }>;
  buttons?: Array<{
    label: string;
    url: string;
    style?: 'primary' | 'secondary' | 'link';
  }>;
  polls?: Array<{
    question: string;
    options: string[];
    votes?: Record<string, number>;
  }>;
  forms?: Array<{
    title: string;
    fields: Array<{
      name: string;
      type: 'text' | 'email' | 'textarea' | 'select';
      required?: boolean;
      options?: string[];
    }>;
  }>;
  isTopPost: boolean;
  createdAt: string;
  updatedAt: string;
}

export class FeedService {
  /**
   * Create a new feed
   */
  static async createFeed(data: {
    feedName: string;
    feedCategory?: FeedCategory;
    feedDescription?: string;
    branding?: Feed['branding'];
    isPaid?: boolean;
    monthlyPrice?: number;
    annualPrice?: number;
    subdomain?: string;
  }): Promise<Feed> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const response = await ownerFetch(authenticatedUser.accessToken || '', 'POST', '/api/feeds', {
      ...data,
      creatorDid: authenticatedUser.id,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create feed');
    }

    return await response.json();
  }

  /**
   * Get feed by ID
   */
  static async getFeed(feedId: string): Promise<Feed | null> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch feed');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get feed:', error);
      return null;
    }
  }

  /**
   * List feeds
   */
  static async listFeeds(filters?: {
    category?: FeedCategory;
    creatorId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ feeds: Feed[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.creatorId) params.set('creatorId', filters.creatorId);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.offset) params.set('offset', filters.offset.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error('Failed to list feeds');
    }

    return await response.json();
  }

  /**
   * Update feed
   */
  static async updateFeed(feedId: string, updates: Partial<Feed>): Promise<Feed> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const response = await ownerFetch(
      authenticatedUser.accessToken || '',
      'PUT',
      `/api/feeds/${feedId}`,
      updates
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update feed');
    }

    return await response.json();
  }

  /**
   * Activate feed after verification
   * Creates sub-pN, Google Drive folder, and activates feed
   */
  static async activateFeedAfterVerification(
    checkoutId: string,
    verificationData: {
      verificationId: string;
      verifiedZKPs: any;
    }
  ): Promise<Feed> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const response = await fetch(`${API_ENDPOINT}/api/feeds/activate-after-verification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authenticatedUser.accessToken || ''}`
      },
      body: JSON.stringify({
        checkoutId,
        verificationId: verificationData.verificationId,
        verifiedZKPs: verificationData.verifiedZKPs
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to activate feed');
    }

    return await response.json();
  }

  /**
   * Delete feed
   */
  static async deleteFeed(feedId: string): Promise<void> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const response = await ownerFetch(
      authenticatedUser.accessToken || '',
      'DELETE',
      `/api/feeds/${feedId}`,
      { creatorDid: authenticatedUser.id }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete feed');
    }
  }

  /**
   * Get feed posts
   */
  static async getFeedPosts(feedId: string, limit?: number, offset?: number): Promise<FeedPost[]> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (offset) params.set('offset', offset.toString());

    const response = await fetch(`${API_ENDPOINT}/api/feeds/${feedId}/posts?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch feed posts');
    }

    const data = await response.json();
    return data.posts || [];
  }

  /**
   * Create feed post
   */
  static async createFeedPost(feedId: string, post: Omit<FeedPost, 'id' | 'feedId' | 'createdAt' | 'updatedAt'>): Promise<FeedPost> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const token = authenticatedUser.accessToken || '';
    const response = await ownerFetch(token, 'POST', `/api/feeds/${feedId}/posts`, post);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create post');
    }

    return await response.json();
  }

  /**
   * Update top post (enhanced profile post)
   */
  static async updateTopPost(feedId: string, post: Partial<FeedPost>): Promise<FeedPost> {
    const authenticatedUserStr = localStorage.getItem('authenticated_user');
    if (!authenticatedUserStr) {
      throw new Error('User not authenticated');
    }

    const authenticatedUser = JSON.parse(authenticatedUserStr);
    const token = authenticatedUser.accessToken || '';
    const response = await ownerFetch(token, 'PUT', `/api/feeds/${feedId}/top-post`, post);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update top post');
    }

    return await response.json();
  }

  /**
   * Get delegated feeds for a user
   */
  static async getDelegatedFeeds(userDid: string): Promise<Feed[]> {
    try {
      const authenticatedUserStr = localStorage.getItem('authenticated_user');
      if (!authenticatedUserStr) {
        // User not authenticated - return empty array instead of throwing
        console.warn('⚠️ [FeedService] User not authenticated, returning empty delegated feeds');
        return [];
      }

      const authenticatedUser = JSON.parse(authenticatedUserStr);
      const accessToken = authenticatedUser.accessToken || authenticatedUser.token || '';
      
      if (!accessToken) {
        console.warn('⚠️ [FeedService] No access token available, returning empty delegated feeds');
        return [];
      }

      const response = await ownerGet(accessToken, `/api/users/${userDid}/delegated-feeds`);

      if (!response.ok) {
        if (response.status === 404 || response.status === 401) {
          // No feeds or not authorized - return empty array
          return [];
        }
        console.error('Failed to fetch delegated feeds:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      return data.feeds || [];
    } catch (error) {
      console.error('Failed to get delegated feeds:', error);
      return [];
    }
  }
}

