/**
 * Dashboard cabinet uploads go to files/, not the pN root.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('dashboard cabinet folder', () => {
  it('upload and make-public use ensureFilesFolder', () => {
    const upload = readFileSync(
      resolve(__dirname, '../components/storage/hooks/useDriveUpload.ts'),
      'utf8'
    );
    const share = readFileSync(
      resolve(__dirname, '../components/storage/hooks/share/togglePublicVisibility.ts'),
      'utf8'
    );
    const backend = readFileSync(
      resolve(__dirname, '../services/storage/GoogleDriveBackend.ts'),
      'utf8'
    );
    expect(upload).toContain('ensureFilesFolder');
    expect(share).toContain('ensureFilesFolder');
    expect(backend).toContain("getOrCreateFolder('files'");
    expect(backend).toContain('resolvedFolderId = await this.ensureFilesFolder(pnIdentifier)');
    expect(backend).toContain('Cabinet upload needs the files folder');
  });
});