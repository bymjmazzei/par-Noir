/**
 * Pen section/media crypto — AES-GCM via docKey (same envelope as group DMs).
 */

import {
  encryptMediaBytes,
  decryptMediaBytes,
  isDmEnvelope,
  generateChatKey
} from '@par-noir/dm-crypto';
import type { PenSectionContent } from '@par-noir/pen-protocol';

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

function utf8Bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function utf8String(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Encrypt section JSON → DM envelope string (file body / wire payload). */
export async function encryptSectionJson(
  section: PenSectionContent,
  docKeyB64: string
): Promise<string> {
  return encryptMediaBytes(utf8Bytes(JSON.stringify(section)), docKeyB64);
}

/**
 * Decrypt a .pen payload. Legacy plaintext JSON (pre-encryption) is accepted
 * and returned as-is so the next save re-encrypts.
 */
export async function decryptSectionPayload(
  payload: string,
  docKeyB64: string | null
): Promise<PenSectionContent> {
  const raw = String(payload || '').trim();
  if (!raw) throw new Error('empty_section_payload');

  if (isDmEnvelope(raw)) {
    if (!docKeyB64) throw new Error('doc_key_required');
    const bytes = await decryptMediaBytes(raw, docKeyB64);
    return JSON.parse(utf8String(bytes)) as PenSectionContent;
  }

  // Legacy: file was UTF-8 JSON (possibly from base64-decoded wire).
  try {
    return JSON.parse(raw) as PenSectionContent;
  } catch {
    // Legacy wire sometimes stored base64(JSON)
    try {
      const decoded = atob(raw);
      return JSON.parse(decoded) as PenSectionContent;
    } catch {
      throw new Error('section_decrypt_failed');
    }
  }
}

/** Map sections → envelope strings keyed by slug (opaque SoT bodies). */
export async function sectionsToEncryptedMap(
  sections: PenSectionContent[],
  docKeyB64: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of sections) {
    out[s.slug] = await encryptSectionJson(s, docKeyB64);
  }
  return out;
}

/** Transport: envelope utf8 as base64 for apply-inbound sectionCiphertextsB64. */
export function envelopeToWireB64(envelope: string): string {
  const bytes = utf8Bytes(envelope);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function wireB64ToEnvelope(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return utf8String(bytes);
}

export async function sectionsToWireCipherMap(
  sections: PenSectionContent[],
  docKeyB64: string
): Promise<Record<string, string>> {
  const enc = await sectionsToEncryptedMap(sections, docKeyB64);
  const out: Record<string, string> = {};
  for (const [slug, envelope] of Object.entries(enc)) {
    out[slug] = envelopeToWireB64(envelope);
  }
  return out;
}
