import type { StorageCredentialsEnvelope, TableSchema, UserOwnedTableStore } from '@par-noir/user-owned-storage';
import { SEGMENTED_LEDGER_IDS } from '@par-noir/user-owned-storage';
import { getSessionCloudCredentials } from './sessionMemory.js';
import { createDeviceBlobStore, DeviceCloudLockedError, layoutRootFor } from './deviceBlobStore.js';

type Fetch = typeof fetch;

export type DeviceTableStore = UserOwnedTableStore & {
  /** Write an empty table file when none exists yet. */
  ensureTable(schema: TableSchema): Promise<void>;
};

let sqlJsWasmUrl: string | undefined;
let sqlJsConfigured = false;

/** Bundled apps pass their `sql.js/dist/sql-wasm.wasm?url` asset; Node finds the file itself. */
export function setSqlJsWasmUrl(url: string): void {
  sqlJsWasmUrl = url;
  sqlJsConfigured = false;
}

/**
 * SQLite tables on a non-Google social cloud. sql.js is imported here, on first
 * use, so Google Drive sessions never download the WASM engine.
 */
export async function createDeviceTableStore(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  opts: { fetchImpl?: Fetch } = {}
): Promise<DeviceTableStore> {
  const blobStore = createDeviceBlobStore(pnIdentifier, credentials, {
    accountId: credentials.socialCloudAccountId,
    fetchImpl: opts.fetchImpl,
  });
  const { SegmentedSqliteTableAdapter, configureSqlJs } = await import('@par-noir/user-owned-storage/sqlite');
  if (sqlJsWasmUrl && !sqlJsConfigured) {
    const url = sqlJsWasmUrl;
    configureSqlJs({ locateFile: () => url });
    sqlJsConfigured = true;
  }
  return new SegmentedSqliteTableAdapter(
    blobStore,
    layoutRootFor(pnIdentifier, credentials),
    SEGMENTED_LEDGER_IDS
  );
}

export async function deviceTableStoreForSession(
  pnIdentifier: string,
  opts: { fetchImpl?: Fetch } = {}
): Promise<DeviceTableStore> {
  const credentials = getSessionCloudCredentials(pnIdentifier);
  if (!credentials) throw new DeviceCloudLockedError();
  return createDeviceTableStore(pnIdentifier, credentials, opts);
}
