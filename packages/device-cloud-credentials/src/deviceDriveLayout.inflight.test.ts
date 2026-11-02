import { describe, expect, it, vi } from 'vitest';
import { pnDriveRootFolderName } from '@par-noir/user-owned-storage';
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
        if (!body.parents?.length && body.name === pnDriveRootFolderName(PN)) {
          rootCreates += 1;
          await new Promise((r) => setTimeout(r, 30));
        }
        return new Response(JSON.stringify({ id, name: body.name }), { status: 200 });
      }
      return new Response(JSON.stringify({ id, folder: { id }, file: { id } }), { status: 200 });
    });

    const first: number[] = [];
    const joined: number[] = [];
    const [a, b] = await Promise.all([
      ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch, (p) =>
        first.push(p.done)
      ),
      ensureDeviceDriveLayout('google-token', PN, fetchImpl as unknown as typeof fetch, (p) =>
        joined.push(p.done)
      ),
    ]);
    expect(a.pnFolderId).toBe(b.pnFolderId);
    expect(rootCreates).toBe(1);
    expect(joined.length).toBeGreaterThan(0);
    expect(joined.at(-1)).toBe(first.at(-1));
    clearDeviceDriveLayoutInflight(PN);
  });
});
