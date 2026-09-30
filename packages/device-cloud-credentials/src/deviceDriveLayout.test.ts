import { describe, expect, it, vi } from 'vitest';
import { ensureDeviceDriveLayout } from './deviceDriveLayout.js';

describe('ensureDeviceDriveLayout', () => {
  it('creates folders and sheets on Google and never calls the par Noir API', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).not.toContain('api.parnoir.com');
      expect(String(url)).not.toContain('X-PN-Cloud-Access-Token');
      n += 1;
      const id = `id-${n}`;
      expect(String(url)).not.toContain('api.parnoir.com');
      if (String(url).includes('sheets.googleapis.com/v4/spreadsheets') && !String(url).includes('/values/')) {
        return new Response(JSON.stringify({ spreadsheetId: id }), { status: 200 });
      }
      if (String(url).includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      if (String(url).includes('/upload/')) {
        return new Response(JSON.stringify({ id }), { status: 200 });
      }
      return new Response(JSON.stringify({ id, files: [] }), { status: 200 });
    });

    const layout = await ensureDeviceDriveLayout('google-token', fetchImpl as unknown as typeof fetch);
    expect(layout.pnFolderId).toBe('id-1');
    expect(layout.metadataFolderId).toBe('id-2');
    expect(layout.sheetIds.connections).toBeTruthy();
    expect(layout.inboxSheetId).toBeTruthy();
    const auth = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(auth.get('Authorization')).toBe('Bearer google-token');
  });
});
