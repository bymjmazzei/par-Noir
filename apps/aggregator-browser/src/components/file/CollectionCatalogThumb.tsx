/**
 * Collection row thumb: parent feedPoster when indexed, else first member's preview.
 */

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import type { DriveFile } from '../storage/storageTypes';
import { CatalogFeedPosterThumb } from './CatalogFeedPosterThumb';
import {
  hasFeedPreviewPlayback,
  type FeedPlaybackMetadata
} from '../../services/feedPreviewPlayback';

function collectionFileIds(file: DriveFile): string[] {
  const raw = file.collection as { collectionFileIds?: unknown } | undefined;
  const ids = raw?.collectionFileIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
}

export function CollectionCatalogThumb({
  file,
  parentMetadataIndexFileId,
  parentMetadata,
  fileMetadataMap,
  loadFileMetadata,
  alt,
  className,
  badgeClassName
}: {
  file: DriveFile;
  parentMetadataIndexFileId: string;
  parentMetadata: FeedPlaybackMetadata | null | undefined;
  fileMetadataMap: Map<string, unknown>;
  loadFileMetadata?: (fileId: string) => Promise<unknown>;
  alt: string;
  className?: string;
  badgeClassName?: string;
}) {
  const firstChildId = collectionFileIds(file)[0];
  const [childMeta, setChildMeta] = useState<FeedPlaybackMetadata | null>(null);

  const parentOk = Boolean(parentMetadata && hasFeedPreviewPlayback(parentMetadata));

  useEffect(() => {
    if (parentOk || !firstChildId) return;
    const cached = fileMetadataMap.get(firstChildId) as FeedPlaybackMetadata | undefined;
    if (cached && hasFeedPreviewPlayback(cached)) {
      setChildMeta(cached);
      return;
    }
    if (!loadFileMetadata) return;
    let cancelled = false;
    void loadFileMetadata(firstChildId).then((meta) => {
      if (cancelled || !meta || typeof meta !== 'object') return;
      const row = meta as FeedPlaybackMetadata;
      if (hasFeedPreviewPlayback(row)) setChildMeta(row);
    });
    return () => {
      cancelled = true;
    };
  }, [parentOk, firstChildId, loadFileMetadata, fileMetadataMap]);

  const playbackMeta = parentOk ? parentMetadata! : childMeta;
  const playbackFileId = parentOk ? parentMetadataIndexFileId : firstChildId;

  if (!playbackMeta || !playbackFileId || !hasFeedPreviewPlayback(playbackMeta)) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-600/20 to-purple-600/20 ${className || ''}`}
      >
        <Layers className={badgeClassName || 'h-12 w-12 text-blue-400'} />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <CatalogFeedPosterThumb
        metadataIndexFileId={playbackFileId}
        metadata={playbackMeta}
        alt={alt}
        className={className || 'w-full h-full object-cover'}
      />
      <div
        className="absolute bottom-0 right-0 w-1/3 h-1/3 flex items-center justify-center pointer-events-none"
        aria-hidden
      >
        <Layers
          className={`w-[82%] h-[82%] text-blue-400 drop-shadow-[0_0_2px_rgba(0,0,0,0.85)] ${badgeClassName || ''}`}
          strokeWidth={2}
        />
      </div>
    </div>
  );
}
