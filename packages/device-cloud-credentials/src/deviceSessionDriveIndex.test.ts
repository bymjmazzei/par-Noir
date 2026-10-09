import { describe, expect, it, vi } from 'vitest';
import { pnRootFolderName } from '@par-noir/user-owned-storage';
import { ensureSessionDriveIndex } from './deviceSocial.js';
import { clearAllSessionCloudCredentials } from './sessionMemory.js';

const PN = 'pn-testindex0001';

describe('ensureSessionDriveIndex', () => {
  it('passes pn id into layout init so reconnect searches canonical root', async () => {
    clearAllSessionCloudCredentials();
    const fetchImpl = vi.fn(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/files?')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (urlStr.includes('sheets.googleapis.com')) {
        return new Response(JSON.stringify({ spreadsheetId: 'sheet' }), { status: 200 });
      }
      if (urlStr.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'new-id', folder: { id: 'new-id' }, file: { id: 'new-id' } }), {
        status: 200,
      });
    });

    const layout = await ensureSessionDriveIndex({
      identityId: PN,
      accessToken: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(layout.pnFolderId).toBeTruthy();
    const searchCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes('drive/v3/files?'));
    expect(String(searchCall?.[0])).toContain(encodeURIComponent(pnRootFolderName(PN)));
  });
});
