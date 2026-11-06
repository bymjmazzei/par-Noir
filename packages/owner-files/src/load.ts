/**
 * Loads the owner inventory through an app transport.
 * Index-first: when a device owner index exists, Drive is scanned only on verify (Refresh).
 */
import { buildOwnerInventory, type AccountSource } from './inventory';
import type { OwnerAccount, OwnerCatalogRow, OwnerInventory } from './model';
import { isCollectionFileName, isNoteThumbnailFileName } from './names';
import type { OwnerFilesTransport } from './transport';

export interface LoadOwnerInventoryOptions {
  accounts: OwnerAccount[];
  /** Scan Drive even when an owner index exists (Refresh / after mutations). */
  verifyWithDrive?: boolean;
  /** Raw per-account failure (apps inspect codes for token retry). */
  onAccountError?: (account: OwnerAccount, error: unknown) => void;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function loadAccount(
  transport: OwnerFilesTransport,
  account: OwnerAccount,
  verifyWithDrive: boolean,
  onAccountError?: LoadOwnerInventoryOptions['onAccountError']
): Promise<AccountSource> {
  let index: AccountSource['index'] = null;
  if (transport.fetchOwnerIndex) {
    try {
      index = await transport.fetchOwnerIndex(account);
    } catch (err) {
      onAccountError?.(account, err);
      index = null;
    }
  }
  if (index?.length && !verifyWithDrive) return { index };
  try {
    return { index, listings: await transport.listDriveFiles(account) };
  } catch (err) {
    onAccountError?.(account, err);
    // A failed verify scan is non-blocking when the index already lists the files.
    return index?.length ? { index } : { index, error: errorMessage(err) };
  }
}

export async function loadOwnerInventory(
  transport: OwnerFilesTransport,
  options: LoadOwnerInventoryOptions
): Promise<OwnerInventory> {
  const { accounts, verifyWithDrive = false, onAccountError } = options;
  const [catalog, ...sourceList] = await Promise.all([
    transport.fetchOwnerCatalog().catch((): OwnerCatalogRow[] | null => null),
    ...accounts.map((account) => loadAccount(transport, account, verifyWithDrive, onAccountError))
  ]);
  const sources: Record<string, AccountSource> = {};
  accounts.forEach((account, i) => {
    sources[account.accountKey] = sourceList[i] as AccountSource;
  });

  const metadataById: Record<string, Record<string, unknown>> = {};
  if (catalog === null && transport.fetchMetadata) {
    const ids = Object.values(sources)
      .flatMap((s) => s.listings || [])
      .filter((f) => isNoteThumbnailFileName(f.name) || isCollectionFileName(f.name))
      .map((f) => f.id);
    await Promise.all(
      ids.map(async (id) => {
        const meta = await transport.fetchMetadata!(id).catch(() => null);
        if (meta) metadataById[id] = meta;
      })
    );
  }

  return buildOwnerInventory({ accounts, sources, catalog: catalog as OwnerCatalogRow[] | null, metadataById });
}
