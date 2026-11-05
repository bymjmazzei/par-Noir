/**
 * Pen library and doc tree on the owner's Drive (`par-noir-pen/`), read and written on the device.
 * Bodies stay opaque here: section files are docKey envelopes, decrypted by penCloudDoc.
 * Writes to one doc (and to the library index) run one at a time so autosave, bootstrap,
 * live snapshot, media and publish never race each other into duplicate files.
 */

import { PEN_ROOT, docRootPath, sanitizeSegment } from '@par-noir/pen-protocol';
import { deviceDriveCall } from './deviceDriveCall.js';
import {
  DRIVE_FOLDER_MIME as FOLDER,
  ensureDriveChildFolder,
  findDriveChild,
  forgetDriveChild,
  runSerial,
  upsertDriveChildFile,
} from './driveChild.js';

export type PenCloudSectionFile = { slug: string; ciphertext: string };

export type PenDocTree = {
  manifest: unknown;
  chain: unknown;
  currentSections: PenCloudSectionFile[];
  drafts: Array<{ draft: unknown; sections: PenCloudSectionFile[] }>;
};

const LIBRARY_INDEX_FILE = 'library.index.json';
const LIVE_SNAPSHOT_FILE = 'live.ysnap';
const FONTS_DIR = 'fonts';

function docQueueKey(pnFolderId: string, docId: string): string {
  return `pen-doc|${pnFolderId}|${docId}`;
}

function libraryQueueKey(pnFolderId: string): string {
  return `pen-library|${pnFolderId}`;
}

function findChild(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType?: string
): Promise<string | null> {
  return findDriveChild(accessToken, parentId, name, { mimeType });
}

