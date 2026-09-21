/**
 * Optional Pen app → browse handoff via sessionStorage (`pen_publish_note:*`).
 * Attach headProof / templateId when publishing a Note from Pen Mini after Pen compile.
 */

export interface PenPublishHandoff {
  contentClass?: 'note';
  title?: string;
  pages?: Array<{ content: string; style?: Record<string, unknown> }>;
  templateId?: string;
  headProof?: unknown;
}

const HANDOFF_PREFIX = 'pen_publish_note:';

/** Peek + consume the first `pen_publish_note:*` payload, if any. */
export function takePenPublishHandoff(): PenPublishHandoff | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(HANDOFF_PREFIX)) continue;
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PenPublishHandoff;
      if (parsed && typeof parsed === 'object') return parsed;
      return null;
    }
  } catch {
    // ignore corrupt / unavailable storage
  }
  return null;
}
