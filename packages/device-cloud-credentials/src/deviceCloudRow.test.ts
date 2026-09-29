import { describe, expect, it, vi } from 'vitest';
import { appendDeviceCloudRow } from './deviceCloudRow.js';
import { deviceDropboxCall } from './deviceProviderCall.js';

describe('device cloud writes', () => {
  it('appends a ciphertext row to an existing layout sheet', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('sheets.googleapis.com');
      expect(String(url)).toContain('sheet-1');
      expect(String(url)).not.toContain('api.parnoir.com');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer google-token');
      expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
      return new Response('{}', { status: 200 });
    });
    const result = await appendDeviceCloudRow(
      'google-token',
      { spreadsheetId: 'sheet-1', jobType: 'message_append', encryptedContent: 'ct' },
      fetchImpl as unknown as typeof fetch
    );
    expect(result).toEqual({ spreadsheetId: 'sheet-1', provider: 'google' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses to mint a new spreadsheet when the layout id is missing', async () => {
    const fetchImpl = vi.fn();
    await expect(
      appendDeviceCloudRow('google-token', { jobType: 'message_append' }, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/layout spreadsheet id/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('calls Dropbox from the device', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain('api.dropboxapi.com');
      expect(String(url)).not.toContain('api.parnoir.com');
      return new Response('{}', { status: 200 });
    });
    const res = await deviceDropboxCall('', { path: '' }, {
      accessToken: 'dbx',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(res.ok).toBe(true);
  });
});
