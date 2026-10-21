/**
 * Pen library and doc tree on the owner's Drive (`par-noir-pen/`), read and written on the device.
 * Bodies stay opaque here: section files are docKey envelopes, decrypted by penCloudDoc.
 */

import { PEN_ROOT, docRootPath, sanitizeSegment } from '@par-noir/pen-protocol';
import { deviceDriveCall } from './deviceDriveCall.js';

const FOLDER = 'application/vnd.google-apps.folder';

export type PenCloudSectionFile = { slug: string; ciphertext: string };

export type PenDocTree = {
  manifest: unknown;
  chain: unknown;
  currentSections: PenCloudSectionFile[];
  drafts: Array<{ draft: unknown; sections: PenCloudSectionFile[] }>;
};

async function findChild(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType?: string
): Promise<string | null> {
  const parts = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `'${parentId}' in parents`,
    'trashed=false',
  ];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=1`, undefined, {
    accessToken,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id || null;
}

async function listChildren(
  accessToken: string,
  parentId: string,
  mimeType?: string
): Promise<Array<{ id: string; name: string }>> {
  const parts = [`'${parentId}' in parents`, 'trashed=false'];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=100`, undefined, {
    accessToken,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  return (data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id as string, name: f.name as string }));
}

export async function downloadDriveText(accessToken: string, fileId: string): Promise<string> {
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    undefined,
    { accessToken }
  );
  if (!res.ok) return '';
  return res.text();
}

function docFolderName(docId: string): string {
  return docRootPath(docId).split('/').pop() || sanitizeSegment(docId);
}

export async function penRootFolderId(accessToken: string, pnFolderId: string): Promise<string | null> {
  return findChild(accessToken, pnFolderId, PEN_ROOT, FOLDER);
}

export async function readLibraryIndex(
  accessToken: string,
  pnFolderId: string
): Promise<Record<string, unknown>[]> {
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return [];
  const indexId = await findChild(accessToken, root, 'library.index.json');
  if (!indexId) return [];
  const text = await downloadDriveText(accessToken, indexId);
  try {
    const parsed = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readNamedJson<T>(
  accessToken: string,
  parentId: string,
  name: string
): Promise<T | null> {
  const id = await findChild(accessToken, parentId, name);
  if (!id) return null;
  const text = await downloadDriveText(accessToken, id);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function readSectionFiles(accessToken: string, folderId: string): Promise<PenCloudSectionFile[]> {
  const out: PenCloudSectionFile[] = [];
  for (const file of await listChildren(accessToken, folderId)) {
    if (!file.name.endsWith('.pen')) continue;
    out.push({
      slug: file.name.replace(/\.pen$/, ''),
      ciphertext: await downloadDriveText(accessToken, file.id),
    });
  }
  return out;
}

/** Opaque doc tree: doc.json, history.chain, current/*.pen, drafts. */
export async function readDocTree(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
}): Promise<PenDocTree | null> {
  const root = await penRootFolderId(params.accessToken, params.pnFolderId);
  if (!root) return null;
  const docFolder = await findChild(params.accessToken, root, docFolderName(params.docId), FOLDER);
  if (!docFolder) return null;
  const manifest = await readNamedJson(params.accessToken, docFolder, 'doc.json');
  const chainFile = await findChild(params.accessToken, docFolder, 'history.chain');
  let chain: unknown = null;
  if (chainFile) {
    const text = await downloadDriveText(params.accessToken, chainFile);
    try {
      chain = text ? JSON.parse(text) : null;
    } catch {
      chain = text ? { raw: text } : null;
    }
  }
  const currentDir = await findChild(params.accessToken, docFolder, 'current', FOLDER);
  const currentSections = currentDir ? await readSectionFiles(params.accessToken, currentDir) : [];
  const draftsDir = await findChild(params.accessToken, docFolder, 'drafts', FOLDER);
  const drafts: PenDocTree['drafts'] = [];
  if (draftsDir) {
    for (const folder of await listChildren(params.accessToken, draftsDir, FOLDER)) {
      const draft = await readNamedJson(params.accessToken, folder.id, 'draft.json');
      const sections = await readSectionFiles(params.accessToken, folder.id);
      if (draft) drafts.push({ draft, sections });
    }
  }
  if (!manifest || !chain) return null;
  return { manifest, chain, currentSections, drafts };
}

function textToB64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

async function ensureChildFolder(
  accessToken: string,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChild(accessToken, parentId, name, FOLDER);
  if (existing) return existing;
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    { folderName: name, parentFolderId: parentId },
    { accessToken }
  );
  if (!res.ok) throw new Error(`folder_create_failed_${res.status}`);
  const data = (await res.json()) as { folder?: { id?: string } };
  if (!data.folder?.id) throw new Error('folder_create_no_id');
  return data.folder.id;
}

async function writeNamedText(
  accessToken: string,
  parentId: string,
  name: string,
  text: string,
  mimeType = 'application/json'
): Promise<void> {
  const fileData = textToB64(text);
  const existing = await findChild(accessToken, parentId, name);
  if (existing) {
    const res = await deviceDriveCall(
      'PUT',
      `/api/drive/files/${encodeURIComponent(existing)}/content`,
      { fileData, mimeType },
      { accessToken }
    );
    if (!res.ok) throw new Error(`file_update_failed_${res.status}`);
    return;
  }
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/files',
    { fileData, fileName: name, mimeType, parents: [parentId] },
    { accessToken }
  );
  if (!res.ok) throw new Error(`file_create_failed_${res.status}`);
}

