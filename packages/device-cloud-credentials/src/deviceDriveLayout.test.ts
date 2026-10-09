import { describe, expect, it, vi } from 'vitest';
import { pnRootFolderName } from '@par-noir/user-owned-storage';
import { ensureDeviceDriveLayout } from './deviceDriveLayout.js';

const PN = 'pn-abcdef123456';

describe('ensureDeviceDriveLayout', () => {
  it('searches for the canonical root, creates par-noir-pn-* layout, and never calls the API', async () => {
    const createdRoots: string[] = [];
    let n = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain('api.parnoir.com');
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/files?') && (!init || init.method === undefined || init.method === 'GET')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      n += 1;
      const id = `id-${n}`;
      if (urlStr.includes('sheets.googleapis.com/v4/spreadsheets') && !urlStr.includes('/values/')) {
        return new Response(JSON.stringify({ spreadsheetId: id }), { status: 200 });
      }
      if (urlStr.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      if (urlStr.includes('/upload/')) {
        return new Response(JSON.stringify({ id }), { status: 200 });
      }
      if (init?.method === 'POST' && urlStr.includes('drive/v3/files')) {
        const body = JSON.parse(String(init.body)) as { name?: string };
        if (!body.name?.includes('/')) {
          createdRoots.push(body.name || '');
        }
        return new Response(JSON.stringify({ id, name: body.name }), { status: 200 });
      }
      return new Response(JSON.stringify({ id, files: [] }), { status: 200 });
    });

    const layout = await ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch);
    expect(layout.pnFolderId).toBeTruthy();
    expect(createdRoots[0]).toBe(pnRootFolderName(PN));
    expect(createdRoots).not.toContain('par Noir');
    expect(layout.metadataFolderId).toBeTruthy();
    expect(layout.messagesFolderId).toBeTruthy();
    expect(layout.sheetIds.connections).toBeTruthy();
    expect(layout.inboxSheetId).toBeTruthy();
    expect(layout.filesFolderId).toBeTruthy();
    const auth = (fetchImpl.mock.calls.find((c) => String(c[0]).includes('drive'))?.[1] as RequestInit)
      ?.headers as Headers;
    expect(auth?.get?.('Authorization') ?? (auth as Record<string, string>)?.Authorization).toBe(
      'Bearer google-token'
    );
  });

  it('reuses an existing canonical root without creating par Noir', async () => {
    const existingRoot = 'existing-root-id';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/files?') && (!init || !init.method)) {
        const q = decodeURIComponent(urlStr.split('q=')[1]?.split('&')[0] || '');
        if (q.includes(pnRootFolderName(PN))) {
          return new Response(JSON.stringify({ files: [{ id: existingRoot, name: pnRootFolderName(PN) }] }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      if (urlStr.includes('sheets.googleapis.com')) {
        return new Response(JSON.stringify({ spreadsheetId: 'sheet-1' }), { status: 200 });
      }
      if (urlStr.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'child', folder: { id: 'child' }, file: { id: 'child' } }), {
        status: 200,
      });
    });

    const layout = await ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch);
    expect(layout.pnFolderId).toBe(existingRoot);
    const rootCreates = fetchImpl.mock.calls.filter((c) => {
      if ((c[1] as RequestInit)?.method !== 'POST' || !String(c[0]).includes('drive/v3/files')) return false;
      const body = JSON.parse(String((c[1] as RequestInit).body)) as { name?: string };
      return body.name === pnRootFolderName(PN) || body.name === 'par Noir';
    });
    expect(rootCreates.length).toBe(0);
  });
});
