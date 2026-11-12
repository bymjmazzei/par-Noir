/**
 * Content Credentials on an index row, verified by the server from the post's public preview
 * (the rendition that carries the manifest, or a signed derivative pointing at it).
 * Clients never supply these fields; the PUT route drops them and this step writes them.
 */

import { createHash } from 'node:crypto';
import { authorKeyId } from '@par-noir/pen-protocol';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { resolveOriginality, type ManifestSummary, type OriginalityResult } from '@par-noir/pn-provenance';
import { verifyAsset } from './c2paService';
import { feedR2GetBytes } from './feedPreviewR2';
import { PublicNameService, normalizePnIdentifier } from './publicNameService';

export const C2PA_INDEX_KEYS = ['c2pa', 'originality', 'c2paSource'] as const;

export interface IndexedCredentials {
  c2pa: ManifestSummary | null;
  originality: OriginalityResult;
  /** Which preview was verified, so unrelated updates don't re-verify. */
  c2paSource: string;
}

type PreviewRef = { r2Key?: unknown; contentType?: unknown };

function previewSource(meta: Record<string, unknown>): { key: string; contentType: string } | null {
  for (const field of ['feedPreviewSd', 'feedPoster'] as const) {
    const ref = meta[field] as PreviewRef | undefined;
    if (ref && typeof ref.r2Key === 'string' && ref.r2Key) {
      return { key: ref.r2Key, contentType: typeof ref.contentType === 'string' ? ref.contentType : 'application/octet-stream' };
    }
  }
  return null;
}

function sourceId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Credentials for a public row, or `unchanged` when its preview was already verified,
 * or `clear` when it no longer has a preview to verify.
 */
export async function credentialsForRow(
  meta: Record<string, unknown>,
  uploaderPn: string,
  deps: {
    getBytes?: (key: string) => Promise<Uint8Array | null>;
    signingKey?: (pn: string) => Promise<string | null>;
  } = {}
): Promise<IndexedCredentials | 'unchanged' | 'clear'> {
  const source = previewSource(meta);
  if (!source) return meta.c2paSource ? 'clear' : 'unchanged';
  const id = sourceId(source.key);
  if (meta.c2paSource === id) return 'unchanged';

  const bytes = await (deps.getBytes ?? feedR2GetBytes)(source.key);
  const uploader = normalizePnIdentifier(uploaderPn);
  const ownKeys = new Set<string>();
  const summary = bytes
    ? await verifyAsset(bytes, source.contentType, {
        onAuthor: ({ authorKeyId: keyId, publicKey }) => {
          if (normalizePnIdentifier(deriveCanonicalPnIdentifier(publicKey)) === uploader) ownKeys.add(keyId);
        }
      })
    : null;
  const registered = await (deps.signingKey ?? ((pn) => PublicNameService.signingKey(pn)))(uploader).catch(() => null);
  if (registered) ownKeys.add(authorKeyId(registered));

  // Every public post can earn from the creator fund, so non-commercial licenses don't cover reuse.
  const originality = resolveOriginality(summary, { authorKeyIds: [...ownKeys] }, { monetized: true });
  return { c2pa: summary, originality, c2paSource: id };
}

/** Verify and store a public row's credentials. Never fails the index write. */
export async function indexContentCredentials(
  service: {
    updateMetadata(fileId: string, updates: { provenance?: Record<string, unknown>; clearKeys?: string[] }): Promise<unknown>;
  },
  row: { fileId: string; metadata: Record<string, unknown>; pnIdentifier?: string | null },
  uploaderPn: string | undefined
): Promise<void> {
  const owner = row.pnIdentifier || uploaderPn;
  if (!owner || row.metadata.isPublic !== true) return;
  try {
    const result = await credentialsForRow(row.metadata, owner);
    if (result === 'unchanged') return;
    if (result === 'clear') {
      await service.updateMetadata(row.fileId, { clearKeys: [...C2PA_INDEX_KEYS] });
      return;
    }
    await service.updateMetadata(row.fileId, { provenance: { ...result } });
  } catch (err) {
    console.warn(`[c2paIndex] credentials skipped for ${row.fileId}:`, err instanceof Error ? err.message : err);
  }
}
