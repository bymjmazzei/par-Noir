import {
  JSON_BLOB_PATHS,
  PORTABLE_LAYOUT_TABLES,
  resolveSocialCloudProvider,
  type StorageCredentialsEnvelope,
} from '@par-noir/user-owned-storage';
import { createDeviceBlobStore, layoutRootFor } from '../deviceBlobStore.js';
import { createDeviceTableStore } from '../deviceTables.js';

/**
 * Build a new portable social cloud from this device: the empty table files plus
 * the profile and preferences blobs. Existing files are left untouched. Returns the
 * layout root the API records, or null when the social cloud is Google Drive.
 */
export async function initializeDevicePortableLayout(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  opts: { fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<{ pathPrefix: string } | null> {
  const provider = resolveSocialCloudProvider(credentials);
  if (!provider || provider === 'google_drive') return null;

  const tables = await createDeviceTableStore(pnIdentifier, credentials, { fetchImpl: opts.fetchImpl });
  for (const schema of PORTABLE_LAYOUT_TABLES) {
    await tables.ensureTable(schema);
  }

  const blobs = createDeviceBlobStore(pnIdentifier, credentials, {
    accountId: credentials.socialCloudAccountId,
    fetchImpl: opts.fetchImpl,
  });
  const pathPrefix = layoutRootFor(pnIdentifier, credentials);
  const updatedAt = (opts.now?.() ?? new Date()).toISOString();
  const defaults: Array<[string, Record<string, unknown>]> = [
    [JSON_BLOB_PATHS.profile, { identifier: pnIdentifier, updatedAt }],
    [JSON_BLOB_PATHS.preferences, { identifier: pnIdentifier, updatedAt, tagPreferences: [] }],
  ];
  for (const [path, body] of defaults) {
    const key = `${pathPrefix}${path}`;
    if (await blobs.head(key)) continue;
    await blobs.put(key, JSON.stringify(body), { contentType: 'application/json' });
  }

  return { pathPrefix };
}
