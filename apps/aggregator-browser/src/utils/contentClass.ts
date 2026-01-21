/**
 * Content class and creator helpers.
 * Shared by feed filtering and Me-page logic.
 */

import type { IndexedFile } from '../types/aggregator';

export function isThought(file: IndexedFile): boolean {
  return (file.metadata as any).contentClass === 'thought';
}

export function isCollection(file: IndexedFile): boolean {
  return (file.metadata as any).contentClass === 'collection';
}

export function isMedia(file: IndexedFile): boolean {
  return (file.metadata as any).contentClass === 'media';
}

export function getCreatorIdentifier(file: IndexedFile): string | null {
  if ((file as any).pnIdentifier) {
    return String((file as any).pnIdentifier);
  }
  const creatorId =
    file.metadata.creator?.identifier?.value ||
    file.metadata.creator?.['@id'] ||
    file.metadata.author?.did ||
    file.metadata.creatorId;
  return creatorId ? String(creatorId) : null;
}

export function normalizeId(id: string | undefined | null): string {
  if (!id) return '';
  const cleaned = id.startsWith('pn-') ? id.substring(3) : id;
  return cleaned.trim().toLowerCase();
}
