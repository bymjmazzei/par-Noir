import { describe, expect, it, vi } from 'vitest';
import { deviceDriveCall } from './deviceDriveCall';

describe('deviceDriveCall', () => {
  it('lists files against Google and does not call the par Noir API', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('https://www.googleapis.com/drive/v3/files');
      expect(String(url)).not.toContain('api.parnoir.com');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer google-at');
      expect(headers.get('X-PN-Cloud-Access-Token')).toBeNull();
      return new Response(JSON.stringify({ files: [{ id: 'f1', name: 'a.txt' }] }), { status: 200 });
    });

    const res = await deviceDriveCall('GET', '/api/drive/files?q=trashed%3Dfalse&pageSize=10', undefined, {
      accessToken: 'google-at',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { files: Array<{ id: string }> };
    expect(body.files[0].id).toBe('f1');
  });

  it('refuses a file upload that does not name a parent folder', async () => {
    const fetchImpl = vi.fn();
    const res = await deviceDriveCall(
      'POST',
      '/api/drive/files',
      { fileData: 'YQ==', fileName: 'a.txt' },
      { accessToken: 'google-at', fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
