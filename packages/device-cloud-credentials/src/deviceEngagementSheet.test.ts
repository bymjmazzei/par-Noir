import { describe, expect, it, vi } from 'vitest';
import { setDeviceFileLiked, upsertDeviceFollowing } from './deviceProduct.js';

describe('device like and follow sheets', () => {
  it('writes a like on the liker sheet and never calls the par Noir API', async () => {
    const writes: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('sheets.googleapis.com');
      expect(String(url)).not.toContain('api.parnoir.com');
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ values: [['file-a', '2026-01-01T00:00:00.000Z']] }), {
          status: 200,
        });
      }
      writes.push(String(init.body));
      return new Response('{}', { status: 200 });
    });

    await setDeviceFileLiked(
      'google-token',
      'sheet-engagement',
      'file-b',
      true,
      fetchImpl as unknown as typeof fetch
    );

    expect(writes[0]).toContain('file-a');
    expect(writes[0]).toContain('file-b');
  });

  it('records a follow on the follower sheet', async () => {
    const writes: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('sheets.googleapis.com');
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      writes.push(String(init.body));
      return new Response('{}', { status: 200 });
    });

    await upsertDeviceFollowing(
      'google-token',
      'sheet-followers',
      'feed',
      'feed-1',
      fetchImpl as unknown as typeof fetch
    );

    expect(writes[0]).toContain('feed');
    expect(writes[0]).toContain('feed-1');
  });
});
