import type {
  AwsS3Account,
  AzureBlobAccount,
  BlobStore,
  DropboxAccount,
  FtpAccount,
  OnedriveAccount,
  StorageCredentialsEnvelope,
  StorageProviderId
} from '@par-noir/user-owned-storage';
import {
  pnRootFolderName,
  resolveAccount,
  resolveSocialCloudProvider
} from '@par-noir/user-owned-storage';
import { AzureBlobAdapter } from './AzureBlobAdapter';
import { DropboxBlobAdapter } from './DropboxBlobAdapter';
import { FtpBlobAdapter } from './FtpBlobAdapter';
import { OneDriveBlobAdapter } from './OneDriveBlobAdapter';
import { S3BlobAdapter } from './S3BlobAdapter';
import { dropboxProxyService } from '../dropboxProxy';
import { onedriveProxyService } from '../onedriveProxy';

export async function createBlobStoreForProvider(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  provider?: StorageProviderId,
  accountId?: string
): Promise<BlobStore> {
  const p = provider ?? resolveSocialCloudProvider(credentials);
  const root = `${pnRootFolderName(pnIdentifier)}/`;

  switch (p) {
    case 'dropbox': {
      const account = resolveAccount<DropboxAccount>(credentials, 'dropbox', accountId);
      const token = await dropboxProxyService.getAccessToken(pnIdentifier, account.accountId);
      return new DropboxBlobAdapter(token, root);
    }
    case 'aws_s3': {
      const account = resolveAccount<AwsS3Account>(credentials, 'aws_s3', accountId);
      if (!account.prefix) {
        throw new Error('S3 requires prefix (par-noir-{pn})');
      }
      return new S3BlobAdapter({
        region: account.region,
        bucket: account.bucket,
        accessKeyId: account.accessKeyId,
        secretAccessKey: account.secretAccessKey,
        prefix: account.prefix
      });
    }
    case 'azure_blob': {
      const account = resolveAccount<AzureBlobAccount>(credentials, 'azure_blob', accountId);
      if (!account.sasToken || !account.prefix) {
        throw new Error('Azure requires sasToken and prefix');
      }
      return new AzureBlobAdapter({
        accountName: account.accountName,
        container: account.container,
        sasToken: account.sasToken,
        prefix: account.prefix
      });
    }
    case 'onedrive': {
      const account = resolveAccount<OnedriveAccount>(credentials, 'onedrive', accountId);
      const token = await onedriveProxyService.getAccessToken(pnIdentifier, account.accountId);
      return new OneDriveBlobAdapter(token, root);
    }
    case 'ftp': {
      const account = resolveAccount<FtpAccount>(credentials, 'ftp', accountId);
      return new FtpBlobAdapter(account, root);
    }
    default:
      throw new Error(`BlobStore not available for provider: ${p}`);
  }
}
