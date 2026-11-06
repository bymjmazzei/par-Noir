import type { OwnerFileRow } from './model';
import { stripEncryptedSuffix } from './names';

export function makeAccountKey(provider: string, accountId: string): string {
  return `${provider}::${accountId}`;
}

export function parseAccountKey(accountKey: string): { provider: string; accountId: string } {
  const at = accountKey.indexOf('::');
  if (at < 0) return { provider: accountKey, accountId: '' };
  return { provider: accountKey.slice(0, at), accountId: accountKey.slice(at + 2) };
}

/** Metadata-index id for share / edit / delete actions. */
export function rowMetadataId(row: OwnerFileRow): string {
  return row.metadataIndexFileId || row.id;
}

/** Save-as name: prefer a name that still carries its extension. */
export function downloadFileName(row: OwnerFileRow): string {
  const candidates = [row.displayName, stripEncryptedSuffix(row.name)];
  return candidates.find((n) => /\.[a-z0-9]{1,8}$/i.test(n)) || row.displayName || 'download';
}
