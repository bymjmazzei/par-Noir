import type { CachedLayout, StorageProviderId } from './types.js';

/** Decrypted storage credentials shape (provider-agnostic extension) */
export interface StorageCredentialsEnvelope {
  /** Where tables, indexes, and JSON metadata live */
  socialCloudProvider?: StorageProviderId;
  socialCloudAccountId?: string;
  /** @deprecated use socialCloudProvider */
  primaryProvider?: StorageProviderId;
  googleDriveAccounts?: GoogleDriveAccount[];
  dropboxAccounts?: DropboxAccount[];
  awsS3Accounts?: AwsS3Account[];
  azureBlobAccounts?: AzureBlobAccount[];
  onedriveAccounts?: OnedriveAccount[];
  ftpAccounts?: FtpAccount[];
  cachedLayout?: CachedLayout;
  /** @deprecated use cachedLayout.nodeIds */
  cachedFolderIds?: CachedLayout['nodeIds'];
  driveFolderId?: string;
  publicKey?: string;
}

export interface GoogleDriveAccount {
  backendId?: string;
  keyPrefix?: string;
  accountId?: string;
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  email?: string;
  connectedAt?: string;
  updatedAt?: string;
  expires_at?: number;
  expires_in?: number;
}

export interface DropboxAccount {
  accountId: string;
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  email?: string;
  connectedAt?: string;
  expires_at?: number;
}

export interface AwsS3Account {
  accountId: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export interface AzureBlobAccount {
  accountId: string;
  accountName: string;
  container: string;
  sasToken?: string;
  connectionString?: string;
  prefix?: string;
}

export interface OnedriveAccount {
  accountId: string;
  accessToken?: string;
  access_token?: string;
  refreshToken?: string;
  refresh_token?: string;
  email?: string;
  expires_at?: number;
}

export interface FtpAccount {
  accountId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  basePath: string;
  useTls: boolean;
  passiveMode: boolean;
}

export function listConnectedProviders(credentials: StorageCredentialsEnvelope): StorageProviderId[] {
  const out: StorageProviderId[] = [];
  const legacy = (credentials as { googleDrive?: unknown }).googleDrive;
  if (credentials.googleDriveAccounts?.length || legacy) out.push('google_drive');
  if (credentials.dropboxAccounts?.length) out.push('dropbox');
  if (credentials.awsS3Accounts?.length) out.push('aws_s3');
  if (credentials.azureBlobAccounts?.length) out.push('azure_blob');
  if (credentials.onedriveAccounts?.length) out.push('onedrive');
  if (credentials.ftpAccounts?.length) out.push('ftp');
  return out;
}

/** Social cloud = where tables and owner/public indexes live */
export function resolveSocialCloudProvider(credentials: StorageCredentialsEnvelope): StorageProviderId {
  if (credentials.socialCloudProvider) {
    return credentials.socialCloudProvider;
  }
  if (credentials.primaryProvider) {
    return credentials.primaryProvider;
  }
  const connected = listConnectedProviders(credentials);
  if (connected.length > 0) return connected[0];
  return 'google_drive';
}

/** @deprecated use resolveSocialCloudProvider */
export function resolvePrimaryProvider(credentials: StorageCredentialsEnvelope): StorageProviderId {
  return resolveSocialCloudProvider(credentials);
}

export function ensureSocialCloudOnCredentials(
  credentials: StorageCredentialsEnvelope
): StorageCredentialsEnvelope {
  if (credentials.socialCloudProvider) return credentials;
  const provider = resolveSocialCloudProvider(credentials);
  return { ...credentials, socialCloudProvider: provider, primaryProvider: provider };
}

export function readCachedLayout(credentials: StorageCredentialsEnvelope): CachedLayout {
  if (credentials.cachedLayout) return credentials.cachedLayout;
  if (credentials.cachedFolderIds) {
    return { nodeIds: credentials.cachedFolderIds };
  }
  return {};
}

/** Canonical account id: `{provider}::{pn}::{slug}` */
export function buildAccountId(
  provider: StorageProviderId,
  pnIdentifier: string,
  slug: string
): string {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const safeSlug = slug.replace(/::/g, '_').trim() || 'default';
  const prefix =
    provider === 'aws_s3'
      ? 's3'
      : provider === 'azure_blob'
        ? 'azure'
        : provider === 'google_drive'
          ? 'google_drive'
          : provider;
  return `${prefix}::${pn}::${safeSlug}`;
}

/** Legacy single-account id before multi-account (e.g. `s3::pn-abc`) */
export function legacyAccountId(provider: StorageProviderId, pnIdentifier: string): string {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const prefix =
    provider === 'aws_s3'
      ? 's3'
      : provider === 'azure_blob'
        ? 'azure'
        : provider;
  return `${prefix}::${pn}`;
}

export function upsertProviderAccount<T extends { accountId: string }>(
  accounts: T[] | undefined,
  entry: T
): T[] {
  const list = [...(accounts ?? [])];
  const idx = list.findIndex((a) => a.accountId === entry.accountId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...entry };
  } else {
    list.push(entry);
  }
  return list;
}

