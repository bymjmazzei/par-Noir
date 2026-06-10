import type { StorageCredentialsEnvelope, StorageProviderId } from '@par-noir/user-owned-storage';
import {
  buildAccountId,
  removeProviderAccount,
  upsertProviderAccount
} from '@par-noir/user-owned-storage';

export function upsertS3Account(
  credentials: StorageCredentialsEnvelope,
  pnIdentifier: string,
  entry: NonNullable<StorageCredentialsEnvelope['awsS3Accounts']>[number]
): StorageCredentialsEnvelope {
  const accountId =
    entry.accountId || buildAccountId('aws_s3', pnIdentifier, entry.bucket);
  const list = credentials.awsS3Accounts ?? [];
  const duplicate = list.find(
    (a) =>
      a.accountId !== accountId &&
      a.bucket === entry.bucket &&
      a.region === entry.region
  );
  if (duplicate) {
    throw new Error('An S3 account with this bucket and region is already connected');
  }
  return {
    ...credentials,
    awsS3Accounts: upsertProviderAccount(list, { ...entry, accountId })
  };
}

export function upsertAzureAccount(
  credentials: StorageCredentialsEnvelope,
  pnIdentifier: string,
  entry: NonNullable<StorageCredentialsEnvelope['azureBlobAccounts']>[number]
): StorageCredentialsEnvelope {
  const accountId =
    entry.accountId || buildAccountId('azure_blob', pnIdentifier, entry.container);
  return {
    ...credentials,
    azureBlobAccounts: upsertProviderAccount(credentials.azureBlobAccounts, {
      ...entry,
      accountId
    })
  };
}

export function upsertFtpAccount(
  credentials: StorageCredentialsEnvelope,
  pnIdentifier: string,
  entry: NonNullable<StorageCredentialsEnvelope['ftpAccounts']>[number]
): StorageCredentialsEnvelope {
  const slug = entry.host.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
  const accountId = entry.accountId || buildAccountId('ftp', pnIdentifier, slug);
  return {
    ...credentials,
    ftpAccounts: upsertProviderAccount(credentials.ftpAccounts, { ...entry, accountId })
  };
}

export function upsertDropboxAccount(
  credentials: StorageCredentialsEnvelope,
  entry: NonNullable<StorageCredentialsEnvelope['dropboxAccounts']>[number]
): StorageCredentialsEnvelope {
  return {
    ...credentials,
    dropboxAccounts: upsertProviderAccount(credentials.dropboxAccounts, entry)
  };
}

export function upsertOnedriveAccount(
  credentials: StorageCredentialsEnvelope,
  entry: NonNullable<StorageCredentialsEnvelope['onedriveAccounts']>[number]
): StorageCredentialsEnvelope {
  return {
    ...credentials,
    onedriveAccounts: upsertProviderAccount(credentials.onedriveAccounts, entry)
  };
}

export function disconnectProviderAccount(
  credentials: StorageCredentialsEnvelope,
  provider: StorageProviderId,
  accountId: string,
  replacementAccountId?: string
): StorageCredentialsEnvelope {
  if (
    credentials.socialCloudAccountId === accountId &&
    credentials.socialCloudProvider === provider &&
    !replacementAccountId
  ) {
    throw new Error(
      'Cannot disconnect social cloud account without replacementAccountId'
    );
  }

  let updated = { ...credentials };

  switch (provider) {
    case 'dropbox':
      updated.dropboxAccounts = removeProviderAccount(updated.dropboxAccounts, accountId);
      break;
    case 'aws_s3':
      updated.awsS3Accounts = removeProviderAccount(updated.awsS3Accounts, accountId);
      break;
    case 'azure_blob':
      updated.azureBlobAccounts = removeProviderAccount(updated.azureBlobAccounts, accountId);
      break;
    case 'onedrive':
      updated.onedriveAccounts = removeProviderAccount(updated.onedriveAccounts, accountId);
      break;
    case 'ftp':
      updated.ftpAccounts = removeProviderAccount(updated.ftpAccounts, accountId);
      break;
    default:
      throw new Error(`Disconnect not supported for provider: ${provider}`);
  }

  if (updated.socialCloudAccountId === accountId) {
    updated.socialCloudAccountId = replacementAccountId;
  }

  return updated;
}
