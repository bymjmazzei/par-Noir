/**
 * Owner My Fonts library — personal cloud under par-noir-pen/fonts/.
 * Key: deriveMessageKey(mlKem, 'pen.fonts.v1') → encryptMediaBytes envelope.
 * Never used for collab peer replicas (those use docKey .penfont under {docId}/fonts/).
 */

import {
  bytesToBase64,
  deriveMessageKey,
  decryptMediaBytes,
  encryptMediaBytes
} from '@par-noir/dm-crypto';
import {
  type PenFontIndexEntry,
  personalFontsStorageKey,
  sanitizeSegment
} from '@par-noir/pen-protocol';
import { ownerFetch, ownerGet } from './penOwnerFetch';

export const PEN_FONTS_CONTEXT = 'pen.fonts.v1';
export const PEN_FONTS_INDEX_NAME = 'fonts.index.json';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

type PushFn = (pn: string) => void;

let pushHook: PushFn | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastMlKem: string | null = null;
let lastPn: string | null = null;

function fontsKeyB64(mlKemSecretKey: string): string {
  return bytesToBase64(deriveMessageKey(mlKemSecretKey, PEN_FONTS_CONTEXT));
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function newFontId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `font-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  return `font-${Date.now().toString(36)}`;
}

function familyFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ') || 'Custom Font';
}

export function listPersonalFonts(pnIdentifier: string): PenFontIndexEntry[] {
  try {
    const raw = localStorage.getItem(personalFontsStorageKey(pnIdentifier));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PenFontIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePersonalFonts(
  pnIdentifier: string,
  entries: PenFontIndexEntry[],
  opts?: { silent?: boolean }
): void {
  localStorage.setItem(personalFontsStorageKey(pnIdentifier), JSON.stringify(entries));
  if (!opts?.silent) {
    try {
      window.dispatchEvent(
        new CustomEvent('pen-fonts-changed', { detail: { pn: pnIdentifier } })
      );
    } catch {
      /* ignore */
    }
    scheduleFontsCloudPush(pnIdentifier);
  }
}

function mergeFontIndexes(
  local: PenFontIndexEntry[],
  cloud: PenFontIndexEntry[]
): PenFontIndexEntry[] {
  const byId = new Map<string, PenFontIndexEntry>();
  for (const e of local) byId.set(e.fontId, e);
  for (const e of cloud) {
    const prev = byId.get(e.fontId);
    if (!prev || (e.createdAt || '') > (prev.createdAt || '')) byId.set(e.fontId, e);
  }
  return [...byId.values()].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
}

async function findChildFolderId(
  pnIdentifier: string,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=5`, { pnIdentifier });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id || null;
}

async function findChildFileId(
  pnIdentifier: string,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
  );
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=5`, { pnIdentifier });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id || null;
}

async function ensureChildFolder(
  pnIdentifier: string,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await findChildFolderId(pnIdentifier, parentId, name);
  if (existing) return existing;
  const res = await ownerFetch(
    'POST',
    '/api/drive/folders',
    { folderName: name, parentFolderId: parentId },
    { pnIdentifier }
  );
  if (!res.ok) throw new Error(`fonts_folder_create_failed_${res.status}`);
  const data = (await res.json()) as { folder?: { id?: string }; id?: string };
  const id = data.folder?.id || data.id;
  if (!id) throw new Error('fonts_folder_create_no_id');
  return id;
}

/** Resolve par-noir-pen folder id under the owner's pn folder (query by name). */
async function ensurePenRootFolderId(pnIdentifier: string): Promise<string> {
  const q = encodeURIComponent(
    `name='par-noir-pen' and mimeType='${FOLDER_MIME}' and trashed=false`
  );
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=10`, { pnIdentifier });
  if (res.ok) {
    const data = (await res.json()) as { files?: Array<{ id?: string; name?: string }> };
    const hit = (data.files || []).find((f) => f.id && f.name === 'par-noir-pen');
    if (hit?.id) return hit.id;
  }
  const create = await ownerFetch(
    'POST',
    '/api/drive/folders',
    { folderName: 'par-noir-pen' },
    { pnIdentifier }
  );
  if (!create.ok) throw new Error(`pen_root_create_failed_${create.status}`);
  const data = (await create.json()) as { folder?: { id?: string }; id?: string };
  const id = data.folder?.id || data.id;
  if (!id) throw new Error('pen_root_create_no_id');
  return id;
}

