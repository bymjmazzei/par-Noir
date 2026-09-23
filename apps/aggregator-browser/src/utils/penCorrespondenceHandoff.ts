/**
 * Pen → Messaging correspondence handoff (letter/note deep-link).
 */

export const PEN_CORRESPONDENCE_HASH_PREFIX = 'pen_correspondence_handoff_v1:' as const;

export interface PenCorrespondenceHandoff {
  title?: string;
  body?: string;
  classId?: string;
  docId?: string;
}

function parsePayload(raw: string): PenCorrespondenceHandoff | null {
  try {
    const parsed = JSON.parse(raw) as PenCorrespondenceHandoff;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

/** Read (and optionally clear) correspondence handoff from the URL hash. */
export function takeCorrespondenceHandoff(consume = true): PenCorrespondenceHandoff | null {
  try {
    if (typeof window === 'undefined') return null;
    const rawHash = window.location.hash || '';
    const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
    if (!hash.startsWith(PEN_CORRESPONDENCE_HASH_PREFIX)) return null;
    const encoded = hash.slice(PEN_CORRESPONDENCE_HASH_PREFIX.length);
    const parsed = parsePayload(decodeURIComponent(encoded));
    if (parsed) {
      try {
        sessionStorage.setItem(
          'pen_correspondence_draft',
          JSON.stringify({
            title: parsed.title || '',
            body: parsed.body || '',
            at: Date.now()
          })
        );
      } catch {
        /* ignore */
      }
    }
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

export function peekCorrespondenceHandoff(): PenCorrespondenceHandoff | null {
  return takeCorrespondenceHandoff(false);
}

/** Consume a stashed correspondence draft for the message composer. */
export function takeCorrespondenceDraftBody(): string | null {
  try {
    const raw = sessionStorage.getItem('pen_correspondence_draft');
    if (!raw) return null;
    sessionStorage.removeItem('pen_correspondence_draft');
    const parsed = JSON.parse(raw) as { title?: string; body?: string };
    const parts = [parsed.title, parsed.body].filter(Boolean);
    return parts.length ? parts.join('\n\n') : null;
  } catch {
    return null;
  }
}
