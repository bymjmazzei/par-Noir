/**
 * Pen → Messaging correspondence handoff (Projects letter / note).
 * Cross-origin: payload rides in the messaging URL hash.
 */

import { docToPlainText, type PenSectionContent } from '@par-noir/pen-protocol';

export const PEN_CORRESPONDENCE_HASH_PREFIX = 'pen_correspondence_handoff_v1:' as const;

export type PenCorrespondenceHandoffPayload = {
  title: string;
  body: string;
  classId?: string;
  docId?: string;
};

const envMessaging =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { VITE_MESSAGING_URL?: string } }).env
        ?.VITE_MESSAGING_URL
    : undefined;

export function messagingOrigin(): string {
  const raw = (envMessaging && String(envMessaging).trim()) || '';
  if (raw) return raw.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return 'http://127.0.0.1:5174';
  }
  return 'https://messaging.parnoir.com';
}

export function bodyFromSections(sections: PenSectionContent[]): string {
  return sections
    .map((s) => docToPlainText(s.doc))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function buildCorrespondenceHandoffHash(payload: PenCorrespondenceHandoffPayload): string {
  return `#${PEN_CORRESPONDENCE_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Open Messaging with letter/note title + plain text body in the hash. */
export function openMessagingWithCorrespondence(payload: PenCorrespondenceHandoffPayload): void {
  const url = `${messagingOrigin()}/${buildCorrespondenceHandoffHash(payload)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    window.location.assign(url);
  }
}
