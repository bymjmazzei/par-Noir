/**
 * Search Results Component
 * 3-column grid layout for search results with filters
 */

import React, { useState, useEffect, useMemo } from 'react';
import { IndexedFile } from '../types/aggregator';
import { Search, Filter, X, Calendar, TrendingUp, Star } from 'lucide-react';
import { searchFiles, searchPersonalHistory, SearchOptions } from '../services/searchService';
import { useUserState } from '../contexts/UserStateContext';
import { MetadataFilters } from '../types/aggregator';

interface SearchResultsProps {
  initialQuery?: string;
  onFileClick: (file: IndexedFile) => void;
  onClose: () => void;
}

export function SearchResults({ initialQuery = '', onFileClick, onClose }: SearchResultsProps) {
  const { userState } = useUserState();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<IndexedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPersonal, setSearchPersonal] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'popularity'>('relevance');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<MetadataFilters>({});

  // Perform search
  useEffect(() => {
    if (!query.trim() && !showFilters) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      setError(null);

      try {
        const searchOptions: SearchOptions = {
          query: query.trim() || undefined,
          sortBy,
          filters,
          limit: 50
        };

        const result = searchPersonal && userState.isUnlocked && userState.pnIdentifier
          ? await searchPersonalHistory(userState.pnIdentifier, searchOptions)
          : await searchFiles(searchOptions, userState.pnIdentifier);

        setResults(result.files);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [query, sortBy, filters, searchPersonal, userState.isUnlocked, userState.pnIdentifier, showFilters]);

  const handleFilterChange = (key: keyof MetadataFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-900 border-b border-neutral-700 px-4 py-3">
        <div className="flex items-center space-x-3 mb-3">
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
            aria-label="Toggle filters"
          >
            <Filter className="h-5 w-5" />
          </button>
        </div>

        {/* Search Options */}
        <div className="flex items-center space-x-4">
          {/* Sort */}
          <div className="flex items-center space-x-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="relevance">Relevance</option>
              <option value="date">Date</option>
              <option value="popularity">Popularity</option>
            </select>
          </div>

          {/* Personal History Toggle */}
          {userState.isUnlocked && (
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={searchPersonal}
                onChange={(e) => setSearchPersonal(e.target.checked)}
                className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-neutral-400 text-sm">Personal History</span>
            </label>
          )}
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-neutral-800 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-400 text-xs mb-1">File Type</label>
                <select
                  value={filters.fileType || ''}
                  onChange={(e) => handleFilterChange('fileType', e.target.value || undefined)}
                  className="w-full px-3 py-1.5 bg-neutral-700 border border-neutral-600 rounded-lg text-white text-sm"
                >
                  <option value="">All Types</option>
                  <option value="image">Images</option>
                  <option value="video">Videos</option>
                  <option value="audio">Audio</option>
                  <option value="document">Documents</option>
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 text-xs mb-1">Date Range</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={filters.dateRange?.from || ''}
                    onChange={(e) => handleFilterChange('dateRange', {
                      ...filters.dateRange,
                      from: e.target.value
                    })}
                    className="flex-1 px-2 py-1.5 bg-neutral-700 border border-neutral-600 rounded-lg text-white text-sm"
                  />
                  <span className="text-neutral-400">to</span>
                  <input
                    type="date"
                    value={filters.dateRange?.to || ''}
                    onChange={(e) => handleFilterChange('dateRange', {
                      ...filters.dateRange,
                      to: e.target.value
                    })}
                    className="flex-1 px-2 py-1.5 bg-neutral-700 border border-neutral-600 rounded-lg text-white text-sm"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setFilters({});
                setShowFilters(false);
              }}
              className="text-neutral-400 hover:text-white text-sm"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-2"></div>
            <p className="text-neutral-400">Searching...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-400">No results found</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {results.map((file) => (
              <div
                key={file.metadata.fileId}
                onClick={() => onFileClick(file)}
                className="group relative cursor-pointer"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-neutral-800 rounded overflow-hidden mb-1">
                  <img
                    src={file.thumbnail || '/placeholder-thumbnail.png'}
                    alt={file.metadata.name || file.metadata.title || 'Untitled'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder-thumbnail.png';
                    }}
                  />
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
    </div>
  );
}

