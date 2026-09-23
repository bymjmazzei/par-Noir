/**
 * Pen cloud SoT — create / list / draft upsert / publish via apply-inbound + library index.
 * Section bodies are AES-GCM envelopes under docKey (encryptMediaBytes).
 */

import {
  PEN_DOC_BOOTSTRAP_KIND,
  PEN_DOC_DELETE_KIND,
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
import {
  loadDocKey,
  mintDocKey,
  sectionsToWireCipherMap,
  decryptSectionPayload,
} from './penDocCrypto';

export async function bootstrapDocCloud(params: {
  userPnIdentifier: string;
  bundle: LocalDocBundle;
  draft: PenDraftManifest;
}): Promise<void> {
  const docId = params.bundle.manifest.docId;
  const docKey = mintDocKey(docId);
  const sectionCiphertextsB64 = await sectionsToWireCipherMap(params.bundle.sections, docKey);
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_DOC_BOOTSTRAP_KIND,
      docId,
      groupId: params.bundle.manifest.groupId,
      manifest: params.bundle.manifest,
      draft: params.draft,
      sectionCiphertextsB64,
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
  const docKey = mintDocKey(params.manifest.docId);
  const sectionCiphertextsB64 = await sectionsToWireCipherMap(params.sections, docKey);
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
      sectionCiphertextsB64
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
  const docKey = mintDocKey(params.manifest.docId);
  const sectionCiphertextsB64 = await sectionsToWireCipherMap(params.sections, docKey);
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_PUBLISH_KIND,
      docId: params.manifest.docId,
      groupId: params.manifest.groupId,
      versionId,
      sectionCiphertextsB64,
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

/** Remove from library.index.json and trash the Drive doc folder. */
export async function deleteDocCloud(params: {
  userPnIdentifier: string;
  docId: string;
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: PEN_DOC_DELETE_KIND,
      docId: params.docId
    },
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `doc_delete_failed_${res.status}`);
  }
}

/** Patch library index title / folderId without rewriting section bodies. */
export async function updateDocMetaCloud(params: {
  userPnIdentifier: string;
  docId: string;
  title?: string;
  folderId?: string | null;
}): Promise<void> {
  const res = await ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    {
      userPnIdentifier: params.userPnIdentifier,
      jobType: 'pen.doc_meta',
      docId: params.docId,
      title: params.title,
      folderId: params.folderId
    },
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `doc_meta_failed_${res.status}`);
  }
}

export type CloudSectionPayload = { slug: string; ciphertext: string };

export async function loadDocFromDrive(params: {
  userPnIdentifier: string;
  docId: string;
}): Promise<{
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: PenSectionContent[];
  drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }>;
}> {
  const res = await ownerGet(
    `/api/pen/docs/${encodeURIComponent(params.docId)}?userPnIdentifier=${encodeURIComponent(params.userPnIdentifier)}`,
    { pnIdentifier: params.userPnIdentifier }
  );
  if (!res.ok) {
    return { manifest: null, chain: null, currentSections: [], drafts: [] };
  }
  const data = (await res.json()) as {
    manifest?: PenDocManifest;
    chain?: PenHistoryChain;
    currentSections?: CloudSectionPayload[] | PenSectionContent[];
    drafts?: Array<{
      draft: PenDraftManifest;
      sections: CloudSectionPayload[] | PenSectionContent[];
    }>;
  };
  if (!data.manifest || !data.chain) {
    return { manifest: null, chain: null, currentSections: [], drafts: [] };
  }

  const docKey = loadDocKey(params.docId);
  const decodeList = async (
    list: CloudSectionPayload[] | PenSectionContent[] | undefined
  ): Promise<PenSectionContent[]> => {
    if (!list?.length) return [];
    const out: PenSectionContent[] = [];
    for (const item of list) {
      if (item && typeof item === 'object' && 'ciphertext' in item && 'slug' in item) {
        const payload = String((item as CloudSectionPayload).ciphertext || '');
        out.push(await decryptSectionPayload(payload, docKey));
      } else if (item && typeof item === 'object' && 'slug' in item) {
        // Legacy API returned parsed JSON sections
        out.push(item as PenSectionContent);
      }
    }
    return out;
  };

  const currentSections = await decodeList(data.currentSections);
  const drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }> = [];
  for (const d of data.drafts || []) {
    drafts.push({
      draft: d.draft,
      sections: await decodeList(d.sections)
    });
  }

  return {
    manifest: data.manifest,
    chain: data.chain,
    currentSections,
    drafts
  };
}
