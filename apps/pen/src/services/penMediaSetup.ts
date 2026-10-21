import { configurePenMedia } from '@par-noir/pen-media';
import { loadDocKey, mintDocKey } from './penDocCrypto';
import { ensureDocChildFolder } from '@par-noir/device-cloud-credentials';
import { penSessionDrive } from './penDriveLibrary';

configurePenMedia({
  loadDocKey,
  mintDocKey,
  resolveUploadFolder: async (pnIdentifier, docId) => {
    const drive = await penSessionDrive(pnIdentifier);
    return ensureDocChildFolder(drive.accessToken, drive.index.pnFolderId, docId, 'media');
  }
});
