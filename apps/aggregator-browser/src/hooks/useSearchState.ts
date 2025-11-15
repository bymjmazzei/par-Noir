/**
 * Search State Hook
 * Manages search and filter state
 */

import { useState } from 'react';
import { MetadataFilters } from '../types/aggregator';

export function useSearchState() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<MetadataFilters>({});

  return {
    searchQuery,
    setSearchQuery,
    filters,
    setFilters
  };
}