async function writeOpaqueFile(params: {
  pnIdentifier: string;
  parentId: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string;
}): Promise<string> {
  const fileData = bytesToB64(params.bytes);
  const existingId = await findChildFileId(
    params.pnIdentifier,
    params.parentId,
    params.fileName
  );
  if (existingId) {
    const res = await ownerFetch(
      'PUT',
      `/api/drive/files/${encodeURIComponent(existingId)}/content`,
      {
        fileData,
        mimeType: params.mimeType || 'application/octet-stream'
      },
      { pnIdentifier: params.pnIdentifier }
    );
    if (!res.ok) throw new Error(`fonts_put_failed_${res.status}`);
    return existingId;
  }
  const res = await ownerFetch(
    'POST',
    '/api/drive/files',
    {
      fileData,
      fileName: params.fileName,
      mimeType: params.mimeType || 'application/octet-stream',
      encrypt: false,
      parents: [params.parentId]
    },
    { pnIdentifier: params.pnIdentifier }
  );
  if (!res.ok) throw new Error(`fonts_upload_failed_${res.status}`);
  const data = (await res.json()) as { id?: string; file?: { id?: string } };
  const id = data.id || data.file?.id;
  if (!id) throw new Error('fonts_upload_no_id');
  return id;
}

async function downloadFileBytes(
  pnIdentifier: string,
  fileId: string
): Promise<Uint8Array> {
  const res = await ownerGet(
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    { pnIdentifier }
  );
  if (!res.ok) throw new Error('fonts_download_failed');
  return new Uint8Array(await res.arrayBuffer());
}

export async function pushFontsIndexCloud(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): Promise<void> {
  const entries = listPersonalFonts(params.pnIdentifier);
  const penRootId = await ensurePenRootFolderId(params.pnIdentifier);
  await writeOpaqueFile({
    pnIdentifier: params.pnIdentifier,
    parentId: penRootId,
    fileName: PEN_FONTS_INDEX_NAME,
    bytes: utf8Bytes(JSON.stringify(entries)),
    mimeType: 'application/json'
  });
}

export async function pullAndMergeFontsCloud(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): Promise<PenFontIndexEntry[] | null> {
  const penRootId = await ensurePenRootFolderId(params.pnIdentifier).catch(() => null);
  if (!penRootId) return null;
  const indexId = await findChildFileId(
    params.pnIdentifier,
    penRootId,
    PEN_FONTS_INDEX_NAME
  );
  if (!indexId) return null;
  const bytes = await downloadFileBytes(params.pnIdentifier, indexId);
  let cloud: PenFontIndexEntry[];
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as PenFontIndexEntry[];
    cloud = Array.isArray(parsed) ? parsed : [];
  } catch {
    return null;
  }
  const local = listPersonalFonts(params.pnIdentifier);
  const merged = mergeFontIndexes(local, cloud);
  savePersonalFonts(params.pnIdentifier, merged, { silent: true });
  try {
    window.dispatchEvent(
      new CustomEvent('pen-fonts-merged', { detail: { pn: params.pnIdentifier } })
    );
  } catch {
    /* ignore */
  }
  return merged;
}

/**
 * Upload a font file into owner My Fonts (encrypted under pen.fonts.v1).
 * Returns the new index entry.
 */
