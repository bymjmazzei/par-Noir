import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDriveChildState } from './driveChild.js';
import { createFakeDrive } from './driveFake.testkit.js';
import { writeLiveSnapshotFile, writePenDocFiles } from './penDriveTree.js';

describe('penDriveTree concurrent writes', () => {
  let drive: ReturnType<typeof createFakeDrive>;

  beforeEach(() => {
    clearDriveChildState();
    drive = createFakeDrive();
    vi.stubGlobal('fetch', drive.fetchImpl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('autosave, bootstrap and live snapshot leave one folder and one file of each', async () => {
    const write = (n: number) =>
      writePenDocFiles({
        accessToken: 'tok',
        pnFolderId: 'pn',
        docId: 'pen_1',
        manifest: { n },
        draft: { id: 'd1', draft: { n }, sections: [{ slug: 'intro', ciphertext: `c${n}` }] },
      });
    await Promise.all([
      write(1),
      write(2),
      writeLiveSnapshotFile({ accessToken: 'tok', pnFolderId: 'pn', docId: 'pen_1', sealedJson: '{}' }),
      write(3),
    ]);

    const penRoots = drive.children('pn', 'par-noir-pen');
    expect(penRoots).toHaveLength(1);
    const docFolders = drive.children(penRoots[0]!.id);
    const docFolder = docFolders.find((f) => f.mimeType === 'application/vnd.google-apps.folder');
    expect(docFolders.filter((f) => f.mimeType === 'application/vnd.google-apps.folder')).toHaveLength(1);

    const docId = docFolder!.id;
    expect(drive.children(docId, 'drafts')).toHaveLength(1);
    expect(drive.children(docId, 'doc.json')).toHaveLength(1);
    expect(drive.children(docId, 'doc.json')[0]!.content).toBe('{"n":3}');
    expect(drive.children(docId, 'live.ysnap')).toHaveLength(1);

    const drafts = drive.children(docId, 'drafts')[0]!.id;
    expect(drive.children(drafts, 'd1')).toHaveLength(1);
  });
});
