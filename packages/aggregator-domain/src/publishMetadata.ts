import type { FeedCategory } from './feedCategories.js';

export type PublishMetadataForm = {
  name: string;
  description: string;
  tags?: string;
  genre?: string;
  categories?: FeedCategory[];
  isNSFW?: boolean;
  locationName?: string;
  locationAddress?: string;
  license?: string;
  expiresAt?: string | null;
};

export type IndexingPermissionsInput = {
  mode?: 'all' | 'custom' | 'none';
  allowed?: string[];
  blocked?: string[];
};

/** Returns an error message or null when valid. */
export function validatePublishMetadata(form: PublishMetadataForm): string | null {
  if (!form.name.trim()) return 'title_required';
  if (!form.description.trim()) return 'caption_required';
  return null;
}

export function parsePublishTags(tags: string | undefined): string[] {
  return (tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parsePublishGenre(genre: string | undefined): string[] {
  return (genre || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

export function indexingPermissionsFromToggles(
  indexerIds: string[],
  toggles: Record<string, boolean>
): IndexingPermissionsInput {
  const enabled = indexerIds.filter((id) => toggles[id] !== false);
  const blocked = indexerIds.filter((id) => toggles[id] === false);
  if (!indexerIds.length) return { mode: 'all', blocked: [] };
  if (enabled.length === indexerIds.length) return { mode: 'all', blocked: [] };
  if (enabled.length === 0) return { mode: 'none', blocked: indexerIds };
  return {
    mode: 'custom',
    allowed: enabled,
    blocked
  };
}
