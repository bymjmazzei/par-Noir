/**
 * Pen → Browse "Connect to feed" deep-link.
 * Cross-origin: payload rides in the browse URL hash (sessionStorage is origin-scoped).
 */

import type { CompileToNoteResult } from '@par-noir/pen-protocol';

export const PEN_PUBLISH_HASH_PREFIX = 'pen_publish_handoff_v1:' as const;

export type PenSocialHandoffPayload = CompileToNoteResult & {
  docId?: string;
  headProof?: unknown;
};

const envBrowse =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { VITE_BROWSE_URL?: string } }).env?.VITE_BROWSE_URL
    : undefined;

export function browseOrigin(): string {
  const raw = (envBrowse && String(envBrowse).trim()) || '';
  if (raw) return raw.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return 'http://127.0.0.1:5173';
  }
  return 'https://browse.parnoir.com';
}

export function buildPenPublishHandoffHash(payload: PenSocialHandoffPayload): string {
  return `#${PEN_PUBLISH_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Open Browse on the upload/composer path with the handoff in the hash. */
export function openBrowseWithPenHandoff(payload: PenSocialHandoffPayload): void {
  const url = `${browseOrigin()}/?view=upload${buildPenPublishHandoffHash(payload)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    // Popup blocked — navigate same tab as last resort
    window.location.assign(url);
  }
}
