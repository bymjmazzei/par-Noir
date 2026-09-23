/**
 * Pen → Browse handoff via URL hash (cross-origin) or sessionStorage (same-origin).
 */

import type { PenPagePresentation, PenTipTapNode } from '@par-noir/pen-protocol';

export interface PenPublishHandoffPage {
  content: string;
  style: PenPagePresentation;
  doc?: PenTipTapNode;
}

export interface PenPublishHandoff {
  contentClass?: 'note';
  title?: string;
  pages?: PenPublishHandoffPage[];
  templateId?: string;
  docId?: string;
  headProof?: unknown;
  aggregatorTargets?: string[];
  penClassId?: string;
  penCategoryId?: string;
  penTemplateKind?: 'template' | 'remix';
  basedOnTemplateId?: string;
  penIrRef?: { backend?: string; objectId?: string; publicUrl?: string };
  /** Snapshot of Pen manifest.licensing at publish. */
  licensing?: import('@par-noir/pen-protocol').PenLicensingRoot;
  /** Attached Pen music doc id when post uses library.music. */
  musicPenDocId?: string;
  musicLicensing?: import('@par-noir/pen-protocol').PenLicensingRoot;
}

const HANDOFF_PREFIX = 'pen_publish:';
const HANDOFF_PREFIX_LEGACY = 'pen_publish_note:';
export const PEN_PUBLISH_HASH_PREFIX = 'pen_publish_handoff_v1:' as const;

function parsePayload(raw: string): PenPublishHandoff | null {
  try {
    const parsed = JSON.parse(raw) as PenPublishHandoff;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function takeFromHash(consume: boolean): PenPublishHandoff | null {
  try {
    if (typeof window === 'undefined') return null;
    const rawHash = window.location.hash || '';
    const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    if (!hash.startsWith(PEN_PUBLISH_HASH_PREFIX)) return null;
    const encoded = hash.slice(PEN_PUBLISH_HASH_PREFIX.length);
    const parsed = parsePayload(decodeURIComponent(encoded));
    if (consume && parsed) {
      const url = new URL(window.location.href);
      url.hash = '';
      window.history.replaceState(null, '', url.toString());
    }
    return parsed;
  } catch {
    return null;
  }
}

function readFirstHandoff(consume: boolean): PenPublishHandoff | null {
  const fromHash = takeFromHash(consume);
  if (fromHash) return fromHash;

  try {
    if (typeof sessionStorage === 'undefined') return null;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (key.startsWith(HANDOFF_PREFIX) || key.startsWith(HANDOFF_PREFIX_LEGACY)) {
        keys.push(key);
      }
    }
    keys.sort((a, b) => {
      const aNew = a.startsWith(HANDOFF_PREFIX) ? 0 : 1;
      const bNew = b.startsWith(HANDOFF_PREFIX) ? 0 : 1;
      return aNew - bNew;
    });
    const key = keys[0];
    if (!key) return null;
    const raw = sessionStorage.getItem(key);
    if (consume) {
      for (const k of keys) sessionStorage.removeItem(k);
    }
    if (!raw) return null;
    return parsePayload(raw);
  } catch {
    // ignore corrupt / unavailable storage
  }
  return null;
}

/** Read without removing — for Pen Mini hydrate. */
export function peekPenPublishHandoff(): PenPublishHandoff | null {
  return readFirstHandoff(false);
}

/** Peek + consume the first Pen publish handoff, if any. */
export function takePenPublishHandoff(): PenPublishHandoff | null {
  return readFirstHandoff(true);
}

export function rememberPublishedFileId(docId: string, fileId: string): void {
  try {
    if (!docId || !fileId) return;
    localStorage.setItem(`pen_published_file_id:${docId}`, fileId);
  } catch {
    /* ignore */
  }
}

export function readPublishedFileId(docId: string): string | null {
  try {
    return localStorage.getItem(`pen_published_file_id:${docId}`);
  } catch {
    return null;
  }
}
