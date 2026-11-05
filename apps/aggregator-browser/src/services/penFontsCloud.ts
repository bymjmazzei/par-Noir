/**
 * Owner My Fonts for Pen Mini (browse) — same localStorage key as Pen app.
 * Upload writes under par-noir-pen/fonts/ in the pN root with pen.fonts.v1 encryption.
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
import {
  ensurePenFontFolder,
  ensurePenRoot,
  upsertDriveChildFileB64
} from '@par-noir/device-cloud-credentials';
import { getDmIdentity } from './dmIdentitySession';
import { sessionDriveFor } from './sessionDrive';

export const PEN_FONTS_CONTEXT = 'pen.fonts.v1';
export const PEN_FONTS_INDEX_NAME = 'fonts.index.json';

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

async function writeOpaqueFile(params: {
  accessToken: string;
  parentId: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType?: string;
}): Promise<string> {
  return upsertDriveChildFileB64(
    params.accessToken,
    params.parentId,
    params.fileName,
    bytesToB64(params.bytes),
    params.mimeType || 'application/octet-stream'
  );
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

  const drive = await sessionDriveFor(params.pnIdentifier);
  const penRootId = await ensurePenRoot(drive.accessToken, drive.index.pnFolderId);
  const fontFolderId = await ensurePenFontFolder(drive.accessToken, drive.index.pnFolderId, fontId);

  const binaryName = `${sanitizeSegment(fontId)}.penfont`;
  await writeOpaqueFile({
    accessToken: drive.accessToken,
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
    accessToken: drive.accessToken,
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
    accessToken: drive.accessToken,
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
