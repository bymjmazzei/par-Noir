import { describe, expect, it, vi } from 'vitest';
import { pnRootFolderName } from '@par-noir/user-owned-storage';
import {
  clearDeviceDriveLayoutInflight,
  ensureDeviceDriveLayout,
} from './deviceDriveLayout.js';

const PN = 'pn-abcdef123456';

describe('ensureDeviceDriveLayout in-flight dedup', () => {
  it('runs only one root create when two layout calls overlap', async () => {
    clearDeviceDriveLayoutInflight(PN);
    let rootCreates = 0;
    let n = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/files?') && (!init || !init.method)) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      n += 1;
      const id = `id-${n}`;
      if (urlStr.includes('sheets.googleapis.com/v4/spreadsheets') && init?.method === 'POST') {
        return new Response(JSON.stringify({ spreadsheetId: id }), { status: 200 });
      }
      if (urlStr.includes('/values/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (urlStr.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: [] }), { status: 200 });
      }
      if (init?.method === 'POST' && urlStr.includes('drive/v3/files')) {
        const body = JSON.parse(String(init.body)) as { name?: string; parents?: string[] };
        if (!body.parents?.length && body.name === pnRootFolderName(PN)) {
          rootCreates += 1;
          await new Promise((r) => setTimeout(r, 30));
        }
        return new Response(JSON.stringify({ id, name: body.name }), { status: 200 });
      }
      return new Response(JSON.stringify({ id, folder: { id }, file: { id } }), { status: 200 });
    });

    const [a, b] = await Promise.all([
      ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch),
      ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch),
    ]);
    expect(a.pnFolderId).toBe(b.pnFolderId);
    expect(rootCreates).toBe(1);
    clearDeviceDriveLayoutInflight(PN);
  });
});
