/**
 * Pen cloud docs: section bodies are AES-GCM DM envelopes under the docKey, and the
 * docKey is wrapped per member in the owner's Groups sheet. Pen and Unlock share this path.
 */

import {
  decryptMediaBytes,
  encryptMediaBytes,
  isDmEnvelope,
  isSocialEnvelope,
  openSocialEnvelope,
  unwrapChatKeyForOwner
} from '@par-noir/dm-crypto';
import type {
  PenDocManifest,
  PenDraftManifest,
  PenHistoryChain,
  PenSectionContent
} from '@par-noir/pen-protocol';
import { listDeviceGroups } from './deviceSocial.js';
import { readDocTree, type PenCloudSectionFile } from './penDriveTree.js';

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

  try {
    return JSON.parse(raw) as PenSectionContent;
  } catch {
    // Legacy wire sometimes stored base64(JSON)
    try {
      return JSON.parse(atob(raw)) as PenSectionContent;
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

export type CloudSectionPayload = PenCloudSectionFile;

export type CloudDocRaw = {
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: CloudSectionPayload[] | PenSectionContent[];
  drafts: Array<{
    draft: PenDraftManifest;
    sections: CloudSectionPayload[] | PenSectionContent[];
  }>;
};

export type DecryptedCloudDoc = {
  manifest: PenDocManifest | null;
  chain: PenHistoryChain | null;
  currentSections: PenSectionContent[];
  drafts: Array<{ draft: PenDraftManifest; sections: PenSectionContent[] }>;
};

const EMPTY_DOC = { manifest: null, chain: null, currentSections: [], drafts: [] };

/** Opaque cloud replica (ciphertexts) of one doc; empty when the doc is not on Drive. */
export async function readPenCloudDoc(params: {
  accessToken: string;
  pnFolderId: string;
  docId: string;
}): Promise<CloudDocRaw> {
  const tree = await readDocTree(params);
  if (!tree?.manifest || !tree.chain) return { ...EMPTY_DOC };
  return {
    manifest: tree.manifest as PenDocManifest,
    chain: tree.chain as PenHistoryChain,
    currentSections: tree.currentSections,
    drafts: tree.drafts as CloudDocRaw['drafts'],
  };
}

async function decryptWithAnyKey(
  payload: string,
  docKey: string | null,
  fallbackKeys: string[]
): Promise<PenSectionContent> {
  try {
    return await decryptSectionPayload(payload, docKey);
  } catch (err) {
    for (const key of fallbackKeys) {
      if (key === docKey) continue;
      try {
        return await decryptSectionPayload(payload, key);
      } catch {
        /* try the next epoch's key */
      }
    }
    throw err;
  }
}

async function decodeCloudSections(
  list: CloudSectionPayload[] | PenSectionContent[] | undefined,
  docKey: string | null,
  fallbackKeys: string[]
): Promise<PenSectionContent[]> {
  if (!list?.length) return [];
  const out: PenSectionContent[] = [];
  for (const item of list) {
    if (item && typeof item === 'object' && 'ciphertext' in item && 'slug' in item) {
      const payload = String((item as CloudSectionPayload).ciphertext || '');
      out.push(await decryptWithAnyKey(payload, docKey, fallbackKeys));
    } else if (item && typeof item === 'object' && 'slug' in item) {
      // Legacy API returned parsed JSON sections
      out.push(item as PenSectionContent);
    }
  }
  return out;
}

export async function decryptCloudDoc(params: {
  raw: CloudDocRaw;
  docKey: string | null;
  /** Keys from earlier key epochs (files written before a re-key). */
  fallbackKeys?: string[];
}): Promise<DecryptedCloudDoc> {
  const { raw, docKey, fallbackKeys = [] } = params;
  if (!raw.manifest || !raw.chain) return { ...EMPTY_DOC };
  const currentSections = await decodeCloudSections(raw.currentSections, docKey, fallbackKeys);
  const drafts: DecryptedCloudDoc['drafts'] = [];
  for (const d of raw.drafts || []) {
    drafts.push({
      draft: d.draft,
      sections: await decodeCloudSections(d.sections, docKey, fallbackKeys)
    });
  }
  return { manifest: raw.manifest, chain: raw.chain, currentSections, drafts };
}

export type OpenedDocKey = { docKey: string; liveClaimSecret: string | null; keyEpoch: number | null };

/** Open one Groups-sheet wrap: a sealed peer invite (social envelope) or the owner's ML-KEM wrap. */
export async function openWrappedDocKey(
  wrapped: string,
  mlKemSecretKey: string,
  groupId: string
): Promise<OpenedDocKey | null> {
  if (!wrapped) return null;
  try {
    const parsed = JSON.parse(wrapped) as unknown;
    if (isSocialEnvelope(parsed)) {
      const opened = await openSocialEnvelope<{
        docKey?: string;
        liveClaimSecret?: string;
        keyEpoch?: number;
      }>(parsed, mlKemSecretKey, groupId);
      return opened.docKey
        ? {
            docKey: opened.docKey,
            liveClaimSecret: opened.liveClaimSecret || null,
            keyEpoch: Number.isInteger(opened.keyEpoch) ? (opened.keyEpoch as number) : null
          }
        : null;
    }
  } catch {
    /* not a social envelope — try owner wrap */
  }
  try {
    return {
      docKey: await unwrapChatKeyForOwner(wrapped, mlKemSecretKey, groupId),
      liveClaimSecret: null,
      keyEpoch: null
    };
  } catch {
    return null;
  }
}

/**
 * Every Groups-sheet row for this doc group the member can open, newest first.
 * A re-key appends rows, so the first entry carries the current docKey.
 */
export async function openDocKeysFromGroups(params: {
  accessToken: string;
  groupsSheetId: string;
  groupId: string;
  mlKemSecretKey: string;
}): Promise<OpenedDocKey[]> {
  const rows = (await listDeviceGroups(params.accessToken, params.groupsSheetId))
    .filter((g) => g.groupId === params.groupId)
    .reverse();
  const out: OpenedDocKey[] = [];
  for (const row of rows) {
    const opened = await openWrappedDocKey(row.wrappedChatKey || '', params.mlKemSecretKey, params.groupId);
    if (opened && !out.some((o) => o.docKey === opened.docKey)) out.push(opened);
  }
  return out;
}