export async function uploadPersonalFont(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
  file: File;
  family?: string;
}): Promise<PenFontIndexEntry> {
  const fontId = newFontId();
  const family =
    String(params.family || '').trim() || familyFromFileName(params.file.name || 'Custom Font');
  const mime = params.file.type || 'application/octet-stream';
  const plain = new Uint8Array(await params.file.arrayBuffer());
  const keyB64 = fontsKeyB64(params.mlKemSecretKey);
  const envelope = await encryptMediaBytes(plain, keyB64);
  const envelopeBytes = utf8Bytes(envelope);

  const penRootId = await ensurePenRootFolderId(params.pnIdentifier);
  const fontsRootId = await ensureChildFolder(params.pnIdentifier, penRootId, 'fonts');
  const fontFolderId = await ensureChildFolder(
    params.pnIdentifier,
    fontsRootId,
    sanitizeSegment(fontId)
  );

  const binaryName = `${sanitizeSegment(fontId)}.penfont`;
  await writeOpaqueFile({
    pnIdentifier: params.pnIdentifier,
    parentId: fontFolderId,
    fileName: binaryName,
    bytes: envelopeBytes,
    mimeType: 'application/octet-stream'
  });

  const entry: PenFontIndexEntry = {
    fontId,
    family,
    fileName: binaryName,
    mime,
    createdAt: new Date().toISOString()
  };
  await writeOpaqueFile({
    pnIdentifier: params.pnIdentifier,
    parentId: fontFolderId,
    fileName: 'font.json',
    bytes: utf8Bytes(JSON.stringify(entry)),
    mimeType: 'application/json'
  });

  const next = mergeFontIndexes(listPersonalFonts(params.pnIdentifier), [entry]);
  savePersonalFonts(params.pnIdentifier, next, { silent: true });
  await pushFontsIndexCloud(params);
  try {
    window.dispatchEvent(
      new CustomEvent('pen-fonts-changed', { detail: { pn: params.pnIdentifier } })
    );
  } catch {
    /* ignore */
  }
  return entry;
}

/** Download + decrypt owner library font bytes (for FontFace / doc-scoped copy). */
export async function loadPersonalFontBytes(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
  entry: PenFontIndexEntry;
}): Promise<Uint8Array> {
  const penRootId = await ensurePenRootFolderId(params.pnIdentifier);
  const fontsRootId = await ensureChildFolder(params.pnIdentifier, penRootId, 'fonts');
  const fontFolderId = await ensureChildFolder(
    params.pnIdentifier,
    fontsRootId,
    sanitizeSegment(params.entry.fontId)
  );
  const fileId = await findChildFileId(
    params.pnIdentifier,
    fontFolderId,
    params.entry.fileName || `${sanitizeSegment(params.entry.fontId)}.penfont`
  );
  if (!fileId) throw new Error('font_file_missing');
  const raw = await downloadFileBytes(params.pnIdentifier, fileId);
  const asText = new TextDecoder().decode(raw);
  const keyB64 = fontsKeyB64(params.mlKemSecretKey);
  try {
    return await decryptMediaBytes(asText, keyB64);
  } catch {
    return await decryptMediaBytes(asText.trim(), keyB64);
  }
}

const loadedOwnerFaces = new Set<string>();

export async function ensureOwnerFontFace(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
  entry: PenFontIndexEntry;
}): Promise<void> {
  const key = `${params.pnIdentifier}:${params.entry.fontId}`;
  if (loadedOwnerFaces.has(key)) return;
  const bytes = await loadPersonalFontBytes(params);
  const face = new FontFace(params.entry.family, bytes.buffer as ArrayBuffer);
  await face.load();
  document.fonts.add(face);
  loadedOwnerFaces.add(key);
}

export function pickFontFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.woff2,.woff,.ttf,.otf,font/ttf,font/otf,font/woff,font/woff2';
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function bindFontsCloudSession(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): void {
  lastMlKem = params.mlKemSecretKey;
  lastPn = params.pnIdentifier;
  pushHook = (pn: string) => {
    if (pn !== params.pnIdentifier || !lastMlKem) return;
    void pushFontsIndexCloud({
      pnIdentifier: pn,
      mlKemSecretKey: lastMlKem
    }).catch(() => {
      /* offline */
    });
  };
}

export function unbindFontsCloudSession(): void {
  pushHook = null;
  lastMlKem = null;
  lastPn = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

export function scheduleFontsCloudPush(pn: string): void {
  if (!pushHook) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushHook?.(pn);
  }, 800);
}

export function getBoundFontsSession(): {
  pnIdentifier: string;
  mlKemSecretKey: string;
} | null {
  if (!lastPn || !lastMlKem) return null;
  return { pnIdentifier: lastPn, mlKemSecretKey: lastMlKem };
}

export { b64ToBytes, bytesToB64 };
