import { describe, expect, it } from 'vitest';
import { FeedMediaSessionCache } from './feedMediaSessionCache';

describe('FeedMediaSessionCache', () => {
  it('get/set/has round-trip and touches LRU order', () => {
    const cache = new FeedMediaSessionCache(3, () => undefined);
    cache.set('a', 'poster', 'blob:a');
    cache.set('b', 'poster', 'blob:b');
    expect(cache.has('a', 'poster')).toBe(true);
    expect(cache.getObjectUrl('a', 'poster')).toBe('blob:a');
    expect(cache.keys()).toEqual(['b:poster', 'a:poster']); // a touched by get
  });

  it('evicts oldest on overflow and revokes object URLs', () => {
    const revoked: string[] = [];
    const cache = new FeedMediaSessionCache(2, (u) => revoked.push(u));
    cache.set('a', 'poster', 'blob:a');
    cache.set('b', 'sd', 'blob:b');
    cache.set('c', 'poster', 'blob:c');
    expect(cache.has('a', 'poster')).toBe(false);
    expect(cache.has('b', 'sd')).toBe(true);
    expect(cache.has('c', 'poster')).toBe(true);
    expect(revoked).toEqual(['blob:a']);
  });

  it('revoke(fileId) drops all variants', () => {
    const revoked: string[] = [];
    const cache = new FeedMediaSessionCache(10, (u) => revoked.push(u));
    cache.set('x', 'poster', 'blob:xp');
    cache.set('x', 'sd', 'blob:xs');
    cache.set('y', 'poster', 'blob:y');
    cache.revoke('x');
    expect(cache.has('x', 'poster')).toBe(false);
    expect(cache.has('x', 'sd')).toBe(false);
    expect(cache.has('y', 'poster')).toBe(true);
    expect(revoked.sort()).toEqual(['blob:xp', 'blob:xs']);
  });

  it('clear revokes everything', () => {
    const revoked: string[] = [];
    const cache = new FeedMediaSessionCache(10, (u) => revoked.push(u));
    cache.set('a', 'poster', 'blob:a');
    cache.set('b', 'poster', 'blob:b');
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(revoked.sort()).toEqual(['blob:a', 'blob:b']);
  });

  it('replacing same key revokes previous URL', () => {
    const revoked: string[] = [];
    const cache = new FeedMediaSessionCache(10, (u) => revoked.push(u));
    cache.set('a', 'poster', 'blob:old');
    cache.set('a', 'poster', 'blob:new');
    expect(cache.getObjectUrl('a', 'poster')).toBe('blob:new');
    expect(revoked).toEqual(['blob:old']);
  });
});
