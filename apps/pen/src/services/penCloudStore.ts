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
import { ownerFetch } from './penOwnerFetch';
import type { LocalDocBundle, LocalDocSummary } from './penLocalStore';
import {
  loadDocKey,
  mintDocKey,
  sectionsToWireCipherMap,
  decryptSectionPayload,
} from './penDocCrypto';
import { ensureOwnerDocGroup } from './penCollab';
import type { PenSession } from './penSession';

function sectionEntries(
  map: Record<string, string> | undefined
): Array<{ slug: string; ciphertext: string }> {
  return Object.entries(map || {}).map(([slug, ciphertext]) => ({
    slug,
    ciphertext: String(ciphertext),
  }));
}

function draftFolderId(draft: { draftId?: string; id?: string } | undefined): string {
  return String(draft?.draftId || draft?.id || 'draft');
}

async function writeThenAck(
  userPnIdentifier: string,
  body: Record<string, unknown>
): Promise<Response> {
  return ownerFetch(
    'POST',
    '/api/pen/apply-inbound',
    { ...body, deviceCloudResult: { provider: 'google', docId: body.docId } },
    { pnIdentifier: userPnIdentifier }
  );
}

export async function bootstrapDocCloud(params: {
  userPnIdentifier: string;
  bundle: LocalDocBundle;
  draft: PenDraftManifest;
  /** When set, registers owner-wrapped docKey so cold open can decrypt after lock. */
  session?: Pick<PenSession, 'pnIdentifier' | 'mlKemSecretKey'>;
}): Promise<void> {
  const docId = params.bundle.manifest.docId;
  const docKey = mintDocKey(docId);
  const sectionCiphertextsB64 = await sectionsToWireCipherMap(params.bundle.sections, docKey);
  const { penSessionDrive, upsertLibrarySummary, writePenDocFiles } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(params.userPnIdentifier);
  const sections = sectionEntries(sectionCiphertextsB64);
  await writePenDocFiles({
    accessToken: drive.accessToken,
    pnFolderId: drive.index.pnFolderId,
    docId,
    manifest: params.bundle.manifest,
    chain: params.bundle.chain,
    draft: {
      id: draftFolderId(params.draft),
      draft: params.draft,
      sections,
    },
  });
  await upsertLibrarySummary(drive.accessToken, drive.index.pnFolderId, {
    docId,
    title: params.bundle.manifest.title || 'Untitled',
    templateId: params.bundle.manifest.templateId || '',
    classId: params.bundle.manifest.classId,
    updatedAt: params.bundle.manifest.updatedAt || new Date().toISOString(),
  });
  const res = await writeThenAck(params.userPnIdentifier, {
    userPnIdentifier: params.userPnIdentifier,
    jobType: PEN_DOC_BOOTSTRAP_KIND,
    docId,
    groupId: params.bundle.manifest.groupId,
    manifest: params.bundle.manifest,
    draft: params.draft,
    sectionCiphertextsB64,
    chain: params.bundle.chain,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `bootstrap_failed_${res.status}`);
  }
  const groupId = params.bundle.manifest.groupId;
  const mlKem = params.session?.mlKemSecretKey;
  if (groupId && mlKem) {
    try {
      await ensureOwnerDocGroup({
        ownerPnIdentifier: params.userPnIdentifier,
        groupId,
        title: params.bundle.manifest.title || 'Untitled',
        docKey,
        mlKemSecretKey: mlKem
      });
    } catch {
      /* Drive SoT already written — key custody is best-effort for cold open */
    }
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
  const { penSessionDrive, writePenDocFiles } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(params.userPnIdentifier);
  await writePenDocFiles({
    accessToken: drive.accessToken,
    pnFolderId: drive.index.pnFolderId,
    docId: params.manifest.docId,
    manifest: params.manifest,
    draft: {
      id: draftFolderId(params.draft),
      draft: params.draft,
      sections: sectionEntries(sectionCiphertextsB64),
    },
  });
  const res = await writeThenAck(params.userPnIdentifier, {
    userPnIdentifier: params.userPnIdentifier,
    jobType: PEN_DRAFT_UPSERT_KIND,
    docId: params.manifest.docId,
    groupId: params.manifest.groupId,
    manifest: params.manifest,
    draft: params.draft,
    sectionCiphertextsB64,
  });
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
  const published = {
    ...params.manifest,
    lifecycle: 'published' as const,
    updatedAt: at.toISOString(),
  };
  const { penSessionDrive, upsertLibrarySummary, writePenDocFiles } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(params.userPnIdentifier);
  await writePenDocFiles({
    accessToken: drive.accessToken,
    pnFolderId: drive.index.pnFolderId,
    docId: params.manifest.docId,
    manifest: published,
    chain: { versionId },
    currentSections: sectionEntries(sectionCiphertextsB64),
  });
  await upsertLibrarySummary(drive.accessToken, drive.index.pnFolderId, {
    docId: params.manifest.docId,
    title: published.title || 'Untitled',
    templateId: published.templateId || '',
    classId: published.classId,
    updatedAt: published.updatedAt,
  });
  const res = await writeThenAck(params.userPnIdentifier, {
    userPnIdentifier: params.userPnIdentifier,
    jobType: PEN_PUBLISH_KIND,
    docId: params.manifest.docId,
    groupId: params.manifest.groupId,
    versionId,
    sectionCiphertextsB64,
    toc: params.manifest.toc,
    link: params.link,
    sourceDraftId: params.sourceDraftId,
    manifest: published,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `publish_failed_${res.status}`);
  }
  return versionId;
}

export async function listLibraryCloud(userPnIdentifier: string): Promise<LocalDocSummary[]> {
  const { penSessionDrive, readLibraryIndex } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(userPnIdentifier);
  const rows = await readLibraryIndex(drive.accessToken, drive.index.pnFolderId);
  return rows
    .filter((row) => typeof row.docId === 'string' && row.docId)
    .map((row) => ({
      docId: String(row.docId),
      title: String(row.title || 'Untitled'),
      templateId: String(row.templateId || ''),
      classId: typeof row.classId === 'string' ? row.classId : undefined,
      updatedAt: String(row.updatedAt || ''),
      folderId: (row.folderId as string | null | undefined) ?? null,
    }));
}

/** Remove from library.index.json and trash the Drive doc folder. */
export async function deleteDocCloud(params: {
  userPnIdentifier: string;
  docId: string;
}): Promise<void> {
  const { penSessionDrive, removePenDoc } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(params.userPnIdentifier);
  await removePenDoc(drive.accessToken, drive.index.pnFolderId, params.docId);
  const res = await writeThenAck(params.userPnIdentifier, {
    userPnIdentifier: params.userPnIdentifier,
    jobType: PEN_DOC_DELETE_KIND,
    docId: params.docId,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `doc_delete_failed_${res.status}`);
  }
}

/** Patch library index title / folderId / gallery preview refs without rewriting section bodies. */
export async function updateDocMetaCloud(params: {
  userPnIdentifier: string;
  docId: string;
  title?: string;
  folderId?: string | null;
  galleryPreviewRef?: string;
  galleryPreviewKind?: 'image' | 'video';
  galleryPreviewPosterRef?: string;
  galleryPreviewCommitHash?: string;
}): Promise<void> {
  const body: Record<string, unknown> = {
    userPnIdentifier: params.userPnIdentifier,
    jobType: 'pen.doc_meta',
    docId: params.docId
  };
  if (params.title !== undefined) body.title = params.title;
  if (params.folderId !== undefined) body.folderId = params.folderId;
  if (params.galleryPreviewRef !== undefined) body.galleryPreviewRef = params.galleryPreviewRef;
  if (params.galleryPreviewKind !== undefined) body.galleryPreviewKind = params.galleryPreviewKind;
  if (params.galleryPreviewPosterRef !== undefined) {
    body.galleryPreviewPosterRef = params.galleryPreviewPosterRef;
  }
  if (params.galleryPreviewCommitHash !== undefined) {
    body.galleryPreviewCommitHash = params.galleryPreviewCommitHash;
  }
  const { penSessionDrive, readLibraryIndex, writeLibraryIndex } = await import('./penDriveLibrary');
  const drive = await penSessionDrive(params.userPnIdentifier);
  const rows = await readLibraryIndex(drive.accessToken, drive.index.pnFolderId);
  const next = rows.map((row) => {
    if (String(row.docId || '') !== params.docId) return row;
    return {
      ...row,
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.folderId !== undefined ? { folderId: params.folderId } : {}),
    };
  });
  await writeLibraryIndex(drive.accessToken, drive.index.pnFolderId, next);
  const res = await writeThenAck(params.userPnIdentifier, body);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `doc_meta_failed_${res.status}`);
  }
}

