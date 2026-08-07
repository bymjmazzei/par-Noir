/**
 * Search page - wraps SearchResults.
 */

import { IndexedFile } from '../types/aggregator';
import { SearchResults } from '../components/SearchResults';

interface SearchPageProps {
  initialQuery?: string;
  indexedFiles?: IndexedFile[];
  thumbnails?: Map<string, string>;
  onFileClick: (file: IndexedFile) => void;
  onCreatorClick?: (creatorId: string) => void;
}

export function SearchPage({
  initialQuery,
  indexedFiles,
  thumbnails,
  onFileClick,
  onCreatorClick,
}: SearchPageProps) {
  return (
    <SearchResults
      initialQuery={initialQuery}
      indexedFiles={indexedFiles}
      thumbnails={thumbnails}
      onFileClick={onFileClick}
      onCreatorClick={onCreatorClick}
    />
  );
}
