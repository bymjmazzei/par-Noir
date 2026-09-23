/**
 * Owner My Fonts for Pen Mini (browse) — same localStorage key as Pen app.
 * Upload uses ownerApiFetch + pen.fonts.v1 encryption.
 */

import {
  bytesToBase64,
  deriveMessageKey,
  encryptMediaBytes
} from '@par-noir/dm-crypto';
import {
  type PenFontIndexEntry,
  personalFontsStorageKey,
  sanitizeSegment
} from '@par-noir/pen-protocol';
import { ownerFetch, ownerGet } from './ownerApiFetch';
import { getDmIdentity } from './dmIdentitySession';

export const PEN_FONTS_CONTEXT = 'pen.fonts.v1';
export const PEN_FONTS_INDEX_NAME = 'fonts.index.json';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

export function savePersonalFonts(pnIdentifier: string, entries: PenFontIndexEntry[]): void {
  localStorage.setItem(personalFontsStorageKey(pnIdentifier), JSON.stringify(entries));
  try {
    window.dispatchEvent(
      new CustomEvent('pen-fonts-changed', { detail: { pn: pnIdentifier } })
    );
  } catch {
    /* ignore */
  }
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

  const prev = listPersonalFonts(params.pnIdentifier);
  const byId = new Map(prev.map((e) => [e.fontId, e]));
  byId.set(entry.fontId, entry);
  const next = [...byId.values()].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  savePersonalFonts(params.pnIdentifier, next);

  await writeOpaqueFile({
    pnIdentifier: params.pnIdentifier,
    parentId: penRootId,
    fileName: PEN_FONTS_INDEX_NAME,
    bytes: utf8Bytes(JSON.stringify(next)),
    mimeType: 'application/json'
  });

  const face = new FontFace(family, plain.buffer as ArrayBuffer);
  await face.load();
  document.fonts.add(face);

  return entry;
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

export function tryGetMlKemSecretKey(): string | null {
  try {
    return getDmIdentity().mlKemSecretKey || null;
  } catch {
    return null;
  }
}
