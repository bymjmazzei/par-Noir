import type { Application, Request, Response } from 'express';
import type { StorageCredentialsEnvelope, StorageProviderId } from '@par-noir/user-owned-storage';
import {
  buildAccountId,
  ensureSocialCloudOnCredentials,
  resolveSocialCloudProvider
} from '@par-noir/user-owned-storage';
import {
  disconnectProviderAccount,
  upsertAzureAccount,
  upsertDropboxAccount,
  upsertFtpAccount,
  upsertOnedriveAccount,
  upsertS3Account
} from './accountConnectHelpers';
import { getBearerTokenPayload } from '../../middleware/authMiddleware';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from '../deviceCapabilityService';
import { listStorageAccounts } from './storageAccountsService';
import {
  assignSocialCloudIfUnset,
  inferPrimaryProviderFromCredentials,
  initializePortableStorage,
  shouldInitializePortable
} from './storageInitService';
import {
  resolveFileBackendContext,
  resolveSocialCloudContext,
  resolveStorageContext
} from './storageFacade';
import { storageCredentialsService } from '../storageCredentialsService';
import { dropboxProxyService } from './dropboxProxy';
import { onedriveProxyService } from './onedriveProxy';
import { safeClientErrorMessage } from '../../utils/safeError';
import { registerMigrationRoutes } from './migrationRoutes';
import { isCompletedSocialCloudMigrationJob } from './storageMigrationJobs';

