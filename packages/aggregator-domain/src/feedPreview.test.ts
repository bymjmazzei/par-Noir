import { describe, expect, it } from 'vitest';
import {
  effectivePublishTier,
  getPublishTier,
  PUBLISH_TIER_NOTCHES,
  requirePublicImageFeedPreviews,
  requirePublicVideoFeedPreviews,
  validateFeedPreviewByteSize,
  FEED_PREVIEW_SD_MAX_BYTES,
  FEED_PREVIEW_HD_MAX_BYTES,
  FEED_PREVIEW_HD_MAX_HEIGHT,
  feedPreviewBitrate,
  feedPreviewTargetSize,
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
    expect(degraded.allowHd).toBe(true);
    expect(degraded.maxHeight).toBe(1080);
    expect(degraded.retailUsd).toBe(20);
  });

  it('gives every tier 1080p HD', () => {
    for (const n of PUBLISH_TIER_NOTCHES) {
      expect(n.maxHeight).toBe(FEED_PREVIEW_HD_MAX_HEIGHT);
      expect(n.allowHd).toBe(true);
    }
  });
});

describe('feedPreview encode targets', () => {
  it('sizes portrait HD at 1080 and SD at 720 on every tier', () => {
    for (const n of PUBLISH_TIER_NOTCHES) {
      expect(feedPreviewTargetSize('hd', n, 9, 16)).toEqual({ w: 608, h: 1080 });
      expect(feedPreviewTargetSize('sd', n, 9, 16)).toEqual({ w: 406, h: 720 });
    }
    expect(feedPreviewTargetSize('hd', getPublishTier('free'), 16, 9)).toEqual({ w: 1920, h: 1080 });
  });

  it('clamps bitrate to the variant budget', () => {
    expect(feedPreviewBitrate('hd', 5)).toBe(6_000_000);
    const hd60 = feedPreviewBitrate('hd', 60);
    expect(hd60).toBeGreaterThan(4_500_000);
    expect(hd60).toBeLessThan(5_500_000);
    expect((hd60 * 60) / 8).toBeLessThan(FEED_PREVIEW_HD_MAX_BYTES);
    expect(feedPreviewBitrate('hd', 1800)).toBe(1_000_000);
    expect(feedPreviewBitrate('sd', 5)).toBe(1_200_000);
    expect(feedPreviewBitrate('sd', 1800)).toBe(250_000);
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
