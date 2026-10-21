/**
 * Per-tab docKey cache (sessionStorage). Section crypto lives in @par-noir/device-cloud-credentials.
 */

import { generateChatKey } from '@par-noir/dm-crypto';

const DOC_KEY_PREFIX = 'pen_doc_key:';

export function docKeyStorageKey(docId: string): string {
  return `${DOC_KEY_PREFIX}${docId}`;
}

export function loadDocKey(docId: string): string | null {
  try {
    const k = sessionStorage.getItem(docKeyStorageKey(docId));
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

export function saveDocKey(docId: string, docKeyB64: string): void {
  sessionStorage.setItem(docKeyStorageKey(docId), docKeyB64);
}

export function mintDocKey(docId: string): string {
  const existing = loadDocKey(docId);
  if (existing) return existing;
  const key = generateChatKey();
  saveDocKey(docId, key);
  return key;
}

export function clearDocKeysForSession(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(DOC_KEY_PREFIX) || k?.startsWith('pen_peer_kem:') || k?.startsWith('pen_group_id:')) {
        keys.push(k);
      }
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* non-browser */
  }
}
