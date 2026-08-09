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
  /**
   * Absolute ms epoch. Deliberately the only expiry field: a relative
   * `expires_in` has no issue time attached, so a reader that recomputes
   * `Date.now() + expires_in` treats a long-dead token as freshly minted.
   * Convert to absolute at the point of capture.
   */
  expires_at?: number;
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
  /** Required — least-privilege key prefix, typically `par-noir-{pn}` */
  prefix: string;
}

export interface AzureBlobAccount {
  accountId: string;
  accountName: string;
  container: string;
  /** Required for new connects — connection strings are rejected on write */
  sasToken: string;
  /** Rejected on provider upsert — do not use */
  connectionString?: string;
  /** Required — least-privilege blob prefix */
  prefix: string;
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

/** Secret field names stripped by API custody (`stripCloudSecrets`). */
export const CLOUD_SECRET_FIELDS = [
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'apiSecret',
  'clientSecret',
  'secretAccessKey',
  'password',
  'sasToken',
  'connectionString'
] as const;

export type CloudSessionReadiness = 'ready' | 'linkedInactive' | 'unlinked';

/** Layout-only account row from GET /api/storage/accounts (secrets usually absent). */
export interface ApiStorageAccountRef {
  provider: string;
  accountId?: string;
  email?: string;
  displayName?: string;
}

function nonEmptySecret(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** True when an account record still holds usable provider secrets. */
export function accountRecordHasUsableSecrets(acct: Record<string, unknown> | null | undefined): boolean {
  if (!acct || typeof acct !== 'object') return false;
  return CLOUD_SECRET_FIELDS.some((k) => nonEmptySecret(acct[k]));
}

function accountsForProvider(
  envelope: StorageCredentialsEnvelope,
  provider: string
): Record<string, unknown>[] {
  switch (provider) {
    case 'google_drive': {
      const list = (envelope.googleDriveAccounts ?? []) as Record<string, unknown>[];
      const legacy = (envelope as { googleDrive?: Record<string, unknown> }).googleDrive;
      return legacy ? [...list, legacy] : list;
    }
    case 'dropbox':
      return (envelope.dropboxAccounts ?? []) as unknown as Record<string, unknown>[];
    case 'aws_s3':
      return (envelope.awsS3Accounts ?? []) as unknown as Record<string, unknown>[];
    case 'azure_blob':
      return (envelope.azureBlobAccounts ?? []) as unknown as Record<string, unknown>[];
    case 'onedrive':
      return (envelope.onedriveAccounts ?? []) as unknown as Record<string, unknown>[];
    case 'ftp':
      return (envelope.ftpAccounts ?? []) as unknown as Record<string, unknown>[];
    default:
      return [];
  }
}

/**
 * True when the local/sealed envelope has usable secrets.
 * When `provider` is set, only that provider is checked; otherwise any connected provider.
 */
export function envelopeHasUsableSecrets(
  envelope: StorageCredentialsEnvelope | null | undefined,
  provider?: string | null
): boolean {
  if (!envelope) return false;
  if (provider) {
    return accountsForProvider(envelope, provider).some((a) => accountRecordHasUsableSecrets(a));
  }
  for (const p of listConnectedProviders(envelope)) {
    if (accountsForProvider(envelope, p).some((a) => accountRecordHasUsableSecrets(a))) {
      return true;
    }
  }
  return false;
}

/**
 * Decide whether this device/session can use linked cloud storage.
 *
 * - `unlinked` — API has no social-cloud layout / accounts
 * - `linkedInactive` — API layout exists but local secrets are missing
 * - `ready` — local envelope has usable secrets for the social (or any linked) provider
 */
export function assessCloudSessionReadiness(opts: {
  apiAccounts?: ApiStorageAccountRef[] | null;
  socialCloudProvider?: string | null;
  localEnvelope?: StorageCredentialsEnvelope | null;
}): CloudSessionReadiness {
  const social = opts.socialCloudProvider?.trim() || null;
  const hasLayout = (opts.apiAccounts?.length ?? 0) > 0 || !!social;
  if (!hasLayout) return 'unlinked';

  if (social && envelopeHasUsableSecrets(opts.localEnvelope, social)) {
    return 'ready';
  }
  if (envelopeHasUsableSecrets(opts.localEnvelope)) {
    return 'ready';
  }
  return 'linkedInactive';
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
