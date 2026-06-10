import {
  DelegateTableAdapter,
  SqliteBlobTableAdapter,
  readCachedLayout,
  resolveSocialCloudProvider,
  type BlobStore,
  type StorageCredentialsEnvelope,
  type StorageProviderId,
  type TableSchema,
  type UserOwnedTableStore
} from '@par-noir/user-owned-storage';
import { pnRootFolderName } from '@par-noir/user-owned-storage';
import { storageCredentialsService } from '../storageCredentialsService';
import { createBlobStoreForProvider } from './blobAdapters';
import { createGoogleSheetsTableHooks, type DriveTableContext } from './sheetsTableBridge';

export interface StorageContext {
  pnIdentifier: string;
  provider: StorageProviderId;
  credentials: StorageCredentialsEnvelope;
  blobStore: BlobStore | null;
  tableStore: UserOwnedTableStore;
  rootPrefix: string;
  metadataFolderId?: string;
  accountId?: string;
  isSocialCloud?: boolean;
}

async function loadCredentials(pnIdentifier: string): Promise<StorageCredentialsEnvelope> {
  const record = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!record?.credentials) {
    throw new Error('Storage not connected');
  }
  return record.credentials as StorageCredentialsEnvelope;
}

function rootPrefixFor(pnIdentifier: string, credentials: StorageCredentialsEnvelope): string {
  const layout = readCachedLayout(credentials);
  if (layout.pathPrefix) {
    return layout.pathPrefix.endsWith('/') ? layout.pathPrefix : `${layout.pathPrefix}/`;
  }
  return `${pnRootFolderName(pnIdentifier)}/`;
}

async function buildGoogleDriveContext(
  pnIdentifier: string,
  accountId?: string
): Promise<DriveTableContext> {
  const credentials = await loadCredentials(pnIdentifier);
  const layout = readCachedLayout(credentials);
  const metadataFolderId = layout.nodeIds?.metadataFolderId;
  if (!metadataFolderId) {
    throw new Error('Google Drive metadata folder not initialized');
  }
  const { googleDriveProxyService } = await import('../googleDriveProxy');
  const accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, [
    pnIdentifier
  ]);
  return {
    token: { access_token: accessToken },
    metadataFolderId,
    pnIdentifier,
    accountId
  };
}

async function buildContextForProvider(
  normalized: string,
  credentials: StorageCredentialsEnvelope,
  provider: StorageProviderId,
  accountId?: string,
  isSocialCloud = false
): Promise<StorageContext> {
  const rootPrefix = rootPrefixFor(normalized, credentials);
  const layout = readCachedLayout(credentials);

  if (provider === 'google_drive') {
    const { googleDriveProxyService } = await import('../googleDriveProxy');
    await googleDriveProxyService.getAccessToken(normalized, accountId, [normalized]);
    const tableStore = new DelegateTableAdapter(
      createGoogleSheetsTableHooks(() => buildGoogleDriveContext(normalized, accountId))
    );
    return {
      pnIdentifier: normalized,
      provider,
      credentials,
      blobStore: null,
      tableStore,
      rootPrefix,
      metadataFolderId: layout.nodeIds?.metadataFolderId,
      accountId,
      isSocialCloud
    };
  }

  const blobStore = await createBlobStoreForProvider(normalized, credentials, provider, accountId);
  const tableStore = new SqliteBlobTableAdapter(blobStore, rootPrefix);

  return {
    pnIdentifier: normalized,
    provider,
    credentials,
    blobStore,
    tableStore,
    rootPrefix,
    accountId,
    isSocialCloud
  };
}

/** Tables, indexes, JSON metadata — always on social cloud */
export async function resolveSocialCloudContext(
  pnIdentifier: string,
  accountId?: string
): Promise<StorageContext> {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const credentials = await loadCredentials(normalized);
  const provider = resolveSocialCloudProvider(credentials);
  const socialAccountId = credentials.socialCloudAccountId ?? accountId;
  return buildContextForProvider(normalized, credentials, provider, socialAccountId, true);
}

/** File blob I/O on a specific connected provider */
export async function resolveFileBackendContext(
  pnIdentifier: string,
  provider: StorageProviderId,
  accountId?: string
): Promise<StorageContext> {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  const credentials = await loadCredentials(normalized);
  return buildContextForProvider(normalized, credentials, provider, accountId, false);
}

/** @deprecated use resolveSocialCloudContext for tables; resolveFileBackendContext for file blobs */
export async function resolveStorageContext(
  pnIdentifier: string,
  accountId?: string
): Promise<StorageContext> {
  return resolveSocialCloudContext(pnIdentifier, accountId);
}

export async function openTable(ctx: StorageContext, schema: TableSchema) {
  return ctx.tableStore.openTable(schema);
}

export async function getGoogleAccessToken(
  pnIdentifier: string,
  accountId?: string
): Promise<string> {
  const { googleDriveProxyService } = await import('../googleDriveProxy');
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return googleDriveProxyService.getAccessToken(normalized, accountId, [normalized]);
}

export function isPortableProvider(provider: StorageProviderId): boolean {
  return provider !== 'google_drive';
}
