/**
 * Optional Pen app → browse handoff via sessionStorage (`pen_publish_note:*`).
 * Hydrates Pen Mini pages + TextPostStyle; attaches headProof / templateId / docId on publish.
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
}

const HANDOFF_PREFIX = 'pen_publish:';
const HANDOFF_PREFIX_LEGACY = 'pen_publish_note:';

function readFirstHandoff(consume: boolean): PenPublishHandoff | null {
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
    // Prefer new prefix
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
    const parsed = JSON.parse(raw) as PenPublishHandoff;
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    // ignore corrupt / unavailable storage
  }
  return null;
}

/** Read without removing — for Pen Mini hydrate. */
export function peekPenPublishHandoff(): PenPublishHandoff | null {
  return readFirstHandoff(false);
}

/** Peek + consume the first `pen_publish_note:*` payload, if any. */
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
