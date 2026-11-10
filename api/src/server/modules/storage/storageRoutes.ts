/**
 * Storage account layout routes. The API keeps only the layout shell (provider,
 * account ids, bucket/container names, prefixes). Provider secrets stay sealed
 * on the owner's device, and all reads and writes to the owner's cloud run there.
 */

import type { Application, Request, Response } from 'express';
import type { StorageCredentialsEnvelope, StorageProviderId } from '@par-noir/user-owned-storage';
import { isPnDid } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import {
  buildAccountId,
  ensureSocialCloudOnCredentials,
  resolveSocialCloudProvider
} from '@par-noir/user-owned-storage';
import {
  disconnectProviderAccount,
  upsertAzureAccount,
  upsertFtpAccount,
  upsertS3Account
} from './accountConnectHelpers';
import { getBearerTokenPayload } from '../../middleware/authMiddleware';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from '../deviceCapabilityService';
import { listStorageAccounts } from './storageAccountsService';
import { credentialsContainCloudSecrets, storageCredentialsService } from '../storageCredentialsService';
import { safeClientErrorMessage } from '../../utils/safeError';

function ownerPn(identityId: string): string {
  return identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
}

/** The first connected cloud becomes the social cloud. */
function assignSocialCloudIfUnset(
  credentials: StorageCredentialsEnvelope,
  provider: StorageProviderId,
  accountId?: string
): StorageCredentialsEnvelope {
  if (credentials.socialCloudProvider != null || credentials.primaryProvider != null) return credentials;
  return { ...credentials, socialCloudProvider: provider, primaryProvider: provider, socialCloudAccountId: accountId };
}

