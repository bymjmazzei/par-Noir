import { describe, expect, it, vi } from 'vitest';
import { appendPublicIndexRow, listDeviceConnections, listDeviceGroups, listDeviceInbox, upsertDeviceConnection } from './deviceSocial.js';
import { listDeviceNotifications } from './deviceProduct.js';

describe('device connection sheet', () => {
  it('writes an accept onto the connections sheet and does not call the API', async () => {
    const rows: string[][] = [['conn-1', 'pn-peer', 'pending_received', '2026-01-01T00:00:00.000Z', '', '', '', '']];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).not.toContain('api.parnoir.com');
      expect(String(url)).toContain('sheet-connections');
      const headers = init?.headers as Record<string, string>;
      expect(headers?.['X-PN-Cloud-Access-Token']).toBeUndefined();
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ values: rows }), { status: 200 });
      }
      const body = JSON.parse(String(init.body)) as { values: string[][] };
      expect(body.values[0]?.[2]).toBe('accepted');
      expect(headers.Authorization).toBe('Bearer google-token');
      return new Response('{}', { status: 200 });
    });

    await upsertDeviceConnection(
      'google-token',
      'sheet-connections',
      {
        connectionId: 'conn-1',
        userPnIdentifier: 'pn-peer',
        status: 'accepted',
        createdAt: '2026-01-01T00:00:00.000Z',
        acceptedAt: '2026-01-02T00:00:00.000Z',
        kemCiphertext: 'ct',
      },
      fetchImpl as unknown as typeof fetch
    );

    const listed = await listDeviceConnections(
      'google-token',
      'sheet-connections',
      fetchImpl as unknown as typeof fetch
    );
    expect(listed[0]?.connectionId).toBe('conn-1');
  });

  it('reads the inbox from the layout spreadsheet and never calls the API', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain('spreadsheets/sheet-inbox/');
      expect(String(url)).not.toContain('api.parnoir.com');
      return new Response(
        JSON.stringify({
          values: [['pn-peer', 'sheet-thread', 'conn-1', '2026-01-01T00:00:00.000Z', 'hi', '', 'dm', '', '']],
        }),
        { status: 200 }
      );
    });
    const threads = await listDeviceInbox('google-token', 'sheet-inbox', fetchImpl as unknown as typeof fetch);
    expect(threads[0]?.spreadsheetId).toBe('sheet-thread');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reads the group list from the layout spreadsheet and never calls the API', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('spreadsheets/sheet-groups/');
      expect(String(url)).not.toContain('api.parnoir.com');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['X-PN-Cloud-Access-Token']).toBeUndefined();
      return new Response(
        JSON.stringify({
          values: [['grp-1', 'pn-owner', 'Circle', '2026-01-01', 'pn-peer', 'readWrite', 'wrap', 'sheet-conv']],
        }),
        { status: 200 }
      );
    });
    const groups = await listDeviceGroups('google-token', 'sheet-groups', fetchImpl as unknown as typeof fetch);
    expect(groups[0]?.groupId).toBe('grp-1');
  });

  it('reads notifications from the layout spreadsheet and never calls the API', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('spreadsheets/sheet-notes/');
      expect(String(url)).not.toContain('api.parnoir.com');
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.['X-PN-Cloud-Access-Token']).toBeUndefined();
      return new Response(
        JSON.stringify({
          values: [['n-1', 'pn-me', 'new_message', 'Hi', 'body', '{}', 'false', '2026-01-01']],
        }),
        { status: 200 }
      );
    });
    const notes = await listDeviceNotifications(
      'google-token',
      'sheet-notes',
      fetchImpl as unknown as typeof fetch
    );
    expect(notes[0]?.notification_id).toBe('n-1');
    expect(notes[0]?.read).toBe(false);
  });

  it('appends a public index row only to the existing layout sheet', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('spreadsheets/sheet-public/');
      expect(String(url)).not.toContain('/v4/spreadsheets?');
      expect(String(url)).not.toContain('api.parnoir.com');
      const body = JSON.parse(String(init?.body)) as { values: string[][] };
      expect(JSON.parse(body.values[0][0]).fileId).toBe('file-1');
      return new Response('{}', { status: 200 });
    });
    await appendPublicIndexRow(
      'google-token',
      'sheet-public',
      { fileId: 'file-1', isPublic: true },
      fetchImpl as unknown as typeof fetch
    );
  });
});
