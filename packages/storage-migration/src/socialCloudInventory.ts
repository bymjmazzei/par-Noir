import { JSON_BLOB_PATHS, METADATA_DIR, metadataPath } from '@par-noir/user-owned-storage';

export interface SocialCloudInventoryItem {
  path: string;
  kind: 'table_db' | 'json' | 'index' | 'other';
  estimatedBytes?: number;
}

export interface SocialCloudInventory {
  items: SocialCloudInventoryItem[];
  totalEstimatedBytes: number;
}

const KNOWN_JSON_PATHS = [
  JSON_BLOB_PATHS.profile,
  JSON_BLOB_PATHS.preferences,
  JSON_BLOB_PATHS.devicePolicy,
  metadataPath('social-cloud-migration.json')
];

/** Classify a blob key relative to root prefix */
export function classifyMetadataKey(relativeKey: string): SocialCloudInventoryItem['kind'] {
  if (relativeKey.endsWith('.db')) return 'table_db';
  if (relativeKey.endsWith('.json') || relativeKey.endsWith('.jsonl')) return 'json';
  if (relativeKey.includes('-index')) return 'index';
  return 'other';
}

export function buildPortableInventoryFromList(
  entries: Array<{ key: string; size?: number }>,
  rootPrefix: string
): SocialCloudInventory {
  const items: SocialCloudInventoryItem[] = [];
  let total = 0;
  for (const entry of entries) {
    const rel = entry.key.startsWith(rootPrefix)
      ? entry.key.slice(rootPrefix.length)
      : entry.key;
    if (!rel.startsWith(METADATA_DIR)) continue;
    const size = entry.size ?? 0;
    items.push({
      path: rel,
      kind: classifyMetadataKey(rel),
      estimatedBytes: size
    });
    total += size;
  }
  for (const p of KNOWN_JSON_PATHS) {
    if (!items.some((i) => i.path === p)) {
      items.push({ path: p, kind: 'json', estimatedBytes: 0 });
    }
  }
  return { items, totalEstimatedBytes: total };
}
