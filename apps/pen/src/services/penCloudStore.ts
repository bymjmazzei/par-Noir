/**
 * Pen cloud SoT — create / list / draft upsert / publish via apply-inbound + library index.
 * Offline buffer lives in penLocalStore; this module is the durable path.
 */

import {
  PEN_DOC_BOOTSTRAP_KIND,
  PEN_DRAFT_UPSERT_KIND,
  PEN_PUBLISH_KIND,
  pastVersionId,
  type PenDocManifest,
  type PenDraftManifest,
  type PenHistoryChain,
  type PenPromoteLink,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import type { LocalDocBundle, LocalDocSummary } from './penLocalStore';

function b64Json(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, 'utf8').toString('base64');
}

function sectionsToCipherMap(sections: PenSectionContent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sections) {
    out[s.slug] = b64Json(s);
  }
  return out;
}

export async function bootstrapDocCloud(params: {
  userPnIdentifier: string;
  bundle: LocalDocBundle;
  draft: PenDraftManifest;
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_DOC_BOOTSTRAP_KIND,
      docId: params.bundle.manifest.docId,
      groupId: params.bundle.manifest.groupId,
      manifest: params.bundle.manifest,
      draft: params.draft,
      sectionCiphertextsB64: sectionsToCipherMap(params.bundle.sections),
      chain: params.bundle.chain
    },
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `bootstrap_failed_${res.status}`);
  }
}

export async function upsertDraftCloud(params: {
  userPnIdentifier: string;
  manifest: PenDocManifest;
  draft: PenDraftManifest;
  sections: PenSectionContent[];
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_DRAFT_UPSERT_KIND,
      docId: params.manifest.docId,
      groupId: params.manifest.groupId,
      manifest: params.manifest,
      draft: params.draft,
      sectionCiphertextsB64: sectionsToCipherMap(params.sections)
    },
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `draft_upsert_failed_${res.status}`);
  }
}

export async function publishDocCloud(params: {
  userPnIdentifier: string;
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  link?: PenPromoteLink;
  sourceDraftId?: string;
  at?: Date;
}): Promise<string> {
  const at = params.at || new Date();
  const versionId = pastVersionId(at, { forceTime: true });
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_PUBLISH_KIND,
      docId: params.manifest.docId,
      groupId: params.manifest.groupId,
      versionId,
      sectionCiphertextsB64: sectionsToCipherMap(params.sections),
      toc: params.manifest.toc,
      link: params.link,
      sourceDraftId: params.sourceDraftId,
      manifest: {
        ...params.manifest,
        lifecycle: 'published',
        updatedAt: at.toISOString()
      }
    },
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `publish_failed_${res.status}`);
  }
  return versionId;
}

export async function listLibraryCloud(userPnIdentifier: string): Promise<LocalDocSummary[]> {
  const q = new URLSearchParams({ userPnIdentifier });
  const res = await ownerGet(`/api/pen/library?${q}`, { pnIdentifier: userPnIdentifier });
  if (res.status === 409) {
    throw new Error('cloud_token_required');
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `library_list_failed_${res.status}`);
  }
  const data = (await res.json()) as { docs?: LocalDocSummary[] };
  return Array.isArray(data.docs) ? data.docs : [];
}

export async function loadDocFromDrive(params: {
  userPnIdentifier: string;
  docId: string;
}): Promise<{
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: PenSectionContent[];
}> {
  // Download doc.json + current/*.pen via Drive list/download
  const listRes = await ownerGet(
    `/api/drive/files?q=${encodeURIComponent(
      `name='doc.json' and trashed=false`
    )}&pageSize=20`,
    { pnIdentifier: params.userPnIdentifier }
  );
  // Prefer apply path: client keeps offline buffer; hydrate library from index.
  // Full tree hydrate uses Drive file download when file ids known — for MVP,
  // callers use offline buffer after bootstrap/sync and library index for list.
  void listRes;
  void params.docId;
  return { manifest: null, chain: null, currentSections: [] };
}
