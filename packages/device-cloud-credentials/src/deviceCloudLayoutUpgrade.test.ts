import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureDeviceInboxChannelColumn,
  MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
  MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2,
  runDeviceCloudLayoutMigration,
} from './deviceCloudLayoutUpgrade.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

const PN = 'pn-test';

function baseIndex(): DeviceDriveLayout {
  const sheetIds: Record<string, string> = { connections: 'sheet-conn' };
  return {
    schemaVersion: 1,
    pnFolderId: 'pn-root',
    metadataFolderId: 'meta',
    integratorsRootId: 'int',
    messagesFolderId: 'msg',
    inboxSheetId: 'inbox-sheet',
    sheetIds,
    conversationSheets: {},
  };
}

describe('deviceCloudLayoutUpgrade', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ensureDeviceInboxChannelColumn is a no-op when header already canonical', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('sheets.googleapis.com') && String(url).includes('/values/')) {
        return new Response(
          JSON.stringify({
            values: [
              [
                'participantPnIdentifier',
                'spreadsheetId',
                'connectionId',
                'lastMessageAt',
                'lastMessagePreview',
                'kemCiphertext',
                'threadType',
                'wrappedMessageRootKey',
                'channelClientId',
              ],
            ],
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await ensureDeviceInboxChannelColumn('tok', 'inbox-id', fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('values')).length).toBe(1);
  });

  it('runs v2 migration with empty root and calls persistIndex', async () => {
    const persistIndex = vi.fn(async () => undefined);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('www.googleapis.com/drive')) {
        if (href.includes('q=') && init?.method !== 'POST') {
          return new Response(JSON.stringify({ files: [] }), { status: 200 });
        }
        if (init?.method === 'POST') {
          const body = JSON.parse(String(init.body || '{}')) as { name?: string };
          return new Response(
            JSON.stringify({ id: `folder-${body.name}`, name: body.name }),
            { status: 200 }
          );
        }
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await runDeviceCloudLayoutMigration({
      migrationId: MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2,
      accessToken: 'google-token',
      index: baseIndex(),
      persistIndex,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(persistIndex).toHaveBeenCalledTimes(1);
    const saved = persistIndex.mock.calls[0]?.[0] as DeviceDriveLayout;
    expect(saved.filesFolderId).toBe('folder-files');
  });

  it('inbox migration calls sheets write when header missing', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('sheets.googleapis.com') && href.includes('/values/') && !init?.method) {
        return new Response(JSON.stringify({ values: [['short']] }), { status: 200 });
      }
      if (href.includes('sheets.googleapis.com') && init?.method === 'PUT') {
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await runDeviceCloudLayoutMigration({
      migrationId: MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
      accessToken: 'google-token',
      index: baseIndex(),
      persistIndex: async () => undefined,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(
      fetchMock.mock.calls.some(
        (c) => String(c[0]).includes('sheets.googleapis.com') && c[1]?.method === 'PUT'
      )
    ).toBe(true);
  });
});
