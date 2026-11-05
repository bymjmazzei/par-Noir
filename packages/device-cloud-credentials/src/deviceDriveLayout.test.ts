import { describe, expect, it, vi } from 'vitest';
import { pnDriveRootFolderName } from '@par-noir/user-owned-storage';
import { DEVICE_DRIVE_LAYOUT_TOTAL_STEPS, ensureDeviceDriveLayout } from './deviceDriveLayout.js';

const PN = `pn-${'ab'.repeat(32)}`;

describe('ensureDeviceDriveLayout', () => {
  it('creates a short-named root tagged with the pN id, reports every step, and never calls the API', async () => {
    const rootCreates: Array<{ name?: string; appProperties?: Record<string, string> }> = [];
    let n = 0;
    const sheetCreates: Array<{ id: string; name?: string; parents?: string[] }> = [];
    const tabSetups: Record<string, { requests?: unknown[] }> = {};
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain('api.parnoir.com');
      const urlStr = String(url);
      expect(urlStr.endsWith('/v4/spreadsheets')).toBe(false);
      if (urlStr.includes('drive/v3/files?') && (!init || init.method === undefined || init.method === 'GET')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      n += 1;
      const id = `id-${n}`;
      const batch = urlStr.match(/\/v4\/spreadsheets\/([^/:?]+):batchUpdate/);
      if (batch && init?.method === 'POST') {
        tabSetups[decodeURIComponent(batch[1]!)] = JSON.parse(String(init.body));
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (urlStr.includes('/values/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (urlStr.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      if (urlStr.includes('/upload/')) {
        return new Response(JSON.stringify({ id }), { status: 200 });
      }
      if (init?.method === 'POST' && urlStr.includes('drive/v3/files')) {
        const body = JSON.parse(String(init.body)) as {
          name?: string;
          mimeType?: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };
        if (!body.parents?.length) rootCreates.push(body);
        if (body.mimeType === 'application/vnd.google-apps.spreadsheet') {
          sheetCreates.push({ id, name: body.name, parents: body.parents });
        }
        return new Response(JSON.stringify({ id, name: body.name }), { status: 200 });
      }
      return new Response(JSON.stringify({ id, files: [] }), { status: 200 });
    });

    const progress: Array<{ done: number; total: number }> = [];
    const layout = await ensureDeviceDriveLayout(
      'google-token',
      PN,
      fetchImpl as unknown as typeof fetch,
      (p) => progress.push(p)
    );
    expect(layout.pnFolderId).toBeTruthy();
    expect(rootCreates).toEqual([
      { name: 'par Noir abababab', mimeType: 'application/vnd.google-apps.folder', appProperties: { pnId: PN } },
    ]);
    expect(pnDriveRootFolderName(PN)).toBe('par Noir abababab');
    expect(progress.map((p) => p.done)).toEqual(
      Array.from({ length: DEVICE_DRIVE_LAYOUT_TOTAL_STEPS }, (_, i) => i + 1)
    );
    expect(progress.every((p) => p.total === DEVICE_DRIVE_LAYOUT_TOTAL_STEPS)).toBe(true);
    expect(layout.metadataFolderId).toBeTruthy();
    expect(layout.messagesFolderId).toBeTruthy();
    expect(layout.sheetIds.connections).toBeTruthy();
    expect(layout.inboxSheetId).toBeTruthy();
    expect(layout.filesFolderId).toBeTruthy();
    expect(sheetCreates.length).toBeGreaterThan(0);
    expect(sheetCreates.every((s) => (s.parents?.length ?? 0) > 0)).toBe(true);
    const indexCreate = sheetCreates.find((s) => s.name === 'owner-file-index.xlsx');
    const firstTab = tabSetups[indexCreate!.id]?.requests?.[0] as {
      updateSheetProperties?: { properties?: { title?: string } };
    };
    expect(firstTab?.updateSheetProperties?.properties?.title).toBe('Files');
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('/values/Files'))).toBe(true);
    const auth = (fetchImpl.mock.calls.find((c) => String(c[0]).includes('drive'))?.[1] as RequestInit)
      ?.headers as Headers;
    expect(auth?.get?.('Authorization') ?? (auth as Record<string, string>)?.Authorization).toBe(
      'Bearer google-token'
    );
  });

  it('reuses the root found by its pnId tag, whatever its name', async () => {
    const existingRoot = 'existing-root-id';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/files?') && (!init || !init.method)) {
        const q = new URL(urlStr).searchParams.get('q') || '';
        if (q.includes(`appProperties has { key='pnId' and value='${PN}' }`)) {
          return new Response(JSON.stringify({ files: [{ id: existingRoot, name: 'renamed by owner' }] }), {
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
      const body = JSON.parse(String((c[1] as RequestInit).body)) as { parents?: string[] };
      return !body.parents?.length;
    });
    expect(rootCreates.length).toBe(0);
  });
});
