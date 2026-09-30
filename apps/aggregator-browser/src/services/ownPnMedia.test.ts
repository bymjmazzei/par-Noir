import { beforeEach, describe, expect, it, vi } from 'vitest';

const listDeviceOwnerFiles = vi.fn();
const sessionDriveFor = vi.fn();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceOwnerFiles: (...args: unknown[]) => listDeviceOwnerFiles(...args),
}));

vi.mock('./sessionDrive', () => ({
  sessionDriveFor: (pn: string) => sessionDriveFor(pn),
}));

import { loadOwnPnMedia } from './ownPnMedia';

describe('loadOwnPnMedia', () => {
  beforeEach(() => {
    listDeviceOwnerFiles.mockReset();
    sessionDriveFor.mockReset();
    sessionDriveFor.mockResolvedValue({
      accessToken: 'google-token',
      index: { sheetIds: { 'owner-file-index': 'sheet-owner' } },
    });
  });

  it('reads the device owner index and keeps media rows', async () => {
    listDeviceOwnerFiles.mockResolvedValue([
      {
        fileId: 'file-1',
        googleDriveFileId: 'drive-1',
        visibility: 'private',
        uploadedAt: '',
        entry: { fileName: 'a.png', mimeType: 'image/png' },
      },
      {
        fileId: 'file-2',
        googleDriveFileId: 'drive-2',
        visibility: 'private',
        uploadedAt: '',
        entry: { fileName: 'notes.txt', mimeType: 'text/plain' },
      },
    ]);

    const files = await loadOwnPnMedia('pn-self');
    expect(sessionDriveFor).toHaveBeenCalledWith('pn-self');
    expect(listDeviceOwnerFiles).toHaveBeenCalledWith('google-token', 'sheet-owner');
    expect(files.map((file) => file.fileId)).toEqual(['file-1']);
  });
});
