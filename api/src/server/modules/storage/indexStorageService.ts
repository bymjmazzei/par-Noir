import type { GoogleDriveToken } from '../googleOAuth2Helper';
import type { IndexFileEntry } from '../indexSheetsService';
import { IndexSheetsService } from '../indexSheetsService';
import { isPortableStorageProvider } from './storageProviderUtils';
import {
  addIndexFilePortable,
  getIndexFileByIdPortable,
  getIndexFilesPortable,
  getIndexUpdatedAtPortable,
  setAllIndexFilesPortable,
  updateIndexFilePortable
} from './indexPortableService';

type ContentClassFolder = 'media' | 'thoughts' | 'collections';

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

async function sheetId(
  token: GoogleDriveToken,
  metadataFolderId: string,
  indexType: 'public' | 'owner',
  pnIdentifier: string,
  accountId: string | undefined,
  contentClass?: ContentClassFolder
): Promise<string> {
  return IndexSheetsService.getIndexSheet(
    token,
    metadataFolderId,
    indexType,
    pnIdentifier,
    accountId,
    contentClass
  );
}

export class IndexStorageService {
  static async getOwnerFileIndex(
    pnIdentifier: string,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string
  ): Promise<{ identifier: string; files: IndexFileEntry[]; updatedAt: string }> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      const { files } = await getIndexFilesPortable(normalized, 'owner', accountId);
      const updatedAt =
        (await getIndexUpdatedAtPortable(normalized, 'owner', accountId)) ??
        new Date().toISOString();
      return { identifier: normalized, files, updatedAt };
    }
    if (!token || !metadataFolderId) {
      return { identifier: normalized, files: [], updatedAt: new Date().toISOString() };
    }
    const spreadsheetId = await sheetId(token, metadataFolderId, 'owner', normalized, accountId);
    const { files } = await IndexSheetsService.getFiles(token, spreadsheetId, normalized, accountId);
    return { identifier: normalized, files, updatedAt: new Date().toISOString() };
  }

  static async getPublicFileIndex(
    pnIdentifier: string,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string
  ): Promise<{ identifier: string; files: IndexFileEntry[]; updatedAt: string }> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      const { files } = await getIndexFilesPortable(normalized, 'public', accountId, {
        visibility: 'public'
      });
      const updatedAt =
        (await getIndexUpdatedAtPortable(normalized, 'public', accountId)) ??
        new Date().toISOString();
      return { identifier: normalized, files, updatedAt };
    }
    if (!token || !metadataFolderId) {
      return { identifier: normalized, files: [], updatedAt: new Date().toISOString() };
    }
    const spreadsheetId = await sheetId(token, metadataFolderId, 'public', normalized, accountId);
    const { files } = await IndexSheetsService.getFiles(token, spreadsheetId, normalized, accountId, {
      visibility: 'public'
    });
    return { identifier: normalized, files, updatedAt: new Date().toISOString() };
  }

  static async getContentClassPublicIndex(
    pnIdentifier: string,
    contentClass: ContentClassFolder,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string
  ): Promise<{ identifier: string; files: IndexFileEntry[]; updatedAt: string } | null> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      const { files } = await getIndexFilesPortable(
        normalized,
        'public',
        accountId,
        undefined,
        contentClass
      );
      const updatedAt =
        (await getIndexUpdatedAtPortable(normalized, 'public', accountId, contentClass)) ??
        new Date().toISOString();
      return { identifier: normalized, files, updatedAt };
    }
    if (!token || !metadataFolderId) return null;
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      'public',
      normalized,
      accountId,
      contentClass
    );
    const { files } = await IndexSheetsService.getFiles(token, spreadsheetId, normalized, accountId);
    const updatedAt =
      (await IndexSheetsService.getUpdatedAt(token, spreadsheetId, normalized, accountId)) ??
      new Date().toISOString();
    return { identifier: normalized, files, updatedAt };
  }

  static async getContentClassOwnerIndex(
    pnIdentifier: string,
    contentClass: ContentClassFolder,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string
  ): Promise<{ identifier: string; files: IndexFileEntry[]; updatedAt: string } | null> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      const { files } = await getIndexFilesPortable(
        normalized,
        'owner',
        accountId,
        undefined,
        contentClass
      );
      const updatedAt =
        (await getIndexUpdatedAtPortable(normalized, 'owner', accountId, contentClass)) ??
        new Date().toISOString();
      return { identifier: normalized, files, updatedAt };
    }
    if (!token || !metadataFolderId) return null;
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      'owner',
      normalized,
      accountId,
      contentClass
    );
    const { files } = await IndexSheetsService.getFiles(token, spreadsheetId, normalized, accountId);
    const updatedAt =
      (await IndexSheetsService.getUpdatedAt(token, spreadsheetId, normalized, accountId)) ??
      new Date().toISOString();
    return { identifier: normalized, files, updatedAt };
  }

  static async getFileById(
    pnIdentifier: string,
    indexType: 'public' | 'owner',
    fileId: string,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string,
    contentClass?: ContentClassFolder
  ): Promise<IndexFileEntry | null> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      return getIndexFileByIdPortable(normalized, indexType, fileId, accountId, contentClass);
    }
    if (!token || !metadataFolderId) return null;
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      indexType,
      normalized,
      accountId,
      contentClass
    );
    return IndexSheetsService.getFileById(token, spreadsheetId, fileId, normalized, accountId);
  }

  static async addFile(
    pnIdentifier: string,
    indexType: 'public' | 'owner',
    entry: IndexFileEntry,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string,
    contentClass?: ContentClassFolder
  ): Promise<void> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      await addIndexFilePortable(normalized, indexType, entry, accountId, contentClass);
      return;
    }
    if (!token || !metadataFolderId) throw new Error('Google Drive context required');
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      indexType,
      normalized,
      accountId,
      contentClass
    );
    await IndexSheetsService.addFile(token, spreadsheetId, entry, normalized, accountId);
  }

  static async updateFile(
    pnIdentifier: string,
    indexType: 'public' | 'owner',
    fileId: string,
    updates: Partial<IndexFileEntry>,
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string,
    contentClass?: ContentClassFolder
  ): Promise<void> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      await updateIndexFilePortable(normalized, indexType, fileId, updates, accountId, contentClass);
      return;
    }
    if (!token || !metadataFolderId) throw new Error('Google Drive context required');
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      indexType,
      normalized,
      accountId,
      contentClass
    );
    await IndexSheetsService.updateFile(token, spreadsheetId, fileId, updates, normalized, accountId);
  }

  static async setAllFiles(
    pnIdentifier: string,
    indexType: 'public' | 'owner',
    entries: IndexFileEntry[],
    token?: GoogleDriveToken,
    metadataFolderId?: string,
    accountId?: string,
    updatedAt?: string,
    contentClass?: ContentClassFolder
  ): Promise<void> {
    const normalized = normalizePn(pnIdentifier);
    if (await isPortableStorageProvider(normalized)) {
      await setAllIndexFilesPortable(
        normalized,
        indexType,
        entries,
        accountId,
        updatedAt,
        contentClass
      );
      return;
    }
    if (!token || !metadataFolderId) throw new Error('Google Drive context required');
    const spreadsheetId = await sheetId(
      token,
      metadataFolderId,
      indexType,
      normalized,
      accountId,
      contentClass
    );
    await IndexSheetsService.setAllFiles(
      token,
      spreadsheetId,
      entries,
      normalized,
      accountId,
      updatedAt
    );
  }
}
