import type { Application, Request, Response } from 'express';
import type { StorageProviderId } from '@par-noir/user-owned-storage';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from '../deviceCapabilityService';
import { safeClientErrorMessage } from '../../utils/safeError';
import {
  completeSocialCloudMigration,
  getMigrationJob,
  previewSocialCloudMigration,
  startSocialCloudMigration
} from './socialCloudMigrationService';
import {
  bulkMigrateFiles,
  getMigrationJob as getFileMigrationJob,
  migrateFiles,
  previewFileMigration
} from './fileMigrationService';

function normalizePn(identityId: string): string {
  return identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
}

export function registerMigrationRoutes(app: Application, nodeEnv: string): void {
  app.post('/api/storage/migrate/social-cloud/preview', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier, targetProvider, targetAccountId } = req.body as {
        pnIdentifier?: string;
        targetProvider?: StorageProviderId;
        targetAccountId?: string;
      };
      if (!pnIdentifier || !targetProvider) {
        return res.status(400).json({ error: 'pnIdentifier and targetProvider required' });
      }
      const normalized = normalizePn(pnIdentifier);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalized))) return;

      const preview = await previewSocialCloudMigration(
        normalized,
        targetProvider,
        targetAccountId
      );
      return res.json(preview);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Preview failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/migrate/social-cloud/start', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier, targetProvider, targetAccountId } = req.body as {
        pnIdentifier?: string;
        targetProvider?: StorageProviderId;
        targetAccountId?: string;
      };
      if (!pnIdentifier || !targetProvider) {
        return res.status(400).json({ error: 'pnIdentifier and targetProvider required' });
      }
      const normalized = normalizePn(pnIdentifier);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

      const result = await startSocialCloudMigration(
        normalized,
        targetProvider,
        targetAccountId
      );
      return res.json(result);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Migration start failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/storage/migrate/social-cloud/:jobId', async (req: Request, res: Response) => {
    try {
      const job = await getMigrationJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      return res.json(job);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to get job',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post(
    '/api/storage/migrate/social-cloud/:jobId/complete',
    async (req: Request, res: Response) => {
      try {
        const { pnIdentifier, targetProvider, targetAccountId } = req.body as {
          pnIdentifier?: string;
          targetProvider?: StorageProviderId;
          targetAccountId?: string;
        };
        if (!pnIdentifier || !targetProvider) {
          return res.status(400).json({ error: 'pnIdentifier and targetProvider required' });
        }
        const normalized = normalizePn(pnIdentifier);
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

        await completeSocialCloudMigration(
          normalized,
          req.params.jobId,
          targetProvider,
          targetAccountId
        );
        return res.json({ success: true });
      } catch (error: unknown) {
        return res.status(500).json({
          error: 'Complete failed',
          message: safeClientErrorMessage(error, nodeEnv === 'production')
        });
      }
    }
  );

  app.post('/api/storage/migrate/files/preview', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier, fileIds, destProvider, destAccountId } = req.body as {
        pnIdentifier?: string;
        fileIds?: string[];
        destProvider?: StorageProviderId;
        destAccountId?: string;
      };
      if (!pnIdentifier || !destProvider || !fileIds?.length) {
        return res.status(400).json({ error: 'pnIdentifier, fileIds, destProvider required' });
      }
      const normalized = normalizePn(pnIdentifier);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, normalized))) return;

      const preview = await previewFileMigration(
        normalized,
        fileIds,
        destProvider,
        destAccountId
      );
      return res.json(preview);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Preview failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/migrate/files/start', async (req: Request, res: Response) => {
    try {
      const { pnIdentifier, fileIds, destProvider, destAccountId, mode } = req.body as {
        pnIdentifier?: string;
        fileIds?: string[];
        destProvider?: StorageProviderId;
        destAccountId?: string;
        mode?: 'move' | 'copy';
      };
      if (!pnIdentifier || !destProvider || !fileIds?.length) {
        return res.status(400).json({ error: 'pnIdentifier, fileIds, destProvider required' });
      }
      const normalized = normalizePn(pnIdentifier);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

      const result = await migrateFiles(
        normalized,
        fileIds,
        destProvider,
        destAccountId,
        mode ?? 'move'
      );
      return res.json(result);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'File migration failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/migrate/files/bulk', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        pnIdentifier?: string;
        sourceProvider?: StorageProviderId;
        sourceAccountId?: string;
        destProvider?: StorageProviderId;
        destAccountId?: string;
        mode?: 'move' | 'copy';
      };
      if (!body.pnIdentifier || !body.sourceProvider || !body.destProvider) {
        return res.status(400).json({ error: 'pnIdentifier, sourceProvider, destProvider required' });
      }
      const normalized = normalizePn(body.pnIdentifier);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

      const result = await bulkMigrateFiles(
        normalized,
        body.sourceProvider,
        body.sourceAccountId,
        body.destProvider,
        body.destAccountId,
        body.mode ?? 'move'
      );
      return res.json(result);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Bulk migration failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/storage/migrate/files/:jobId', async (req: Request, res: Response) => {
    try {
      const job = await getFileMigrationJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      return res.json(job);
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to get job',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  void getMigrationJob;
}
