/**
 * Owner catalog: which indexed rows are top-level feed/storage items vs collection parts.
 */

export type OwnerCatalogMetadata = {
  fileId?: string;
  isPartOfCollection?: boolean;
  feedIds?: string[];
  fileType?: string;
  publicContentRef?: { objectId?: string };
};

/** True when the row should not appear as its own tile in owner storage / public feed rails. */
export function isAggregatorCollectionPart(metadata: OwnerCatalogMetadata | null | undefined): boolean {
  if (!metadata) return false;
  if (metadata.isPartOfCollection === true) return true;
  const ids = metadata.feedIds;
  if (ids?.length === 1 && ids[0] === 'collection-part') return true;
  return false;
}

/** Drive / envelope id used for delete and storage list keys. */
export function ownerCatalogDriveId(metadata: OwnerCatalogMetadata & { fileId?: string }, fileId?: string): string {
  const ref = metadata.publicContentRef?.objectId;
  if (typeof ref === 'string' && ref.trim()) return ref.trim();
  const fid = fileId || metadata.fileId;
  return typeof fid === 'string' ? fid : '';
}
