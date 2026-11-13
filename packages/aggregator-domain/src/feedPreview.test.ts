import { describe, expect, it } from 'vitest';
import {
  getPublishTier,
  PUBLISH_TIER_NOTCHES,
  requirePublicImageFeedPreviews,
  requirePublicVideoFeedPreviews,
  validateFeedPreviewByteSize,
  validateFeedPreviewDuration,
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
    expect(getPublishTier('average_creator').maxDurationSec).toBe(180);
  });

  it('limits plans per post only, with no monthly allowance', () => {
    for (const n of PUBLISH_TIER_NOTCHES) {
      expect(n).not.toHaveProperty('uploadBytesPerMonth');
    }
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

describe('feedPreview duration validation', () => {
  const free = getPublishTier('free');
  const limitMs = free.maxDurationSec * 1000;

  it('accepts a video within the plan, including a last frame that rounds over', () => {
    expect(validateFeedPreviewDuration('sd', 'video/mp4', 12_000, free).ok).toBe(true);
    expect(validateFeedPreviewDuration('hd', 'video/mp4', limitMs + 33, free).ok).toBe(true);
  });

  it('rejects a video longer than the plan', () => {
    expect(validateFeedPreviewDuration('sd', 'video/webm', limitMs + 1000, free)).toEqual({
      ok: false,
      error: 'exceeds_tier_max_duration',
    });
  });

  it('requires a length on video previews', () => {
    expect(validateFeedPreviewDuration('sd', 'video/mp4', undefined, free)).toEqual({
      ok: false,
      error: 'duration_required',
    });
  });

  it('ignores posters and non-video files', () => {
    expect(validateFeedPreviewDuration('poster', 'image/jpeg', undefined, free).ok).toBe(true);
    expect(validateFeedPreviewDuration('sd', 'image/webp', undefined, free).ok).toBe(true);
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
