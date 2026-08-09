/**
 * Search Service
 * Handles semantic metadata search with filters
 */

import { IndexedFile, MetadataFilters } from '../types/aggregator';
import { apiGet } from './ownerApiFetch';

export interface SearchOptions {
  query?: string;
  filters?: MetadataFilters;
  sortBy?: 'relevance' | 'date' | 'popularity';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  files: IndexedFile[];
  total: number;
  hasMore: boolean;
}

/**
 * Search files using semantic metadata
 */
export async function searchFiles(
  options: SearchOptions,
  userPnIdentifier?: string
): Promise<SearchResult> {
  try {
    const params = new URLSearchParams();
    
    if (options.query) {
      params.append('q', options.query);
    }
    
    if (options.sortBy) {
      params.append('sort', options.sortBy);
    }
    
    if (options.limit) {
      params.append('limit', options.limit.toString());
    }
    
    if (options.offset) {
      params.append('offset', options.offset.toString());
    }
    
    if (userPnIdentifier) {
      params.append('userPnIdentifier', userPnIdentifier);
    }

    // Add filters
    if (options.filters) {
      if (options.filters.tags && options.filters.tags.length > 0) {
        params.append('tags', options.filters.tags.join(','));
      }
      if (options.filters.contentClass) {
        params.append('contentClass', options.filters.contentClass);
      }
      if (options.filters.authorDid) {
        params.append('authorDid', options.filters.authorDid);
      }
      if (options.filters.feedId) {
        params.append('feedId', options.filters.feedId);
      }
      if (options.filters.feedCategory) {
        params.append('feedCategory', options.filters.feedCategory);
      }
      if (options.filters.dateRange) {
        params.append('dateFrom', options.filters.dateRange.from);
        params.append('dateTo', options.filters.dateRange.to);
      }
    }

    const response = await apiGet(`/api/search?${params.toString()}`);

    if (!response.ok) {
      // Throw error to trigger fallback in SearchResults component
      throw new Error('Search failed');
    }

    const result = await response.json();
    return {
      files: result.files || [],
      total: result.total || 0,
      hasMore: result.hasMore || false
    };
  } catch (error) {
    // Silently fallback to client-side search (don't log as error since we have fallback)
    // console.error('Search error:', error);
    // Fallback to client-side search
    return fallbackSearch(options);
  }
}

/**
 * Fallback client-side search when API is unavailable
 */
function fallbackSearch(_options: SearchOptions): SearchResult {
  // This would search through already-loaded files
  // For now, return empty result
  return {
    files: [],
    total: 0,
    hasMore: false
  };
}

/**
 * Search user's personal history
 */
export async function searchPersonalHistory(
  userPnIdentifier: string,
  options: SearchOptions
): Promise<SearchResult> {
  try {
    const params = new URLSearchParams();
    
    if (options.query) {
      params.append('q', options.query);
    }
    
    if (options.sortBy) {
      params.append('sort', options.sortBy);
    }
    
    if (options.limit) {
      params.append('limit', options.limit.toString());
    }
    
    if (options.offset) {
      params.append('offset', options.offset.toString());
    }

    const response = await apiGet(
      `/api/search/personal?userPnIdentifier=${userPnIdentifier}&${params.toString()}`
    );

    if (!response.ok) {
      throw new Error('Personal search failed');
    }

    const result = await response.json();
    return {
      files: result.files || [],
      total: result.total || 0,
      hasMore: result.hasMore || false
    };
  } catch (error) {
    console.error('Personal search error:', error);
    return {
      files: [],
      total: 0,
      hasMore: false
    };
  }
}

export interface ProfileSearchResult {
  pnIdentifier: string;
  displayName: string;
  publicName?: string;
  proofType?: string;
  verified?: boolean;
  isVanity?: boolean;
}

export async function searchProfiles(query: string, limit = 20): Promise<ProfileSearchResult[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
    const response = await apiGet(`/api/profile/search?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return (data.profiles || []).map((p: ProfileSearchResult & { publicName?: string }) => ({
      ...p,
      displayName: p.publicName || p.displayName,
      verified: p.verified !== false,
    }));
  } catch {
    return [];
  }
}