async function listChildren(
  accessToken: string,
  parentId: string,
  mimeType?: string
): Promise<Array<{ id: string; name: string }>> {
  const parts = [`'${parentId}' in parents`, 'trashed=false'];
  if (mimeType) parts.push(`mimeType='${mimeType}'`);
  const q = encodeURIComponent(parts.join(' and '));
  const res = await deviceDriveCall(
    'GET',
    `/api/drive/files?q=${q}&orderBy=createdTime&pageSize=100`,
    undefined,
    { accessToken }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const f of data.files || []) {
    if (!f.id || !f.name || seen.has(f.name)) continue;
    seen.add(f.name);
    out.push({ id: f.id, name: f.name });
  }
  return out;
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

export function ensurePenRoot(accessToken: string, pnFolderId: string): Promise<string> {
  return ensureDriveChildFolder(accessToken, pnFolderId, PEN_ROOT);
}

/** `par-noir-pen/{docId}/`: doc files, plus its Poll and Taps sheets. */
export async function ensureDocFolder(
  accessToken: string,
  pnFolderId: string,
  docId: string
): Promise<string> {
  const root = await ensurePenRoot(accessToken, pnFolderId);
  return ensureDriveChildFolder(accessToken, root, docFolderName(docId));
}

export async function readLibraryIndex(
  accessToken: string,
  pnFolderId: string
): Promise<Record<string, unknown>[]> {
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return [];
  const indexId = await findChild(accessToken, root, LIBRARY_INDEX_FILE);
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

/** `media` or `public` under par-noir-pen/{docId}/. */
export async function ensureDocChildFolder(
  accessToken: string,
  pnFolderId: string,
  docId: string,
  child: 'media' | 'public'
): Promise<string> {
  const docFolder = await ensureDocFolder(accessToken, pnFolderId, docId);
  return ensureDriveChildFolder(accessToken, docFolder, child);
}

async function writeLibraryIndexUnqueued(
  accessToken: string,
  pnFolderId: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const root = await ensurePenRoot(accessToken, pnFolderId);
  await upsertDriveChildFile(accessToken, root, LIBRARY_INDEX_FILE, JSON.stringify(rows));
}

export function writeLibraryIndex(
  accessToken: string,
  pnFolderId: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  return runSerial(libraryQueueKey(pnFolderId), () =>
    writeLibraryIndexUnqueued(accessToken, pnFolderId, rows)
  );
}

export function upsertLibrarySummary(
  accessToken: string,
  pnFolderId: string,
  summary: Record<string, unknown>
): Promise<void> {
  return runSerial(libraryQueueKey(pnFolderId), async () => {
    const rows = await readLibraryIndex(accessToken, pnFolderId);
    const docId = String(summary.docId || '');
    const next = rows.filter((row) => String(row.docId || '') !== docId);
    next.unshift(summary);
    await writeLibraryIndexUnqueued(accessToken, pnFolderId, next);
  });
}

export function writePenDocFiles(params: {
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
  return runSerial(docQueueKey(params.pnFolderId, params.docId), async () => {
    const { accessToken } = params;
    const docFolder = await ensureDocFolder(accessToken, params.pnFolderId, params.docId);
    await upsertDriveChildFile(accessToken, docFolder, 'doc.json', JSON.stringify(params.manifest));
    if (params.chain !== undefined) {
      await upsertDriveChildFile(accessToken, docFolder, 'history.chain', JSON.stringify(params.chain));
    }
    if (params.currentSections) {
      const current = await ensureDriveChildFolder(accessToken, docFolder, 'current');
      for (const section of params.currentSections) {
        await upsertDriveChildFile(
          accessToken,
          current,
          `${sanitizeSegment(section.slug)}.pen`,
          section.ciphertext,
          'text/plain'
        );
      }
    }
    if (params.draft) {
      const drafts = await ensureDriveChildFolder(accessToken, docFolder, 'drafts');
      const draftFolder = await ensureDriveChildFolder(accessToken, drafts, params.draft.id);
      await upsertDriveChildFile(accessToken, draftFolder, 'draft.json', JSON.stringify(params.draft.draft));
      for (const section of params.draft.sections || []) {
        await upsertDriveChildFile(
          accessToken,
          draftFolder,
          `${sanitizeSegment(section.slug)}.pen`,
          section.ciphertext,
          'text/plain'
        );
      }
    }
  });
}

/** Sealed Yjs live state (docKey envelope JSON) beside doc.json. */
export function writeLiveSnapshotFile(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
  sealedJson: string;
}): Promise<void> {
  return runSerial(docQueueKey(params.pnFolderId, params.docId), async () => {
    const docFolder = await ensureDocFolder(params.accessToken, params.pnFolderId, params.docId);
    await upsertDriveChildFile(params.accessToken, docFolder, LIVE_SNAPSHOT_FILE, params.sealedJson);
  });
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
  await runSerial(libraryQueueKey(pnFolderId), async () => {
    const rows = (await readLibraryIndex(accessToken, pnFolderId)).filter(
      (row) => String(row.docId || '') !== docId
    );
    await writeLibraryIndexUnqueued(accessToken, pnFolderId, rows);
  });
  await runSerial(docQueueKey(pnFolderId, docId), async () => {
    const root = await penRootFolderId(accessToken, pnFolderId);
    if (!root) return;
    const name = docFolderName(docId);
    const folder = await findChild(accessToken, root, name, FOLDER);
    if (!folder) return;
    await deviceDriveCall('DELETE', `/api/drive/files/${encodeURIComponent(folder)}`, undefined, {
      accessToken,
    });
    forgetDriveChild(root, name);
  });
}

/** Owner My Fonts: `par-noir-pen/fonts/{fontId}/`. */
export async function ensurePenFontFolder(
  accessToken: string,
  pnFolderId: string,
  fontId: string
): Promise<string> {
  const root = await ensurePenRoot(accessToken, pnFolderId);
  const fonts = await ensureDriveChildFolder(accessToken, root, FONTS_DIR);
  return ensureDriveChildFolder(accessToken, fonts, sanitizeSegment(fontId));
}

/** `par-noir-pen/fonts/{fontId}/` when it exists; reads never create folders. */
export async function findPenFontFolder(
  accessToken: string,
  pnFolderId: string,
  fontId: string
): Promise<string | null> {
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return null;
  const fonts = await findChild(accessToken, root, FONTS_DIR, FOLDER);
  if (!fonts) return null;
  return findChild(accessToken, fonts, sanitizeSegment(fontId), FOLDER);
}

/** Doc-scoped font copy: `par-noir-pen/{docId}/fonts/{fontId}.penfont`, or null. */
export async function findDocFontFile(
  accessToken: string,
  pnFolderId: string,
  docId: string,
  fontId: string
): Promise<string | null> {
  const root = await penRootFolderId(accessToken, pnFolderId);
  if (!root) return null;
  const docFolder = await findChild(accessToken, root, docFolderName(docId), FOLDER);
  if (!docFolder) return null;
  const fonts = await findChild(accessToken, docFolder, FONTS_DIR, FOLDER);
  if (!fonts) return null;
  return findChild(accessToken, fonts, `${sanitizeSegment(fontId)}.penfont`);
}
