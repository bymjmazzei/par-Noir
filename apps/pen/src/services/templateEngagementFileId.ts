/**
 * Resolve CDN engagement fileId for a Pen template catalog row.
 * Match public pen-templates index by templateId / basedOnTemplateId / penDocId.
 */

import type { CentralIndexEntry } from '@par-noir/aggregator-domain';

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Build templateId → fileId map from central-index pen-templates entries. */
export function buildTemplateFileIdMap(entries: CentralIndexEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const fileId = entry.fileId || entry.metadata?.fileId;
    if (!fileId) continue;
    const meta = (entry.metadata || {}) as Record<string, unknown>;
    const keys = [
      metaString(meta, 'templateId'),
      metaString(meta, 'basedOnTemplateId'),
      metaString(meta, 'penDocId')
    ].filter((k): k is string => Boolean(k));
    for (const k of keys) {
      if (!map.has(k)) map.set(k, fileId);
    }
  }
  return map;
}

export function resolveTemplateEngagementFileId(
  templateId: string,
  fileIdByTemplateId: Map<string, string> | undefined
): string | null {
  if (!templateId || !fileIdByTemplateId) return null;
  return fileIdByTemplateId.get(templateId) ?? null;
}