export function registerStorageRoutes(app: Application, nodeEnv: string): void {
  app.get('/api/storage/accounts/:identityId', async (req: Request, res: Response) => {
    try {
      const { identityId } = req.params;
      if (!identityId) {
        return res.status(400).json({ error: 'Missing identityId parameter' });
      }

      let pnIdentifier = ownerPn(identityId);
      if (isPnDid(identityId)) {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.json({ success: true, accounts: [], primaryProvider: null });
        }
        pnIdentifier = tokenPayload.pnIdentifier;
      }

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      if (!record?.credentials) {
        return res.json({ success: true, accounts: [], primaryProvider: null });
      }

      const creds = record.credentials as StorageCredentialsEnvelope;
      const accounts = listStorageAccounts(pnIdentifier, creds);
      const socialCloudProvider =
        creds.socialCloudProvider ??
        creds.primaryProvider ??
        accounts.find((a) => a.isSocialCloud)?.provider ??
        null;

      return res.json({
        success: true,
        accounts,
        socialCloudProvider,
        primaryProvider: socialCloudProvider
      });
    } catch (error: unknown) {
      console.error('[StorageAccounts] Error:', error);
      return res.status(500).json({
        error: 'Failed to list storage accounts',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  /** Register a connected provider's layout shell. Secrets are refused, not stripped. */
  app.put('/api/storage/credentials/:identityId/provider', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = ownerPn(req.params.identityId);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const body = req.body as {
        provider?: string;
        awsS3?: NonNullable<StorageCredentialsEnvelope['awsS3Accounts']>[number];
        azureBlob?: NonNullable<StorageCredentialsEnvelope['azureBlobAccounts']>[number];
        ftp?: NonNullable<StorageCredentialsEnvelope['ftpAccounts']>[number];
      };
      if (credentialsContainCloudSecrets({ awsS3Accounts: [body.awsS3], azureBlobAccounts: [body.azureBlob], ftpAccounts: [body.ftp] })) {
        return res.status(400).json({
          error: 'secrets_not_accepted',
          message: 'Provider keys stay sealed on your device. Send the account layout only.'
        });
      }

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      let credentials: StorageCredentialsEnvelope = { ...((record?.credentials ?? {}) as StorageCredentialsEnvelope) };
      let newProvider: StorageProviderId;
      let newAccountId: string;
      const defaultPrefix = `par-noir-${pnIdentifier}`;

      if (body.provider === 'aws_s3' && body.awsS3?.bucket && body.awsS3.region) {
        const prefix = (body.awsS3.prefix || defaultPrefix).replace(/\/$/, '');
        if (!prefix.startsWith('par-noir-')) {
          return res.status(400).json({ error: 'S3 prefix required', message: 'prefix must start with par-noir-' });
        }
        newAccountId = body.awsS3.accountId || buildAccountId('aws_s3', pnIdentifier, body.awsS3.bucket);
        credentials = upsertS3Account(credentials, pnIdentifier, { ...body.awsS3, prefix, accountId: newAccountId });
        newProvider = 'aws_s3';
      } else if (body.provider === 'azure_blob' && body.azureBlob?.accountName && body.azureBlob.container) {
        const prefix = (body.azureBlob.prefix || defaultPrefix).replace(/\/$/, '');
        if (!prefix.startsWith('par-noir-')) {
          return res.status(400).json({ error: 'Azure prefix required', message: 'prefix must start with par-noir-' });
        }
        newAccountId =
          body.azureBlob.accountId || buildAccountId('azure_blob', pnIdentifier, body.azureBlob.container);
        credentials = upsertAzureAccount(credentials, pnIdentifier, { ...body.azureBlob, prefix, accountId: newAccountId });
        newProvider = 'azure_blob';
      } else if (body.provider === 'ftp' && body.ftp?.host) {
        const slug = body.ftp.host.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
        newAccountId = body.ftp.accountId || buildAccountId('ftp', pnIdentifier, slug);
        credentials = upsertFtpAccount(credentials, pnIdentifier, { ...body.ftp, accountId: newAccountId });
        newProvider = 'ftp';
      } else {
        return res.status(400).json({ error: 'Invalid provider payload' });
      }

      credentials = ensureSocialCloudOnCredentials(assignSocialCloudIfUnset(credentials, newProvider, newAccountId));
      await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);
      return res.json({
        success: true,
        provider: newProvider,
        accountId: newAccountId,
        socialCloudProvider: resolveSocialCloudProvider(credentials)
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to save provider layout',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.delete(
    '/api/storage/credentials/:identityId/provider/:provider/:accountId',
    async (req: Request, res: Response) => {
      try {
        const pnIdentifier = ownerPn(req.params.identityId);
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

        const provider = req.params.provider as StorageProviderId;
        const accountId = decodeURIComponent(req.params.accountId);
        const replacementAccountId =
          typeof req.query.replacementAccountId === 'string'
            ? req.query.replacementAccountId
            : undefined;

        const record = await storageCredentialsService.getCredentials(pnIdentifier);
        const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;

        let credentials: StorageCredentialsEnvelope;
        try {
          credentials = disconnectProviderAccount(existing, provider, accountId, replacementAccountId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Disconnect failed';
          if (msg.includes('replacementAccountId')) {
            return res.status(409).json({ error: 'social_cloud_disconnect_blocked', message: msg });
          }
          return res.status(400).json({ error: msg });
        }

        await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);
        return res.json({ success: true });
      } catch (error: unknown) {
        return res.status(500).json({
          error: 'Failed to disconnect provider account',
          message: safeClientErrorMessage(error, nodeEnv === 'production')
        });
      }
    }
  );

  /**
   * Switch the social cloud. The device copies tables and indexes first (it holds
   * the keys), then reports `migrated: true`.
   */
  app.put('/api/storage/credentials/:identityId/social-cloud', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = ownerPn(req.params.identityId);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const { provider, accountId, migrated } = req.body as {
        provider?: StorageProviderId;
        accountId?: string;
        migrated?: boolean;
      };
      if (!provider) {
        return res.status(400).json({ error: 'provider required' });
      }

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
      if (resolveSocialCloudProvider(existing) !== provider && migrated !== true) {
        return res.status(409).json({
          error: 'migration_required',
          message: 'Copy your tables to the new cloud on this device before switching.'
        });
      }

      const credentials: StorageCredentialsEnvelope = ensureSocialCloudOnCredentials({
        ...existing,
        socialCloudProvider: provider,
        primaryProvider: provider,
        socialCloudAccountId: accountId
      });
      await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);

      return res.json({
        success: true,
        socialCloudProvider: provider,
        accountId: accountId ?? null
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to set social cloud',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  /** Non-secret layout hints only (folder ids / provider enum). */
  app.post('/api/storage/layout/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = ownerPn(req.params.identityId);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const {
        socialCloudProvider,
        socialCloudAccountId,
        cachedLayout,
        driveFolderId,
        publicKey,
        portableLayoutInitialized
      } = req.body || {};
      const record = await storageCredentialsService.upsertLayoutOnly(pnIdentifier, {
        socialCloudProvider,
        socialCloudAccountId,
        cachedLayout,
        driveFolderId,
        publicKey,
        layoutCurrent: portableLayoutInitialized === true
      });
      return res.json({
        success: true,
        identityId: record.identityId,
        layout: {
          socialCloudProvider: record.credentials?.socialCloudProvider ?? null,
          socialCloudAccountId: record.credentials?.socialCloudAccountId ?? null,
          cachedLayout: record.credentials?.cachedLayout ?? null,
          driveFolderId: record.credentials?.driveFolderId ?? null
        }
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to save storage layout',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  /** Purge provider secrets left from before device custody, once the device has sealed them. */
  app.post('/api/storage/credentials/:identityId/purge-secrets', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = ownerPn(req.params.identityId);
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;
      const record = await storageCredentialsService.purgeCloudSecrets(pnIdentifier);
      return res.json({ success: true, purged: !!record, identityId: pnIdentifier });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to purge cloud secrets',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });
}
