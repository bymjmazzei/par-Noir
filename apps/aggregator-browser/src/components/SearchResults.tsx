/**
 * Search Results Component
 * Redesigned search screen with recent/popular/trending searches and railway navigation
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { IndexedFile } from '../types/aggregator';
import { Search, X, Clock, TrendingUp, Flame } from 'lucide-react';
import { searchFiles, SearchOptions } from '../services/searchService';
import { useUserState } from '../contexts/UserStateContext';
import { FeedRail } from './FeedRail';

interface SearchResultsProps {
  initialQuery?: string;
  onFileClick: (file: IndexedFile) => void;
  indexedFiles?: IndexedFile[]; // For fallback search
  thumbnails?: Map<string, string>; // Thumbnail URLs by fileId
}

type SearchFilter = 'all' | 'users' | 'posts' | 'tags';

const RECENT_SEARCHES_KEY = 'parnoir_recent_searches';
const MAX_RECENT_SEARCHES = 10;

// Mock popular and trending searches (can be replaced with API calls)
const POPULAR_SEARCHES = ['art', 'photography', 'music', 'sports', 'nature', 'design'];
const TRENDING_SEARCHES = ['ai', 'digital art', 'photography', 'music production', 'sports highlights'];

export function SearchResults({ initialQuery = '', onFileClick, indexedFiles = [], thumbnails }: SearchResultsProps) {
  const { userState } = useUserState();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<IndexedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse recent searches:', e);
      }
    }
  }, []);

  // Save recent searches to localStorage
  const saveRecentSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    
    const updated = [
      searchTerm.trim(),
      ...recentSearches.filter(s => s.toLowerCase() !== searchTerm.trim().toLowerCase())
    ].slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(updated);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Track if search is in progress to prevent duplicate calls
  const isSearchingRef = useRef(false);
  const currentSearchRef = useRef<string>('');

  // Perform search with debouncing
  const performSearch = React.useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      currentSearchRef.current = '';
      return;
    }

    // Prevent duplicate searches for the same query
    if (isSearchingRef.current && currentSearchRef.current === trimmedQuery) {
      return;
    }

    isSearchingRef.current = true;
    currentSearchRef.current = trimmedQuery;
      setLoading(true);
      setError(null);
    setHasSearched(true);
    saveRecentSearch(trimmedQuery);

      try {
        const searchOptions: SearchOptions = {
        query: trimmedQuery,
        sortBy: 'relevance',
          limit: 50
        };

      // Try API first, fallback to client-side search if it fails
      let apiResult = null;
      let apiSucceeded = false;
      try {
        apiResult = await searchFiles(searchOptions, userState.pnIdentifier);
        apiSucceeded = true;
        // If API succeeds and returns results, use them
        if (apiResult && apiResult.files && apiResult.files.length > 0) {
          setResults(apiResult.files);
          setLoading(false);
          isSearchingRef.current = false;
          return;
        }
      } catch (apiError) {
        // API failed, will use fallback below
        apiSucceeded = false;
      }

      // Always try fallback search (either API failed or returned no results)
      const fallbackResult = fallbackClientSearch(trimmedQuery, indexedFiles);
      setResults(fallbackResult.files || []);
      // Only show error if both API and fallback fail
      if (fallbackResult.files.length === 0 && !apiSucceeded) {
        setError('No results found');
      } else {
        setError(null);
      }
    } catch (fallbackErr) {
      console.error('Fallback search error:', fallbackErr);
        setResults([]);
      setError('Search failed');
      } finally {
        setLoading(false);
      isSearchingRef.current = false;
      }
  }, [indexedFiles, userState.pnIdentifier]);

  // Client-side fallback search
  const fallbackClientSearch = (searchQuery: string, files: IndexedFile[]): { files: IndexedFile[]; total: number; hasMore: boolean } => {
    const queryLower = searchQuery.toLowerCase();
    const filtered = files.filter(file => {
      const metadata = file.metadata;
      const name = (metadata.name || metadata.title || '').toLowerCase();
      const description = (metadata.description || '').toLowerCase();
      const tags = (metadata.tags || metadata.keywords || []).join(' ').toLowerCase();
      const category = (metadata.category || '').toLowerCase();
      
      return name.includes(queryLower) ||
             description.includes(queryLower) ||
             tags.includes(queryLower) ||
             category.includes(queryLower);
    });

    return {
      files: filtered,
      total: filtered.length,
      hasMore: false
    };
  };

  // Filter results by type
  const filteredResults = useMemo(() => {
    if (activeFilter === 'all') return results;
    
    return results.filter(file => {
      switch (activeFilter) {
        case 'users':
          // Filter by creator/author - would need user data
          return true; // Placeholder
        case 'posts':
          // All files are posts
          return true;
        case 'tags':
          // Filter files that have matching tags
          const queryLower = query.toLowerCase();
          const tags = (file.metadata.tags || file.metadata.keywords || []).join(' ').toLowerCase();
          return tags.includes(queryLower);
        default:
          return true;
      }
    });
  }, [results, activeFilter, query]);

  // Railway items for filtering
  const filterRailItems = [
    { feedId: 'all', name: 'ALL' },
    { feedId: 'posts', name: 'POSTS' },
    { feedId: 'tags', name: 'TAGS' },
    { feedId: 'users', name: 'USERS' }
  ];

  const handleSearchClick = (searchTerm: string) => {
    setQuery(searchTerm);
    // Perform search immediately when clicking a suggestion
    performSearch(searchTerm);
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900" style={{ paddingBottom: '64px' }}>
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-4 py-3" style={{ paddingRight: '56px' }}>
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  performSearch(query);
                }
              }}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {query && (
          <button
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  setHasSearched(false);
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white"
          >
                <X className="h-4 w-4" />
          </button>
            )}
          </div>
        </div>

        {/* Railway Navigation for Filters - Only show when there are results */}
        {hasSearched && results.length > 0 && (
          <div className="mt-3">
            <FeedRail
              feeds={filterRailItems}
              activeFeedId={activeFilter}
              onFeedSelect={(feedId) => setActiveFilter(feedId as SearchFilter)}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-neutral-400">Searching...</p>
          </div>
        ) : error && !results.length ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
          </div>
        ) : hasSearched ? (
          // Search Results
          <div className="p-4">
            {filteredResults.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">No results found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
                {filteredResults.map((file) => (
              <div
                key={file.metadata.fileId}
                onClick={() => onFileClick(file)}
                className="group relative cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-neutral-800 rounded overflow-hidden mb-1">
                      {(file.thumbnail || (thumbnails && thumbnails.get(file.metadata.fileId))) ? (
                  <img
                          src={file.thumbnail || (thumbnails?.get(file.metadata.fileId) || '')}
                          alt={file.metadata.name || file.metadata.title || 'Untitled'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = document.createElement('div');
                            placeholder.className = 'w-full h-full flex items-center justify-center text-neutral-500 text-xs';
                            placeholder.textContent = 'No preview';
                            e.currentTarget.parentElement?.appendChild(placeholder);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
                          No preview
                        </div>
                      )}
                </div>

                {/* Title */}
                <p className="text-white text-xs line-clamp-2 group-hover:text-blue-400 transition-colors">
                  {file.metadata.name || file.metadata.title || 'Untitled'}
                </p>
              </div>
            ))}
              </div>
            )}
          </div>
        ) : (
          // Default View: Recent, Popular, Trending
          <div className="p-4 space-y-6">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-neutral-400" />
                    <h3 className="text-white font-medium">Recent Searches</h3>
                  </div>
                  <button
                    onClick={handleClearRecent}
                    className="text-neutral-400 hover:text-white text-sm"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((search, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSearchClick(search)}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white text-sm transition-colors"
                    >
                      {search}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Searches */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <TrendingUp className="h-4 w-4 text-neutral-400" />
                <h3 className="text-white font-medium">Popular Searches</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((search, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSearchClick(search)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white text-sm transition-colors"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>

            {/* Trending Searches */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <Flame className="h-4 w-4 text-neutral-400" />
                <h3 className="text-white font-medium">Trending Searches</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {TRENDING_SEARCHES.map((search, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSearchClick(search)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-white text-sm transition-colors"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
