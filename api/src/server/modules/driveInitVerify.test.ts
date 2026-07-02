/**
 * @jest-environment node
 */
jest.mock('./pnDriveIndex', () => ({
  DriveIndexError: class DriveIndexError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'DriveIndexError';
      this.code = code;
    }
  },
}));

import { verifyPnDriveLayout } from './driveInitVerify';

const token = { access_token: 'test-token' };

function minimalIndex() {
  return {
    schemaVersion: 1 as const,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'integrators',
    messagesFolderId: 'messages',
    inboxSheetId: 'inbox',
    sheetIds: { connections: 'sheet-connections' },
    conversationSheets: {},
  };
}

describe('verifyPnDriveLayout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws DRIVE_LAYOUT_INCOMPLETE when a content-class owner sheet is missing', async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/files/') && !url.includes('?')) {
        return new Response(JSON.stringify({ trashed: false }), { status: 200 });
      }
      if (url.includes("name='media'") && url.includes('folder')) {
        return new Response(JSON.stringify({ files: [{ id: 'media-folder' }] }), { status: 200 });
      }
      if (url.includes("name='thoughts'")) {
        return new Response(JSON.stringify({ files: [{ id: 'thoughts-folder' }] }), { status: 200 });
      }
      if (url.includes("name='collections'")) {
        return new Response(JSON.stringify({ files: [{ id: 'collections-folder' }] }), { status: 200 });
      }
      if (url.includes('thoughts-owner-index')) {
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ files: [{ id: 'x' }] }), { status: 200 });
    }) as typeof fetch;

    await expect(verifyPnDriveLayout(token, minimalIndex(), 'pn-test', undefined)).rejects.toMatchObject({
      code: 'DRIVE_LAYOUT_INCOMPLETE',
    });
  });
});
