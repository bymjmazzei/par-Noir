import { describe, expect, it, vi } from 'vitest';
import { appendSheetValues, readSheetValues } from './deviceSheet.js';

describe('deviceSheet', () => {
  it('reads a layout sheet from Google and never calls the par Noir API', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('sheets.googleapis.com');
      expect(String(url)).toContain('sheet-connections');
      expect(String(url)).not.toContain('api.parnoir.com');
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer google-token');
      expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
      return new Response(JSON.stringify({ values: [['conn-1', 'pn-peer', 'accepted']] }), { status: 200 });
    });
    const rows = await readSheetValues(
      'google-token',
      'sheet-connections',
      'Connections!A2:H',
      fetchImpl as unknown as typeof fetch
    );
    expect(rows[0]?.[0]).toBe('conn-1');
  });

  it('appends to an existing spreadsheet id', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).not.toContain('/v4/spreadsheets?');
      expect(String(url)).toContain('sheet-connections');
      return new Response('{}', { status: 200 });
    });
    await appendSheetValues(
      'google-token',
      'sheet-connections',
      'Connections!A:H',
      [['conn-2', 'pn-peer', 'pending_sent', '2026-01-01T00:00:00.000Z', '', '', '', '']],
      fetchImpl as unknown as typeof fetch
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
