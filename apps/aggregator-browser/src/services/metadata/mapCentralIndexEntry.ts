/**
 * Pure mapping for CentralMetadataAggregator → IndexedFile shape.
 * Kept separate so discovery field preservation can be unit-tested.
 */

export function mapCentralIndexEntryToIndexedFile(entry: {
  fileId?: string;
  pnIdentifier?: string;
  publicToken?: unknown;
  publicRankScore?: number;
  metadata?: Record<string, any>;
}): {
  metadata: Record<string, any>;
  thumbnail?: unknown;
  publicToken?: unknown;
  pnIdentifier?: string;
} {
  const pnId = entry.pnIdentifier;
  const normalizedPnId = pnId && pnId.startsWith('pn-') ? pnId.substring(3) : pnId;
  const metadata = entry.metadata || {};
  const publicRankScore =
    typeof entry.publicRankScore === 'number' ? entry.publicRankScore : undefined;

  return {
    metadata: {
      ...metadata,
      ...(publicRankScore !== undefined ? { publicRankScore } : {}),
      fileId: metadata.fileId || entry.fileId,
      title: metadata.title || metadata.name || undefined,
      fileType: metadata.fileType || undefined,
      // Public thought rows are often named thumb_thought-… — preserve thought/textPost.
      textPost: metadata.textPost || metadata.thought || undefined,
      thought: metadata.thought || metadata.textPost || undefined,
      collection: metadata.collection !== undefined ? metadata.collection : undefined,
      creatorId: normalizedPnId || metadata.creatorId,
      creator:
        metadata.creator ||
        (entry.pnIdentifier
          ? {
              '@type': 'Person',
              '@id': entry.pnIdentifier,
              identifier: {
                '@type': 'PropertyValue',
                name: 'DID',
                value: entry.pnIdentifier,
              },
            }
          : undefined),
      author: metadata.author || (entry.pnIdentifier ? { did: entry.pnIdentifier } : undefined),
      publicToken: entry.publicToken || metadata.publicToken,
    },
    thumbnail: metadata.thumbnail,
    publicToken: entry.publicToken || metadata.publicToken,
    pnIdentifier: entry.pnIdentifier || normalizedPnId,
  };
}
