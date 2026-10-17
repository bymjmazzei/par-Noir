import { configurePenMedia } from '@par-noir/pen-media';
import { loadDocKey, mintDocKey } from './penDocCrypto';
import { ensureDocChildFolder, penSessionDrive } from './penDriveLibrary';

configurePenMedia({
  loadDocKey,
  mintDocKey,
  resolveUploadFolder: async (pnIdentifier, docId) => {
    const drive = await penSessionDrive(pnIdentifier);
    return ensureDocChildFolder(drive.accessToken, drive.index.pnFolderId, docId, 'media');
  }
});
