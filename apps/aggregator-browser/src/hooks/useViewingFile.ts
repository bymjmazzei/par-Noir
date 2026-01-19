/**
 * Hook for the currently viewed file (in full-screen or viewer).
 */

import { useState } from 'react';
import type { IndexedFile } from '../types/aggregator';

export type ViewingFile = { file: IndexedFile; blob: Blob; url: string } | null;

export function useViewingFile() {
  const [viewingFile, setViewingFile] = useState<ViewingFile>(null);
  return { viewingFile, setViewingFile };
}
