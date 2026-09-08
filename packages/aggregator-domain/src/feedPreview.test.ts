import { describe, expect, it } from 'vitest';
import {
  effectivePublishTier,
  getPublishTier,
  PUBLISH_TIER_NOTCHES,
  requirePublicImageFeedPreviews,
  requirePublicVideoFeedPreviews,
  validateFeedPreviewByteSize,
  FEED_PREVIEW_SD_MAX_BYTES,
} from './feedPreview';

describe('feedPreview tiers', () => {
  it('has $9 floor then $20 with no orphan between', () => {
    const paid = PUBLISH_TIER_NOTCHES.filter((n) => n.retailUsd > 0);
    expect(paid[0]?.retailUsd).toBe(9);
    expect(paid[1]?.retailUsd).toBe(20);
    expect(getPublishTier('floor').uploadBytesPerMonth).toBe(1 * 1024 * 1024 * 1024);
    expect(getPublishTier('average_creator').maxDurationSec).toBe(180);
  });

  it('soft-degrades to free ceilings when GB exhausted', () => {
    const plan = getPublishTier('average_creator');
    const degraded = effectivePublishTier({
      planId: 'average_creator',
      gbUsedBytes: plan.uploadBytesPerMonth,
    });
    expect(degraded.maxDurationSec).toBe(60);
    expect(degraded.allowHd).toBe(false);
    expect(degraded.retailUsd).toBe(20);
  });
});

describe('feedPreview byte validation', () => {
  it('rejects SD over hard max', () => {
    const r = validateFeedPreviewByteSize('sd', FEED_PREVIEW_SD_MAX_BYTES + 1);
    expect(r.ok).toBe(false);
  });

  it('requires poster+sd+canonical for public video', () => {
    expect(
      requirePublicVideoFeedPreviews({
        feedPoster: { contentType: 'image/jpeg', byteSize: 1000, r2Key: 'p' },
        feedPreviewSd: {
          contentType: 'video/mp4',
          byteSize: 1000,
          r2Key: 's',
          ownerObjectId: 'oid',
        },
      }).ok
    ).toBe(true);
    expect(
      requirePublicVideoFeedPreviews({
        feedPoster: { contentType: 'image/jpeg', byteSize: 1000 },
        feedPreviewSd: { contentType: 'video/mp4', byteSize: 1000 },
      }).ok
    ).toBe(false);
  });

  it('requires poster for images', () => {
    expect(
      requirePublicImageFeedPreviews({
        feedPoster: { contentType: 'image/jpeg', byteSize: 1000 },
      }).ok
    ).toBe(true);
  });
});
