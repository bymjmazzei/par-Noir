/**
 * Thumbnail for owner-catalog (Pen publish) rows using indexed feedPoster CDN refs.
 */

import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  hasFeedPreviewPlayback,
  resolvePublicFeedObjectUrl,
  type FeedPlaybackMetadata
} from '../../services/feedPreviewPlayback';

export function CatalogFeedPosterThumb({
  metadataIndexFileId,
  metadata,
  alt,
  className
}: {
  metadataIndexFileId: string;
  metadata: FeedPlaybackMetadata;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasFeedPreviewPlayback(metadata)) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    void resolvePublicFeedObjectUrl(metadataIndexFileId, metadata, { variant: 'poster' })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [metadataIndexFileId, metadata]);

  if (failed || !src) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className || ''}`}>
        <Lock className="h-8 w-8 text-blue-400" />
      </div>
    );
  }

  return (
    <img src={src} alt={alt} className={className || 'w-full h-full object-cover'} />
  );
}
