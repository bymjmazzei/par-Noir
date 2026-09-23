/**
 * Encrypted cloud replica for Pen prefs (personal templates + category pins).
 * Key: deriveMessageKey(mlKemSecretKey, 'pen.prefs.v1') → encryptMediaBytes envelope.
 */

import {
  bytesToBase64,
  deriveMessageKey,
  decryptMediaBytes,
  encryptMediaBytes
} from '@par-noir/dm-crypto';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import {
  listPersonalTemplates,
  type PersonalTemplate
} from './penPersonalTemplates';
import { loadPinnedCategoryIds, savePinnedCategoryIds } from './penClassPrefs';

export const PEN_PREFS_FILENAME = 'par-noir-pen-prefs.enc';
export const PEN_PREFS_CONTEXT = 'pen.prefs.v1';

export interface PenPrefsBlob {
  v: 1;
  personalTemplates: PersonalTemplate[];
  pinnedCategoryIds: string[];
  updatedAt: string;
}

type PushFn = (pn: string) => void;

let pushHook: PushFn | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastMlKem: string | null = null;

function prefsKeyB64(mlKemSecretKey: string): string {
  return bytesToBase64(deriveMessageKey(mlKemSecretKey, PEN_PREFS_CONTEXT));
}

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function readLocalBlob(pn: string): PenPrefsBlob {
  return {
    v: 1,
    personalTemplates: listPersonalTemplates(pn),
    pinnedCategoryIds: loadPinnedCategoryIds(pn),
    updatedAt: new Date().toISOString()
  };
}

/** Merge cloud into local: union templates by id (newer createdAt wins), union pins. */
export function mergePrefsBlob(local: PenPrefsBlob, cloud: PenPrefsBlob): PenPrefsBlob {
  const byId = new Map<string, PersonalTemplate>();
  for (const t of local.personalTemplates) byId.set(t.id, t);
  for (const t of cloud.personalTemplates) {
    const prev = byId.get(t.id);
    if (!prev || (t.createdAt || '') > (prev.createdAt || '')) byId.set(t.id, t);
  }
  const pinned = [...new Set([...local.pinnedCategoryIds, ...cloud.pinnedCategoryIds])];
  return {
    v: 1,
    personalTemplates: [...byId.values()].sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    ),
    pinnedCategoryIds: pinned,
    updatedAt:
      (cloud.updatedAt || '') > (local.updatedAt || '')
        ? cloud.updatedAt
        : local.updatedAt || new Date().toISOString()
  };
}

function applyMergedLocally(pn: string, merged: PenPrefsBlob): void {
  const storeKey = `pen_personal_templates_v1:${pn}`;
  localStorage.setItem(storeKey, JSON.stringify(merged.personalTemplates));
  savePinnedCategoryIds(pn, merged.pinnedCategoryIds, { silent: true });
}

async function findPrefsFileId(pnIdentifier: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${PEN_PREFS_FILENAME}' and trashed=false`);
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=5`, { pnIdentifier });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    files?: Array<{ id?: string; name?: string }>;
  };
  const hit = (data.files || []).find((f) => f.id && f.name === PEN_PREFS_FILENAME);
  return hit?.id || null;
}

export async function pushPrefsCloud(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): Promise<void> {
  const blob = readLocalBlob(params.pnIdentifier);
  const keyB64 = prefsKeyB64(params.mlKemSecretKey);
  const envelope = await encryptMediaBytes(utf8Bytes(JSON.stringify(blob)), keyB64);
  const fileData = bytesToB64(utf8Bytes(envelope));
  const existingId = await findPrefsFileId(params.pnIdentifier);

  if (existingId) {
    const res = await ownerFetch(
      'PUT',
      `/api/drive/files/${encodeURIComponent(existingId)}/content`,
      {
        fileData,
        mimeType: 'application/octet-stream'
      },
      { pnIdentifier: params.pnIdentifier }
    );
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `prefs_push_failed_${res.status}`);
    }
    return;
  }

  const res = await ownerFetch(
    'POST',
    '/api/drive/files',
    {
      fileData,
      fileName: PEN_PREFS_FILENAME,
      mimeType: 'application/octet-stream',
      encrypt: false
    },
    { pnIdentifier: params.pnIdentifier }
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `prefs_create_failed_${res.status}`);
  }
}

export async function pullAndMergePrefsCloud(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): Promise<PenPrefsBlob | null> {
  const fileId = await findPrefsFileId(params.pnIdentifier);
  if (!fileId) return null;

  const res = await ownerGet(
    `/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    { pnIdentifier: params.pnIdentifier }
  );
  if (!res.ok) return null;

  const bytes = new Uint8Array(await res.arrayBuffer());
  const asText = new TextDecoder().decode(bytes);
  const keyB64 = prefsKeyB64(params.mlKemSecretKey);
  let plain: Uint8Array;
  try {
    plain = await decryptMediaBytes(asText, keyB64);
  } catch {
    // Some proxies may base64-wrap; try raw envelope from JSON text already
    plain = await decryptMediaBytes(asText.trim(), keyB64);
  }
  const cloud = JSON.parse(new TextDecoder().decode(plain)) as PenPrefsBlob;
  if (!cloud || cloud.v !== 1 || !Array.isArray(cloud.personalTemplates)) {
    throw new Error('prefs_blob_invalid');
  }
  const local = readLocalBlob(params.pnIdentifier);
  const merged = mergePrefsBlob(local, cloud);
  applyMergedLocally(params.pnIdentifier, merged);
  try {
    window.dispatchEvent(
      new CustomEvent('pen-prefs-merged', { detail: { pn: params.pnIdentifier } })
    );
  } catch {
    /* ignore */
  }
  return merged;
}

/** Bind session push hook (App calls after unlock / cloud ready). */
export function bindPrefsCloudSession(params: {
  pnIdentifier: string;
  mlKemSecretKey: string;
}): void {
  lastMlKem = params.mlKemSecretKey;
  pushHook = (pn: string) => {
    if (pn !== params.pnIdentifier || !lastMlKem) return;
    void pushPrefsCloud({ pnIdentifier: pn, mlKemSecretKey: lastMlKem }).catch(() => {
      /* offline */
    });
  };
}

export function unbindPrefsCloudSession(): void {
  pushHook = null;
  lastMlKem = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

/** Debounced push after local prefs mutation. */
export function schedulePrefsCloudPush(pn: string): void {
  if (!pushHook) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushHook?.(pn);
  }, 400);
}
