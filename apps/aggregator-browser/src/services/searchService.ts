/**
 * Search Service
 * Handles semantic metadata search with filters
 */

const API_ENDPOINT = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
import { IndexedFile, MetadataFilters, ContentRating } from '../types/aggregator';

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
  userDid?: string
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
    
    if (userDid) {
      params.append('userDid', userDid);
    }

    // Add filters
    if (options.filters) {
      if (options.filters.tags && options.filters.tags.length > 0) {
        params.append('tags', options.filters.tags.join(','));
      }
      if (options.filters.fileType) {
        params.append('fileType', options.filters.fileType);
      }
      if (options.filters.authorDid) {
        params.append('authorDid', options.filters.authorDid);
      }
      if (options.filters.maxRating) {
        params.append('maxRating', options.filters.maxRating);
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

    const response = await fetch(`${API_ENDPOINT}/api/search?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const result = await response.json();
    return {
      files: result.files || [],
      total: result.total || 0,
      hasMore: result.hasMore || false
    };
  } catch (error) {
    console.error('Search error:', error);
    // Fallback to client-side search
    return fallbackSearch(options);
  }
}

/**
 * Fallback client-side search when API is unavailable
 */
function fallbackSearch(options: SearchOptions): SearchResult {
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
  userDid: string,
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

    const response = await fetch(`${API_ENDPOINT}/api/search/personal?userDid=${userDid}&${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

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