export function removeProviderAccount<T extends { accountId: string }>(
  accounts: T[] | undefined,
  accountId: string
): T[] {
  return (accounts ?? []).filter((a) => a.accountId !== accountId);
}

/**
 * Resolve a connected account record for a provider.
 * Falls back to first account when accountId omitted.
 */
export function resolveAccount<T extends { accountId: string }>(
  credentials: StorageCredentialsEnvelope,
  provider: StorageProviderId,
  accountId?: string
): T {
  let list: T[];
  switch (provider) {
    case 'dropbox':
      list = (credentials.dropboxAccounts ?? []) as unknown as T[];
      break;
    case 'aws_s3':
      list = (credentials.awsS3Accounts ?? []) as unknown as T[];
      break;
    case 'azure_blob':
      list = (credentials.azureBlobAccounts ?? []) as unknown as T[];
      break;
    case 'onedrive':
      list = (credentials.onedriveAccounts ?? []) as unknown as T[];
      break;
    case 'ftp':
      list = (credentials.ftpAccounts ?? []) as unknown as T[];
      break;
    default:
      throw new Error(`resolveAccount not supported for provider: ${provider}`);
  }
  if (list.length === 0) {
    throw new Error(`${provider} not connected`);
  }
  if (accountId) {
    const found = list.find((a) => a.accountId === accountId);
    if (found) return found;
    throw new Error(`Account not found: ${accountId}`);
  }
  if (credentials.socialCloudProvider === provider && credentials.socialCloudAccountId) {
    const social = list.find((a) => a.accountId === credentials.socialCloudAccountId);
    if (social) return social;
  }
  return list[0];
}

/** Ensure legacy `s3::{pn}` style ids remain valid when only one account exists */
export function normalizeLegacyAccountIds(
  credentials: StorageCredentialsEnvelope,
  pnIdentifier: string
): StorageCredentialsEnvelope {
  const pn = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const patch = <T extends { accountId: string }>(
    accounts: T[] | undefined,
    provider: StorageProviderId
  ): T[] | undefined => {
    if (!accounts?.length) return accounts;
    if (accounts.length === 1 && !accounts[0].accountId.includes('::' + pn + '::')) {
      const legacy = legacyAccountId(provider, pn);
      if (accounts[0].accountId === legacy || accounts[0].accountId.startsWith(`${provider}::`)) {
        return [{ ...accounts[0], accountId: accounts[0].accountId || legacy }];
      }
    }
    return accounts;
  };
  return {
    ...credentials,
    awsS3Accounts: patch(credentials.awsS3Accounts, 'aws_s3'),
    azureBlobAccounts: patch(credentials.azureBlobAccounts, 'azure_blob'),
    dropboxAccounts: patch(credentials.dropboxAccounts, 'dropbox'),
    onedriveAccounts: patch(credentials.onedriveAccounts, 'onedrive'),
    ftpAccounts: patch(credentials.ftpAccounts, 'ftp')
  };
}