export async function ensurePenRoot(accessToken: string, pnFolderId: string): Promise<string> {
  const existing = await penRootFolderId(accessToken, pnFolderId);
  if (existing) return existing;
  return ensureChildFolder(accessToken, pnFolderId, PEN_ROOT);
}

/** `media` or `public` under par-noir-pen/{docId}/. */
export async function ensureDocChildFolder(
  accessToken: string,
  pnFolderId: string,
  docId: string,
  child: 'media' | 'public'
): Promise<string> {
  const root = await ensurePenRoot(accessToken, pnFolderId);
  const docFolder = await ensureChildFolder(accessToken, root, docFolderName(docId));
  return ensureChildFolder(accessToken, docFolder, child);
}

export async function writeLibraryIndex(
  accessToken: string,
  pnFolderId: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const root = await ensurePenRoot(accessToken, pnFolderId);
  await writeNamedText(accessToken, root, 'library.index.json', JSON.stringify(rows));
}

export async function upsertLibrarySummary(
  accessToken: string,
  pnFolderId: string,
  summary: Record<string, unknown>
): Promise<void> {
  const rows = await readLibraryIndex(accessToken, pnFolderId);
  const docId = String(summary.docId || '');
  const next = rows.filter((row) => String(row.docId || '') !== docId);
  next.unshift(summary);
  await writeLibraryIndex(accessToken, pnFolderId, next);
}

export async function writePenDocFiles(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
  manifest: unknown;
  chain?: unknown;
  currentSections?: PenCloudSectionFile[];
  draft?: {
    id: string;
    draft: unknown;
    sections?: PenCloudSectionFile[];
  };
}): Promise<void> {
  const root = await ensurePenRoot(params.accessToken, params.pnFolderId);
  const docFolder = await ensureChildFolder(params.accessToken, root, docFolderName(params.docId));
  await writeNamedText(params.accessToken, docFolder, 'doc.json', JSON.stringify(params.manifest));
  if (params.chain !== undefined) {
    await writeNamedText(
      params.accessToken,
      docFolder,
      'history.chain',
      JSON.stringify(params.chain)
    );
  }
  if (params.currentSections) {
    const current = await ensureChildFolder(params.accessToken, docFolder, 'current');
    for (const section of params.currentSections) {
      await writeNamedText(
        params.accessToken,
        current,
        `${sanitizeSegment(section.slug)}.pen`,
        section.ciphertext,
        'text/plain'
      );
    }
  }
  if (params.draft) {
    const drafts = await ensureChildFolder(params.accessToken, docFolder, 'drafts');
    const draftFolder = await ensureChildFolder(params.accessToken, drafts, params.draft.id);
    await writeNamedText(
      params.accessToken,
      draftFolder,
      'draft.json',
      JSON.stringify(params.draft.draft)
    );
    for (const section of params.draft.sections || []) {
      await writeNamedText(
        params.accessToken,
        draftFolder,
        `${sanitizeSegment(section.slug)}.pen`,
        section.ciphertext,
        'text/plain'
      );
    }
  }
}

const LIVE_SNAPSHOT_FILE = 'live.ysnap';

/** Sealed Yjs live state (docKey envelope JSON) beside doc.json. */
export async function writeLiveSnapshotFile(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
  sealedJson: string;
}): Promise<void> {
  const root = await ensurePenRoot(params.accessToken, params.pnFolderId);
  const docFolder = await ensureChildFolder(params.accessToken, root, docFolderName(params.docId));
  await writeNamedText(params.accessToken, docFolder, LIVE_SNAPSHOT_FILE, params.sealedJson);
}

export async function readLiveSnapshotFile(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
}): Promise<string | null> {
  const root = await penRootFolderId(params.accessToken, params.pnFolderId);
  if (!root) return null;
  const docFolder = await findChild(params.accessToken, root, docFolderName(params.docId), FOLDER);
  if (!docFolder) return null;
  const id = await findChild(params.accessToken, docFolder, LIVE_SNAPSHOT_FILE);
  if (!id) return null;
  return (await downloadDriveText(params.accessToken, id)) || null;
}

export async function removePenDoc(
  accessToken: string,
  pnFolderId: string,
  docId: string
): Promise<void> {
  const rows = (await readLibraryIndex(accessToken, pnFolderId)).filter(
    (row) => String(row.docId || '') !== docId
  );
  await writeLibraryIndex(accessToken, pnFolderId, rows);
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return;
  const folder = await findChild(accessToken, root, docFolderName(docId), FOLDER);
  if (!folder) return;
  await deviceDriveCall('DELETE', `/api/drive/files/${encodeURIComponent(folder)}`, undefined, {
    accessToken,
  });
}
