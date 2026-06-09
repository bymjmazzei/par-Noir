import {
  parseEncryptedFilePackage,
  reencryptDriveFilePackage,
} from './driveFiles';
import type { IdentityKeyMaterial } from './types';

export interface DriveFileMigrationItem {
  fileId: string;
  fileName: string;
  relativePath?: string;
}

export interface DriveFileMigrationCallbacks {
  listEncryptedFiles(): Promise<DriveFileMigrationItem[]>;
  download(fileId: string): Promise<string>;
  uploadReencrypted(fileId: string, pkgJson: string): Promise<void>;
  onProgress(done: number, total: number, current?: string): void;
}

export interface DriveFileMigrationResult {
  migrated: number;
  skipped: number;
  failed: Array<{ fileId: string; fileName: string; reason: string }>;
}

export async function migrateDriveEncryptedFiles(
  predecessor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>,
  successor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>,
  callbacks: DriveFileMigrationCallbacks
): Promise<DriveFileMigrationResult> {
  const files = await callbacks.listEncryptedFiles();
  const failed: DriveFileMigrationResult['failed'] = [];
  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    callbacks.onProgress(i, files.length, file.fileName);
    try {
      const raw = await callbacks.download(file.fileId);
      const pkg = parseEncryptedFilePackage(raw);
      if (!pkg) {
        skipped++;
        continue;
      }
      const reencrypted = await reencryptDriveFilePackage(pkg, predecessor, successor);
      await callbacks.uploadReencrypted(file.fileId, JSON.stringify(reencrypted));
      migrated++;
    } catch (e) {
      failed.push({
        fileId: file.fileId,
        fileName: file.fileName,
        reason: e instanceof Error ? e.message : 'encrypt_failed',
      });
      throw new Error(`Drive re-encrypt failed for ${file.fileName}`);
    }
  }

  callbacks.onProgress(files.length, files.length);
  return { migrated, skipped, failed };
}
