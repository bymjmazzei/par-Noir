/**
 * Tag Extraction Utility (Server-side)
 * Simplified tag extraction for server-side use
 * Extracts tags from file metadata and normalizes them
 */

export interface FileMetadata {
  tags?: string[];
  keywords?: string[];
  subjects?: string[];
  feedCategories?: string[];
  fileType?: string;
  geminiTags?: string[];
}

export interface NormalizedTag {
  id: string; // Normalized ID (lowercase)
  displayName: string; // Original or capitalized version
  type: 'subject' | 'category' | 'contentType' | 'keyword';
}

/**
 * Normalize a tag (lowercase, trim, basic normalization)
 */
function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Extract and normalize tags from file metadata
 */
export function extractTagsFromMetadata(
  metadata: FileMetadata,
  options?: {
    fileId?: string;
  }
): NormalizedTag[] {
  const normalized = new Map<string, NormalizedTag>();

  // Extract tags from various sources
  const allTags: Array<{ value: string; type: 'subject' | 'category' | 'keyword' }> = [];

  // Tags and keywords (user-provided)
  (metadata.tags || []).forEach(tag => {
    allTags.push({ value: tag, type: 'keyword' });
  });

  (metadata.keywords || []).forEach(keyword => {
    allTags.push({ value: keyword, type: 'keyword' });
  });

  // Subjects (extracted)
  (metadata.subjects || []).forEach(subject => {
    allTags.push({ value: subject, type: 'subject' });
  });

  // Feed categories
  (metadata.feedCategories || []).forEach(category => {
    allTags.push({ value: category, type: 'category' });
  });

  // Gemini tags
  (metadata.geminiTags || []).forEach(tag => {
    allTags.push({ value: tag, type: 'subject' });
  });

  // Normalize and deduplicate
  allTags.forEach(({ value, type }) => {
    const normalizedId = normalizeTag(value);
    if (!normalizedId) return; // Skip empty tags

    if (!normalized.has(normalizedId)) {
      normalized.set(normalizedId, {
        id: normalizedId,
        displayName: value, // Keep original for display
        type
      });
    } else {
      // If tag already exists, prefer more specific type
      const existing = normalized.get(normalizedId)!;
      if (type === 'category' && existing.type !== 'category') {
        existing.type = 'category';
      } else if (type === 'subject' && existing.type === 'keyword') {
        existing.type = 'subject';
      }
    }
  });

  return Array.from(normalized.values());
}

