/**
 * Feed preview persist + redact + public-require gates (no live R2/DB).
 */
import {
  effectivePublishTier,
  getPublishTier,
  requirePublicImageFeedPreviews,
  requirePublicVideoFeedPreviews,
  validateFeedPreviewByteSize,
  FEED_PREVIEW_SD_MAX_BYTES,
} from '@par-noir/aggregator-domain';
import {
  redactFeedPreviewFieldsInMetadata,
  redactFeedPreviewForClient,
  validatePublicFeedPreviewRefs,
} from './feedPreviewClientRedact';

describe('feed preview publish requirements', () => {
  it('rejects SD over max bytes', () => {
    const r = validateFeedPreviewByteSize('sd', FEED_PREVIEW_SD_MAX_BYTES + 1);
    expect(r.ok).toBe(false);
  });

  it('requires canonical owner ref for public video', () => {
    expect(
      requirePublicVideoFeedPreviews({
        feedPoster: { contentType: 'image/jpeg', byteSize: 10, r2Key: 'p' },
        feedPreviewSd: { contentType: 'video/mp4', byteSize: 10, r2Key: 's' },
      }).ok
    ).toBe(false);
  });

  it('soft-degrades average_creator when GB exhausted', () => {
    const plan = getPublishTier('average_creator');
    const d = effectivePublishTier({
      planId: 'average_creator',
      gbUsedBytes: plan.uploadBytesPerMonth,
    });
    expect(d.maxDurationSec).toBe(60);
    expect(d.allowHd).toBe(false);
  });
});

describe('feed preview client redact + public require', () => {
  it('strips ownerPublicUrl from refs for clients', () => {
    const redacted = redactFeedPreviewForClient({
      contentType: 'image/jpeg',
      byteSize: 100,
      r2Key: 'feed/x/poster',
      ownerObjectId: 'oid',
      ownerPublicUrl: 'https://drive.example/secret',
    });
    expect(redacted?.r2Key).toBe('feed/x/poster');
    expect((redacted as any).ownerPublicUrl).toBeUndefined();
    expect(redacted?.ownerObjectId).toBe('oid');
  });

  it('redacts feed fields on metadata objects', () => {
    const meta = redactFeedPreviewFieldsInMetadata({
      fileId: 'f1',
      feedPoster: {
        contentType: 'image/jpeg',
        byteSize: 10,
        r2Key: 'p',
        ownerPublicUrl: 'https://secret',
      },
    });
    expect((meta.feedPoster as any).ownerPublicUrl).toBeUndefined();
    expect((meta.feedPoster as any).r2Key).toBe('p');
  });

  it('rejects public image without poster', () => {
    const r = validatePublicFeedPreviewRefs({
      isPublic: true,
      fileType: 'image',
      name: 'thumb_photo.jpg',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('feed_poster_required');
  });

  it('accepts public image with poster', () => {
    expect(
      validatePublicFeedPreviewRefs({
        isPublic: true,
        fileType: 'image',
        name: 'thumb_photo.jpg',
        feedPoster: { contentType: 'image/jpeg', byteSize: 10, r2Key: 'p' },
      }).ok
    ).toBe(true);
  });

  it('rejects public video without sd', () => {
    const r = validatePublicFeedPreviewRefs({
      isPublic: true,
      fileType: 'video',
      feedPoster: { contentType: 'image/jpeg', byteSize: 10, r2Key: 'p' },
    });
    expect(r.ok).toBe(false);
  });

  it('accepts public video with poster+sd+canonical', () => {
    expect(
      requirePublicVideoFeedPreviews({
        feedPoster: { contentType: 'image/jpeg', byteSize: 10, r2Key: 'p' },
        feedPreviewSd: {
          contentType: 'video/mp4',
          byteSize: 10,
          r2Key: 's',
          ownerObjectId: 'oid',
        },
      }).ok
    ).toBe(true);
  });

  it('skips private files', () => {
    expect(
      validatePublicFeedPreviewRefs({
        isPublic: false,
        fileType: 'image',
      }).ok
    ).toBe(true);
  });
});
