import { describe, expect, it, vi } from 'vitest';
import { createSpreadsheetInFolder, ensureSpreadsheetInFolder } from './deviceSpreadsheetInit.js';
import { METADATA_SPECS } from './deviceMetadataSheetCatalog.js';

describe('deviceSpreadsheetInit', () => {
  it('creates a spreadsheet with Files tab and header row', async () => {
    const bodies: unknown[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('sheets.googleapis.com/v4/spreadsheets') && init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ spreadsheetId: 'sheet-1' }), { status: 200 });
      }
      if (u.includes('fields=parents')) {
        return new Response(JSON.stringify({ parents: ['root'] }), { status: 200 });
      }
      if (u.includes('drive/v3/files') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'sheet-1' }), { status: 200 });
      }
      if (u.includes('/values/')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });

    const spec = METADATA_SPECS['owner-file-index'];
    const id = await createSpreadsheetInFolder('tok', 'meta-folder', spec, fetchImpl as unknown as typeof fetch);
    expect(id).toBe('sheet-1');
    const createBody = bodies[0] as { sheets?: Array<{ properties?: { title?: string } }> };
    expect(createBody.sheets?.[0]?.properties?.title).toBe('Files');
    const valueCall = fetchImpl.mock.calls.find((c) => String(c[0]).includes('/values/Files'));
    expect(valueCall).toBeTruthy();
  });

  it('returns existing spreadsheet without create', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('drive/v3/files?') && !init?.method) {
        return new Response(
          JSON.stringify({ files: [{ id: 'existing', name: 'connections.xlsx' }] }),
          { status: 200 }
        );
      }
      throw new Error(`unexpected ${url}`);
    });
    const id = await ensureSpreadsheetInFolder(
      'tok',
      'meta',
      METADATA_SPECS.connections,
      fetchImpl as unknown as typeof fetch
    );
    expect(id).toBe('existing');
    expect(fetchImpl.mock.calls.some((c) => String(c[0]).includes('spreadsheets'))).toBe(false);
  });
});