export type CloudSectionPayload = { slug: string; ciphertext: string };

export type CloudDocRaw = {
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: CloudSectionPayload[] | PenSectionContent[];
  drafts: Array<{
    draft: PenDraftManifest;
    sections: CloudSectionPayload[] | PenSectionContent[];
  }>;
};

async function decodeCloudSections(
  list: CloudSectionPayload[] | PenSectionContent[] | undefined,
  docKey: string | null
): Promise<PenSectionContent[]> {
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
}

/** Fetch opaque cloud replica (ciphertexts). Caller recovers docKey then decrypts. */
export async function fetchDocFromDrive(params: {
  userPnIdentifier: string;
  docId: string;
}): Promise<CloudDocRaw> {
  const { penSessionDrive, readDocTree } = await import('./penDriveLibrary');
  let drive: Awaited<ReturnType<typeof penSessionDrive>>;
  try {
    drive = await penSessionDrive(params.userPnIdentifier);
  } catch {
    return { manifest: null, chain: null, currentSections: [], drafts: [] };
  }
  const tree = await readDocTree({
    accessToken: drive.accessToken,
    pnFolderId: drive.index.pnFolderId,
    docId: params.docId,
  });
  if (!tree?.manifest || !tree.chain) {
    return { manifest: null, chain: null, currentSections: [], drafts: [] };
  }
  return {
    manifest: tree.manifest as PenDocManifest,
    chain: tree.chain as PenHistoryChain,
    currentSections: tree.currentSections,
    drafts: tree.drafts as CloudDocRaw['drafts'],
  };
}

export async function decryptCloudDoc(params: {
  raw: CloudDocRaw;
  docKey: string | null;
}): Promise<{
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: PenSectionContent[];
  drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }>;
}> {
  const { raw, docKey } = params;
  if (!raw.manifest || !raw.chain) {
    return { manifest: null, chain: null, currentSections: [], drafts: [] };
  }
  const currentSections = await decodeCloudSections(raw.currentSections, docKey);
  const drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }> = [];
  for (const d of raw.drafts || []) {
    drafts.push({
      draft: d.draft,
      sections: await decodeCloudSections(d.sections, docKey)
    });
  }
  return {
    manifest: raw.manifest,
    chain: raw.chain,
    currentSections,
    drafts
  };
}

export async function loadDocFromDrive(params: {
  userPnIdentifier: string;
  docId: string;
  /** Prefer caller-supplied key (after group unwrap); falls back to sessionStorage. */
  docKey?: string | null;
}): Promise<{
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: PenSectionContent[];
  drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }>;
}> {
  const raw = await fetchDocFromDrive(params);
  const docKey =
    params.docKey !== undefined ? params.docKey : loadDocKey(params.docId);
  return decryptCloudDoc({ raw, docKey });
}
