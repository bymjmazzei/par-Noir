/**
 * Doc-scoped custom fonts — AES-GCM under docKey into
 * par-noir-pen/{docId}/fonts/{fontId}.penfont, fanned out via pen.font_upsert.
 * Peers decrypt only for that doc; never install into My Fonts.
 */

import { encryptMediaBytes, decryptMediaBytes, isDmEnvelope } from '@par-noir/dm-crypto';
import {
  PEN_FONT_UPSERT_KIND,
  collectUsedCustomFonts,
  type PenDocManifest,
  type PenFontIndexEntry,
  type PenSectionContent,
  type PenUsedCustomFont
} from '@par-noir/pen-protocol';
import { loadDocKey, mintDocKey } from './penDocCrypto';
import { ownerFetch, ownerGet } from './penOwnerFetch';
import { queuePenOutbox } from './penCollab';
import type { PenSession } from './penSession';
import {
  loadPersonalFontBytes,
  listPersonalFonts,
  bytesToB64,
  b64ToBytes
} from './penFontsCloud';

const loadedDocFaces = new Map<string, Set<string>>();

/** Update manifest.usedCustomFonts from current sections + owner index. */
export function syncUsedCustomFontsOnManifest(params: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  pnIdentifier?: string | null;
}): PenUsedCustomFont[] {
  const customIndex: PenFontIndexEntry[] = params.pnIdentifier
    ? listPersonalFonts(params.pnIdentifier)
    : [];
  const used = collectUsedCustomFonts({
    sections: params.sections,
    manifest: params.manifest,
    customIndex
  });
  params.manifest.usedCustomFonts = used;
  return used;
}

/**
 * Ensure each used custom font has a docKey-encrypted sidecar and fanout job.
 * Owner must hold mlKem to read personal library bytes for first copy.
 */
export async function ensureDocScopedFonts(params: {
  session: PenSession;
  docId: string;
  groupId?: string | null;
  used: PenUsedCustomFont[];
  peerRouteKeys?: string[];
}): Promise<void> {
  const docKey = mintDocKey(params.docId);
  const mlKem = params.session.mlKemSecretKey;
  if (!mlKem) throw new Error('ml_kem_required');

  for (const u of params.used) {
    const entry = listPersonalFonts(params.session.pnIdentifier).find(
      (e) => e.fontId === u.fontId
    );
    let plain: Uint8Array | null = null;
    if (entry) {
      try {
        plain = await loadPersonalFontBytes({
          pnIdentifier: params.session.pnIdentifier,
          mlKemSecretKey: mlKem,
          entry
        });
      } catch {
        plain = null;
      }
    }
    // Peer / already-copied: skip re-upload from My Fonts; fanout may still re-push existing cipher.
    if (!plain) continue;

    const envelope = await encryptMediaBytes(plain, docKey);
    const fontCiphertextB64 = bytesToB64(new TextEncoder().encode(envelope));

    await ownerFetch(
      'POST',
      '/api/pen/apply-inbound',
      {
        jobType: PEN_FONT_UPSERT_KIND,
        userPnIdentifier: params.session.pnIdentifier,
        docId: params.docId,
        groupId: params.groupId || undefined,
        fontId: u.fontId,
        family: u.family,
        fontCiphertextB64
      },
      { pnIdentifier: params.session.pnIdentifier }
    );

    if (params.peerRouteKeys?.length) {
      void queuePenOutbox({
        session: params.session,
        kind: PEN_FONT_UPSERT_KIND,
        outboxId: `pen-font-${params.docId}-${u.fontId}-${Date.now()}`,
        payload: {
          docId: params.docId,
          groupId: params.groupId || undefined,
          fontId: u.fontId,
          family: u.family,
          fontCiphertextB64,
          userPnIdentifier: params.session.pnIdentifier,
          jobType: PEN_FONT_UPSERT_KIND
        },
        peerRouteKeys: params.peerRouteKeys
      });
    }

    // Register FontFace for this session
    await registerDocFontFace(params.docId, u.fontId, u.family, plain);
  }
}

async function registerDocFontFace(
  docId: string,
  fontId: string,
  family: string,
  plain: Uint8Array
): Promise<void> {
  const set = loadedDocFaces.get(docId) || new Set<string>();
  if (set.has(fontId)) return;
  const ab = plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength);
  const face = new FontFace(family, ab as ArrayBuffer);
  await face.load();
  document.fonts.add(face);
  set.add(fontId);
  loadedDocFaces.set(docId, set);
}

/** Load doc-scoped .penfont from Drive (caller's replica) and register FontFace. */
export async function loadDocScopedFontsForEditor(params: {
  pnIdentifier: string;
  docId: string;
  used: PenUsedCustomFont[];
}): Promise<void> {
  const docKey = loadDocKey(params.docId);
  if (!docKey) return;

  for (const u of params.used) {
    const set = loadedDocFaces.get(params.docId);
    if (set?.has(u.fontId)) continue;

    try {
      const q = encodeURIComponent(
        `name='${u.fontId.replace(/'/g, "\\'")}.penfont' and trashed=false`
      );
      const listRes = await ownerGet(`/api/drive/files?q=${q}&pageSize=5`, {
        pnIdentifier: params.pnIdentifier
      });
      if (!listRes.ok) continue;
      const listData = (await listRes.json()) as {
        files?: Array<{ id?: string; name?: string }>;
      };
      const hit = (listData.files || []).find(
        (f) => f.id && f.name === `${u.fontId}.penfont`
      );
      if (!hit?.id) continue;

      const dl = await ownerGet(
        `/api/drive/files/${encodeURIComponent(hit.id)}?download=true`,
        { pnIdentifier: params.pnIdentifier }
      );
      if (!dl.ok) continue;
      const raw = new Uint8Array(await dl.arrayBuffer());
      const asText = new TextDecoder().decode(raw);
      let plain: Uint8Array;
      if (isDmEnvelope(asText)) {
        plain = await decryptMediaBytes(asText, docKey);
      } else {
        // apply-inbound writes base64-decoded envelope utf8 bytes
        const maybe = new TextDecoder().decode(raw);
        if (isDmEnvelope(maybe)) {
          plain = await decryptMediaBytes(maybe, docKey);
        } else {
          // Stored as raw envelope string bytes
          plain = await decryptMediaBytes(asText.trim(), docKey);
        }
      }
      await registerDocFontFace(params.docId, u.fontId, u.family, plain);
    } catch {
      /* missing font on this replica — skip */
    }
  }
}

export function clearDocFontFaces(docId?: string): void {
  if (docId) loadedDocFaces.delete(docId);
  else loadedDocFaces.clear();
}

export { b64ToBytes };
