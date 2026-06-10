/**
 * Multi-provider aggregator sync — reads public index from social cloud into PostgreSQL cache.
 */

import { resolveSocialCloudProvider } from '@par-noir/user-owned-storage';
import { getDatabasePool } from '../utils/database';
import { storageCredentialsService } from './storageCredentialsService';
import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import type { PublicMetadata } from './aggregatorMetadataService';
import { IndexStorageService } from './storage/indexStorageService';
import { isPortableSocialCloud } from './storage/storageProviderUtils';
import { safeLogger } from '../../utils/logger';

export class UserStorageSyncService {
  private static instance: UserStorageSyncService;

  static getInstance(): UserStorageSyncService {
    if (!UserStorageSyncService.instance) {
      UserStorageSyncService.instance = new UserStorageSyncService();
    }
    return UserStorageSyncService.instance;
  }

  async syncPortableUsers(): Promise<{ synced: number; errors: number }> {
    const pool = getDatabasePool();
    let synced = 0;
    let errors = 0;

    const result = await pool.query(`SELECT identity_id FROM storage_credentials`);

    for (const row of result.rows as Array<{ identity_id: string }>) {
      const pnIdentifier = row.identity_id;
      try {
        const record = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!record?.credentials) continue;

        const socialProvider = resolveSocialCloudProvider(record.credentials);
        if (!(await isPortableSocialCloud(pnIdentifier))) continue;

        const entries: { metadata: PublicMetadata; pnIdentifier: string }[] = [];
        const contentClasses: Array<'media' | 'thoughts' | 'collections'> = [
          'media',
          'thoughts',
          'collections'
        ];

        for (const cc of contentClasses) {
          const idx = await IndexStorageService.getContentClassPublicIndex(pnIdentifier, cc);
          if (!idx?.files?.length) continue;
          for (const file of idx.files) {
            if (file.visibility !== 'public') continue;
            const fileId = file.fileId;
            if (!fileId) continue;
            entries.push({
              pnIdentifier,
              metadata: {
                fileId,
                name: file.originalName || file.fileName || fileId,
                isPublic: true,
                uploadDate: file.uploadedAt || new Date().toISOString(),
                fileType: file.fileType || 'other',
                backend: (file as { backend?: string }).backend || socialProvider,
                backendFileId:
                  (file as { backendFileId?: string }).backendFileId ||
                  file.googleDriveFileId ||
                  fileId,
                backendAccountId: (file as { backendAccountId?: string }).backendAccountId,
                ...(file as object)
              } as PublicMetadata
            });
          }
        }

        if (entries.length === 0) {
          const root = await IndexStorageService.getPublicFileIndex(pnIdentifier);
          for (const file of root.files) {
            if (file.visibility !== 'public') continue;
            entries.push({
              pnIdentifier,
              metadata: {
                fileId: file.fileId,
                name: file.originalName || file.fileName || file.fileId,
                isPublic: true,
                uploadDate: file.uploadedAt || new Date().toISOString(),
                fileType: file.fileType || 'other',
                backend: (file as { backend?: string }).backend || socialProvider,
                backendFileId:
                  (file as { backendFileId?: string }).backendFileId ||
                  file.googleDriveFileId ||
                  file.fileId,
                backendAccountId: (file as { backendAccountId?: string }).backendAccountId,
                ...(file as object)
              } as PublicMetadata
            });
          }
        }

        if (entries.length > 0) {
          await AggregatorMetadataServiceDB.getInstance().bulkUpsertMetadata(entries);
        }
        synced++;
      } catch (err) {
        errors++;
        safeLogger.warn('[UserStorageSync] Failed for user', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { synced, errors };
  }

  async syncAll(): Promise<{ portable: { synced: number; errors: number } }> {
    const portable = await this.syncPortableUsers();
    return { portable };
  }
}

export const userStorageSyncService = UserStorageSyncService.getInstance();
