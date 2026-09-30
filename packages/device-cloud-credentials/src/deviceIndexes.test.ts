import { describe, expect, it, vi } from 'vitest';
import {
  listDeviceActivities,
  listDeviceOwnerFiles,
  replaceIdentityInCell,
  upsertDeviceOwnerFile,
} from './deviceIndexes.js';

describe('device index sheets', () => {
  it('reads the owner file index from Google and never calls the API', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain('spreadsheets/sheet-owner/');
      expect(String(url)).toContain('Files');
      expect(String(url)).not.toContain('api.parnoir.com');
      return new Response(
        JSON.stringify({
          values: [['file-1', 'drive-1', 'private', '2026-01-01', '{"fileName":"a.png","mimeType":"image/png"}']],
        }),
        { status: 200 }
      );
    });
    const files = await listDeviceOwnerFiles('google-token', 'sheet-owner', fetchImpl as unknown as typeof fetch);
    expect(files[0]?.googleDriveFileId).toBe('drive-1');
    expect(files[0]?.entry.mimeType).toBe('image/png');
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer google-token');
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
  });

  it('appends a new owner index row to Google', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain('api.parnoir.com');
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      expect(String(url)).toContain(':append');
      const body = JSON.parse(String(init.body)) as { values: string[][] };
      expect(body.values[0]?.[0]).toBe('file-2');
      return new Response('{}', { status: 200 });
    });
    await upsertDeviceOwnerFile(
      'google-token',
      'sheet-owner',
      {
        fileId: 'file-2',
        googleDriveFileId: 'drive-2',
        visibility: 'public',
        uploadedAt: '2026-01-02',
        entry: { fileName: 'b.png' },
      },
      fetchImpl as unknown as typeof fetch
    );
  });

  it('reads the activity ledger from Google and never calls the API', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain('spreadsheets/sheet-activity/');
      expect(String(url)).toContain('Activities');
      expect(String(url)).not.toContain('api.parnoir.com');
      return new Response(
        JSON.stringify({
          values: [['act-1', 'pn-self', 'like', 'file', 'pn-target', 'pn-actor', '{}', '2026-01-01']],
        }),
        { status: 200 }
      );
    });
    const rows = await listDeviceActivities('google-token', 'sheet-activity', fetchImpl as unknown as typeof fetch);
    expect(rows[0]?.activity_type).toBe('like');
  });

  it('rewrites predecessor pn and did strings in a cell', () => {
    expect(replaceIdentityInCell('pn-old and old', 'pn-old', 'pn-new')).toBe('pn-new and new');
    expect(replaceIdentityInCell('did:old', 'pn-old', 'pn-new', 'did:old', 'did:new')).toBe('did:new');
  });
});
