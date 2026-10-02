import { describe, expect, it, vi } from 'vitest';
import { ensureOwnerBlobFolders } from './ownerBlobFolders.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

function index(partial: Partial<DeviceDriveLayout> = {}): DeviceDriveLayout {
  return {
    schemaVersion: 1,
    pnFolderId: 'pn',
    metadataFolderId: 'meta',
    integratorsRootId: 'int',
    messagesFolderId: 'msg',
    inboxSheetId: 'inbox',
    sheetIds: {},
    conversationSheets: {},
    ...partial,
  };
}

describe('ensureOwnerBlobFolders', () => {
  it('returns indexed ids without calling Drive', async () => {
    const fetchImpl = vi.fn();
    const folders = await ensureOwnerBlobFolders(
      'tok',
      index({
        filesFolderId: 'files',
        contentFolderId: 'content',
        contentNotesFolderId: 'notes',
        contentMediaFolderId: 'media',
        contentCollectionsFolderId: 'collections',
      }),
      fetchImpl as unknown as typeof fetch
    );
    expect(folders.filesFolderId).toBe('files');
    expect(folders.contentNotesFolderId).toBe('notes');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('creates files and content class folders under the pN root', async () => {
    let n = 0;
    const created: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') {
        n += 1;
        const body = JSON.parse(String(init.body)) as { name?: string; parents?: string[] };
        created.push(`${body.name}@${body.parents?.[0]}`);
        return new Response(JSON.stringify({ id: `new-${n}` }), { status: 200 });
      }
      expect(u).toContain('googleapis.com');
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    const folders = await ensureOwnerBlobFolders(
      'tok',
      index(),
      fetchImpl as unknown as typeof fetch
    );
    expect(folders.filesFolderId).toBe('new-1');
    expect(created[0]).toBe('files@pn');
    expect(created[1]).toBe('content@pn');
    expect(created).toContain('notes@new-2');
    expect(created).toContain('media@new-2');
    expect(created).toContain('collections@new-2');
    expect(folders.contentMediaFolderId).not.toBe('pn');
  });
});