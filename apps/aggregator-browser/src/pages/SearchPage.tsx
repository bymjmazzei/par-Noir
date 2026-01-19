/**
 * Search page - wraps SearchResults.
 */

import React from 'react';
import { SearchResults } from '../components/SearchResults';
import { IndexedFile } from '../types/aggregator';

export interface SearchPageProps {
  initialQuery: string;
  indexedFiles: IndexedFile[];
  thumbnails: Map<string, string>;
  onFileClick: (file: IndexedFile) => void;
}

export function SearchPage({ initialQuery, indexedFiles, thumbnails, onFileClick }: SearchPageProps) {
  return (
    <SearchResults
      initialQuery={initialQuery}
      indexedFiles={indexedFiles}
      thumbnails={thumbnails}
      onFileClick={onFileClick}
    />
  );
}