export function registerStorageRoutes(app: Application, nodeEnv: string): void {
  registerMigrationRoutes(app, nodeEnv);
  app.get('/api/storage/accounts/:identityId', async (req: Request, res: Response) => {
    try {
      const { identityId } = req.params;
      if (!identityId) {
        return res.status(400).json({ error: 'Missing identityId parameter' });
      }

      let pnIdentifier = identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
      if (identityId.startsWith('did:key:')) {
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

      const accounts = await listStorageAccounts(
        pnIdentifier,
        record.credentials as StorageCredentialsEnvelope
      );
      const creds = record.credentials as StorageCredentialsEnvelope;
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

  app.get('/api/storage/context/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, pnIdentifier))) return;

      const scope = req.query.scope === 'file' ? 'file' : 'social';
      const providerParam = typeof req.query.provider === 'string' ? req.query.provider : undefined;
      const accountId =
        typeof req.query.accountId === 'string' ? req.query.accountId : undefined;

      const ctx =
        scope === 'file' && providerParam
          ? await resolveFileBackendContext(
              pnIdentifier,
              providerParam as StorageProviderId,
              accountId
            )
          : await resolveSocialCloudContext(pnIdentifier, accountId);

      return res.json({
        provider: ctx.provider,
        rootPrefix: ctx.rootPrefix,
        metadataFolderId: ctx.metadataFolderId ?? null,
        isSocialCloud: ctx.isSocialCloud ?? scope !== 'file'
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to resolve storage context',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/test-connection/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, pnIdentifier))) return;

      const providerParam =
        typeof req.body?.provider === 'string'
          ? (req.body.provider as StorageProviderId)
          : undefined;
      const ctx = providerParam
        ? await resolveFileBackendContext(pnIdentifier, providerParam)
        : await resolveSocialCloudContext(pnIdentifier);
      if (!ctx.blobStore) {
        return res.json({ ok: true, provider: ctx.provider, message: 'Google Drive connected' });
      }
      const probeKey = `${ctx.rootPrefix}.connection-probe`;
      const body = Buffer.from(JSON.stringify({ ts: new Date().toISOString() }), 'utf8');
      await ctx.blobStore.put(probeKey, body, { contentType: 'application/json' });
      await ctx.blobStore.delete(probeKey);
      return res.json({ ok: true, provider: ctx.provider });
    } catch (error: unknown) {
      return res.status(500).json({
        ok: false,
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/storage/blobs/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileRead, pnIdentifier))) return;

      const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
      const providerParam = typeof req.query.provider === 'string' ? req.query.provider : undefined;
      if (!providerParam) {
        return res.status(400).json({ error: 'provider query param required' });
      }
      const ctx = await resolveFileBackendContext(
        pnIdentifier,
        providerParam as StorageProviderId,
        typeof req.query.accountId === 'string' ? req.query.accountId : undefined
      );
      if (!ctx.blobStore) {
        return res.status(400).json({ error: 'Blob API not available for Google Drive; use /api/drive/files' });
      }
      const entries = await ctx.blobStore.list(`${ctx.rootPrefix}${prefix}`);
      return res.json({ files: entries, provider: ctx.provider });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to list blobs',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/credentials/:identityId/portable-init', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      if (!record?.credentials) {
        return res.status(404).json({ error: 'No credentials found' });
      }
      let credentials = inferPrimaryProviderFromCredentials(
        record.credentials as StorageCredentialsEnvelope
      );
      if (!shouldInitializePortable(credentials)) {
        return res.status(400).json({ error: 'No portable provider configured' });
      }
      const result = await initializePortableStorage(pnIdentifier, credentials);
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Portable init failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/oauth/dropbox/exchange', async (req: Request, res: Response) => {
    try {
      const { code, redirectUri, pnIdentifier } = req.body as {
        code?: string;
        redirectUri?: string;
        pnIdentifier?: string;
      };
      if (!code || !redirectUri || !pnIdentifier) {
        return res.status(400).json({ error: 'code, redirectUri, and pnIdentifier required' });
      }
      const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

      const clientId = process.env.DROPBOX_APP_KEY;
      const clientSecret = process.env.DROPBOX_APP_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(503).json({ error: 'Dropbox OAuth not configured on server' });
      }

      const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret
        })
      });
      if (!tokenRes.ok) {
        return res.status(400).json({ error: 'Dropbox token exchange failed' });
      }
      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const accountId = buildAccountId('dropbox', normalized, 'default');
      const record = await storageCredentialsService.getCredentials(normalized);
      const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
      let credentials: StorageCredentialsEnvelope = assignSocialCloudIfUnset(
        upsertDropboxAccount(existing, {
          accountId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_in
            ? Date.now() + tokenData.expires_in * 1000
            : undefined
        }),
        'dropbox',
        accountId
      );
      credentials = ensureSocialCloudOnCredentials(credentials);
      await storageCredentialsService.upsertCredentials(normalized, credentials);
      if (resolveSocialCloudProvider(credentials) === 'dropbox') {
        await initializePortableStorage(normalized, credentials, 'dropbox');
      }

      return res.json({ success: true, accountId, provider: 'dropbox' });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Dropbox OAuth failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/oauth/onedrive/exchange', async (req: Request, res: Response) => {
    try {
      const { code, redirectUri, pnIdentifier } = req.body as {
        code?: string;
        redirectUri?: string;
        pnIdentifier?: string;
      };
      if (!code || !redirectUri || !pnIdentifier) {
        return res.status(400).json({ error: 'code, redirectUri, and pnIdentifier required' });
      }
      const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, normalized))) return;

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(503).json({ error: 'Microsoft OAuth not configured on server' });
      }

      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'Files.ReadWrite.AppFolder offline_access'
        })
      });
      if (!tokenRes.ok) {
        return res.status(400).json({ error: 'OneDrive token exchange failed' });
      }
      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      const accountId = buildAccountId('onedrive', normalized, 'default');
      const record = await storageCredentialsService.getCredentials(normalized);
      const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
      let credentials: StorageCredentialsEnvelope = assignSocialCloudIfUnset(
        upsertOnedriveAccount(existing, {
          accountId,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_in
            ? Date.now() + tokenData.expires_in * 1000
            : undefined
        }),
        'onedrive',
        accountId
      );
      credentials = ensureSocialCloudOnCredentials(credentials);
      await storageCredentialsService.upsertCredentials(normalized, credentials);
      if (resolveSocialCloudProvider(credentials) === 'onedrive') {
        await initializePortableStorage(normalized, credentials, 'onedrive');
      }

      return res.json({ success: true, accountId, provider: 'onedrive' });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'OneDrive OAuth failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.put('/api/storage/credentials/:identityId/provider', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const body = req.body as StorageCredentialsEnvelope & {
        provider?: string;
        awsS3?: NonNullable<StorageCredentialsEnvelope['awsS3Accounts']>[number];
        azureBlob?: NonNullable<StorageCredentialsEnvelope['azureBlobAccounts']>[number];
        ftp?: NonNullable<StorageCredentialsEnvelope['ftpAccounts']>[number];
      };

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
      let credentials: StorageCredentialsEnvelope = { ...existing };

      let newProvider: StorageProviderId | null = null;
      let newAccountId: string | undefined;

      if (body.provider === 'aws_s3' && body.awsS3) {
        const defaultPrefix = `par-noir-${pnIdentifier}`;
        const prefix = (body.awsS3.prefix || defaultPrefix).replace(/\/$/, '');
        if (!prefix.startsWith('par-noir-')) {
          return res.status(400).json({
            error: 'S3 prefix required',
            message: 'prefix must be set (default par-noir-{pn})'
          });
        }
        credentials = upsertS3Account(credentials, pnIdentifier, {
          ...body.awsS3,
          prefix
        });
        newAccountId =
          body.awsS3.accountId || buildAccountId('aws_s3', pnIdentifier, body.awsS3.bucket);
        newProvider = 'aws_s3';
      } else if (body.provider === 'azure_blob' && body.azureBlob) {
        if (body.azureBlob.connectionString) {
          return res.status(400).json({
            error: 'connection_string_not_allowed',
            message: 'Azure Blob accepts container SAS only — reconnect with a SAS token.'
          });
        }
        if (!body.azureBlob.sasToken) {
          return res.status(400).json({
            error: 'sas_token_required',
            message: 'Azure Blob requires a container SAS token.'
          });
        }
        const defaultPrefix = `par-noir-${pnIdentifier}`;
        const prefix = (body.azureBlob.prefix || defaultPrefix).replace(/\/$/, '');
        if (!prefix.startsWith('par-noir-')) {
          return res.status(400).json({
            error: 'Azure prefix required',
            message: 'prefix must be set (default par-noir-{pn})'
          });
        }
        credentials = upsertAzureAccount(credentials, pnIdentifier, {
          ...body.azureBlob,
          prefix,
          connectionString: undefined
        });
        newAccountId =
          body.azureBlob.accountId ||
          buildAccountId('azure_blob', pnIdentifier, body.azureBlob.container);
        newProvider = 'azure_blob';
      } else if (body.provider === 'ftp' && body.ftp) {
        credentials = upsertFtpAccount(credentials, pnIdentifier, body.ftp);
        const slug = body.ftp.host.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
        newAccountId = body.ftp.accountId || buildAccountId('ftp', pnIdentifier, slug);
        newProvider = 'ftp';
      } else {
        return res.status(400).json({ error: 'Invalid provider payload' });
      }

      credentials = assignSocialCloudIfUnset(credentials, newProvider!, newAccountId);
      credentials = ensureSocialCloudOnCredentials(credentials);
      const { isDeviceCloudCustodyEnabled } = await import('../socialMailboxService');
      if (isDeviceCloudCustodyEnabled()) {
        credentials = storageCredentialsService.stripCloudSecrets(
          credentials as Record<string, unknown>
        ) as StorageCredentialsEnvelope;
      }
      await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);

      let initResult: { pathPrefix: string } | undefined;
      if (resolveSocialCloudProvider(credentials) === newProvider) {
        initResult = await initializePortableStorage(pnIdentifier, credentials, newProvider!);
      }
      return res.json({
        success: true,
        provider: newProvider,
        socialCloudProvider: resolveSocialCloudProvider(credentials),
        ...initResult
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to save provider credentials',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.post('/api/storage/blobs/:identityId/upload', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

      const body = req.body as {
        provider?: StorageProviderId;
        key?: string;
        fileData?: string;
        contentType?: string;
        accountId?: string;
      };
      const provider = body.provider;
      const key = body.key;
      if (!provider || !key || !body.fileData) {
        return res.status(400).json({ error: 'provider, key, and fileData required' });
      }
      if (provider === 'google_drive') {
        return res.status(400).json({ error: 'Use /api/drive/files for Google Drive uploads' });
      }

      const ctx = await resolveFileBackendContext(pnIdentifier, provider, body.accountId);
      if (!ctx.blobStore) {
        return res.status(400).json({ error: 'Blob store unavailable for provider' });
      }
      const fullKey = key.startsWith(ctx.rootPrefix) ? key : `${ctx.rootPrefix}${key}`;
      const buf = Buffer.from(body.fileData, 'base64');
      await ctx.blobStore.put(fullKey, buf, {
        contentType: body.contentType || 'application/octet-stream'
      });
      return res.json({ success: true, key: fullKey.replace(ctx.rootPrefix, ''), provider });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Blob upload failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.get('/api/storage/blobs/:identityId/download', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead, pnIdentifier))) return;

      const provider = req.query.provider as StorageProviderId | undefined;
      const key = typeof req.query.key === 'string' ? req.query.key : undefined;
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
      if (!provider || !key) {
        return res.status(400).json({ error: 'provider and key query params required' });
      }
      if (provider === 'google_drive') {
        return res.status(400).json({ error: 'Use /api/drive/files for Google Drive downloads' });
      }

      const ctx = await resolveFileBackendContext(pnIdentifier, provider, accountId);
      if (!ctx.blobStore) {
        return res.status(400).json({ error: 'Blob store unavailable' });
      }
      const fullKey = key.startsWith(ctx.rootPrefix) ? key : `${ctx.rootPrefix}${key}`;
      const data = await ctx.blobStore.get(fullKey);
      if (!data) {
        return res.status(404).json({ error: 'Blob not found' });
      }
      if (req.query.download === 'true') {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment');
      }
      return res.send(Buffer.from(data));
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Blob download failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.delete('/api/storage/blobs/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload, pnIdentifier))) return;

      const provider = (req.query.provider || req.body?.provider) as StorageProviderId | undefined;
      const key = (req.query.key || req.body?.key) as string | undefined;
      const accountId = (req.query.accountId || req.body?.accountId) as string | undefined;
      if (!provider || !key) {
        return res.status(400).json({ error: 'provider and key required' });
      }
      if (provider === 'google_drive') {
        return res.status(400).json({ error: 'Use /api/drive/files for Google Drive deletes' });
      }

      const ctx = await resolveFileBackendContext(pnIdentifier, provider, accountId);
      if (!ctx.blobStore) {
        return res.status(400).json({ error: 'Blob store unavailable' });
      }
      const fullKey = key.startsWith(ctx.rootPrefix) ? key : `${ctx.rootPrefix}${key}`;
      await ctx.blobStore.delete(fullKey);
      return res.json({ success: true });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Blob delete failed',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  app.delete(
    '/api/storage/credentials/:identityId/provider/:provider/:accountId',
    async (req: Request, res: Response) => {
      try {
        const pnIdentifier = req.params.identityId.startsWith('pn-')
          ? req.params.identityId
          : `pn-${req.params.identityId}`;
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
          credentials = disconnectProviderAccount(
            existing,
            provider,
            accountId,
            replacementAccountId
          );
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

  app.put('/api/storage/credentials/:identityId/social-cloud', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const { provider, accountId, migrationJobId } = req.body as {
        provider?: StorageProviderId;
        accountId?: string;
        migrationJobId?: string;
      };
      if (!provider) {
        return res.status(400).json({ error: 'provider required' });
      }

      const record = await storageCredentialsService.getCredentials(pnIdentifier);
      const existing = (record?.credentials ?? {}) as StorageCredentialsEnvelope;
      const previousSocial = resolveSocialCloudProvider(existing);

      const needsMigration = previousSocial !== provider;

      if (needsMigration) {
        const jobOk =
          migrationJobId &&
          (await isCompletedSocialCloudMigrationJob(
            migrationJobId,
            pnIdentifier,
            provider,
            accountId
          ));
        if (!jobOk) {
          return res.status(409).json({
            error: 'migration_required',
            message: 'Changing social cloud requires a completed migration job.',
            previewPath: '/api/storage/migrate/social-cloud/preview'
          });
        }
      }

      const credentials: StorageCredentialsEnvelope = ensureSocialCloudOnCredentials({
        ...existing,
        socialCloudProvider: provider,
        primaryProvider: provider,
        socialCloudAccountId: accountId
      });

      await storageCredentialsService.upsertCredentials(pnIdentifier, credentials);

      if (provider !== 'google_drive' && provider !== previousSocial) {
        await initializePortableStorage(pnIdentifier, credentials, provider);
      }

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

  /** Non-secret layout hints only (folder ids / provider enum). Used with device cloud custody. */
  app.post('/api/storage/layout/:identityId', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const { socialCloudProvider, socialCloudAccountId, cachedLayout, driveFolderId, publicKey } =
        req.body || {};
      const record = await storageCredentialsService.upsertLayoutOnly(pnIdentifier, {
        socialCloudProvider,
        socialCloudAccountId,
        cachedLayout,
        driveFolderId,
        publicKey
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

  /** Purge OAuth/provider secrets from server after client has sealed them on device. */
  app.post('/api/storage/credentials/:identityId/purge-secrets', async (req: Request, res: Response) => {
    try {
      const pnIdentifier = req.params.identityId.startsWith('pn-')
        ? req.params.identityId
        : `pn-${req.params.identityId}`;
      if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, pnIdentifier))) return;

      const { isDeviceCloudCustodyEnabled } = await import('../socialMailboxService');
      if (!isDeviceCloudCustodyEnabled()) {
        return res.status(409).json({
          error: 'device_cloud_custody_disabled',
          message: 'Set DEVICE_CLOUD_CUSTODY=1 before purging server-held cloud secrets.'
        });
      }

      const record = await storageCredentialsService.purgeCloudSecrets(pnIdentifier);
      return res.json({
        success: true,
        purged: !!record,
        identityId: pnIdentifier
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: 'Failed to purge cloud secrets',
        message: safeClientErrorMessage(error, nodeEnv === 'production')
      });
    }
  });

  void dropboxProxyService;
  void onedriveProxyService;
}
