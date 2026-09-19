import { describe, expect, it } from 'vitest';
import {
  ContentExpiryError,
  isContentExpired,
  normalizeContentExpiry,
  shouldFlipExpiredToPrivate,
  shouldHideFromDiscoverFeed,
  shouldHideFromIndexerFeed
} from './contentExpiry';

describe('normalizeContentExpiry', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('omits expiry when neither expiresAt nor ttlSeconds provided', () => {
    expect(normalizeContentExpiry({}, now)).toEqual({
      expiresAt: null,
      persistOnDiscover: false
    });
  });

  it('maps ttlSeconds to expiresAt', () => {
    const result = normalizeContentExpiry({ ttlSeconds: 3600 }, now);
    expect(result.expiresAt).toBe('2026-06-01T13:00:00.000Z');
    expect(result.persistOnDiscover).toBe(false);
  });

  it('accepts future expiresAt and persistOnDiscover', () => {
    const result = normalizeContentExpiry(
      { expiresAt: '2026-06-02T00:00:00.000Z', persistOnDiscover: true },
      now
    );
    expect(result.expiresAt).toBe('2026-06-02T00:00:00.000Z');
    expect(result.persistOnDiscover).toBe(true);
  });

  it('rejects past expiresAt', () => {
    expect(() =>
      normalizeContentExpiry({ expiresAt: '2026-05-01T00:00:00.000Z' }, now)
    ).toThrow(ContentExpiryError);
  });

  it('rejects non-positive ttlSeconds', () => {
    expect(() => normalizeContentExpiry({ ttlSeconds: 0 }, now)).toThrow(ContentExpiryError);
  });

  it('ttlSeconds wins over expiresAt when both provided', () => {
    const result = normalizeContentExpiry(
      { ttlSeconds: 60, expiresAt: '2026-12-01T00:00:00.000Z' },
      now
    );
    expect(result.expiresAt).toBe('2026-06-01T12:01:00.000Z');
  });
});

describe('isContentExpired', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  it('false when null or missing', () => {
    expect(isContentExpired(null, now)).toBe(false);
    expect(isContentExpired(undefined, now)).toBe(false);
  });

  it('true when before now', () => {
    expect(isContentExpired('2026-06-01T11:59:59.000Z', now)).toBe(true);
  });

  it('false when in the future', () => {
    expect(isContentExpired('2026-06-01T12:00:01.000Z', now)).toBe(false);
  });
});

describe('feed visibility + private flip', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const past = '2026-06-01T11:00:00.000Z';
  const future = '2026-06-01T13:00:00.000Z';

  it('indexer hides expired regardless of persistOnDiscover', () => {
    expect(shouldHideFromIndexerFeed(past, now)).toBe(true);
    expect(shouldHideFromIndexerFeed(future, now)).toBe(false);
  });

  it('discover hides expired unless persistOnDiscover', () => {
    expect(shouldHideFromDiscoverFeed(past, false, now)).toBe(true);
    expect(shouldHideFromDiscoverFeed(past, true, now)).toBe(false);
    expect(shouldHideFromDiscoverFeed(future, false, now)).toBe(false);
  });

  it('flip when public expired without persist; skip when persist or private', () => {
    expect(shouldFlipExpiredToPrivate(true, past, false, now)).toBe(true);
    expect(shouldFlipExpiredToPrivate(true, past, true, now)).toBe(false);
    expect(shouldFlipExpiredToPrivate(false, past, false, now)).toBe(false);
    expect(shouldFlipExpiredToPrivate(true, future, false, now)).toBe(false);
  });
});
