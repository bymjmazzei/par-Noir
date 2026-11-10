import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
const deviceFileIndex = vi.fn(() => ({ list }));
const sessionSocialFor = vi.fn();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  deviceFileIndex: (...args: unknown[]) => deviceFileIndex(...(args as [])),
}));

vi.mock('./sessionSocial', () => ({
  sessionSocialFor: (pn: string) => sessionSocialFor(pn),
}));

import { loadOwnPnMedia } from './ownPnMedia';

describe('loadOwnPnMedia', () => {
  beforeEach(() => {
    list.mockReset();
    deviceFileIndex.mockClear();
    sessionSocialFor.mockReset();
    sessionSocialFor.mockResolvedValue({ kind: 'google_drive' });
  });

  it('reads the owner index on the pN cloud and keeps media rows', async () => {
    list.mockResolvedValue([
      { fileId: 'file-1', googleDriveFileId: 'drive-1', fileName: 'a.png', mimeType: 'image/png' },
      { fileId: 'file-2', googleDriveFileId: 'drive-2', fileName: 'notes.txt', mimeType: 'text/plain' },
    ]);

    const files = await loadOwnPnMedia('pn-self');
    expect(sessionSocialFor).toHaveBeenCalledWith('pn-self');
    expect(deviceFileIndex).toHaveBeenCalledWith({ kind: 'google_drive' }, 'owner');
    expect(files.map((file) => file.fileId)).toEqual(['file-1']);
  });
});
