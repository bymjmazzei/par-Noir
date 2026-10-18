/**
 * Pen → Messaging correspondence handoff. Cross-origin: payload rides in the messaging URL hash.
 */

export const PEN_CORRESPONDENCE_HASH_PREFIX = 'pen_correspondence_handoff_v1:' as const;

export type PenCorrespondenceHandoffPayload = {
  title: string;
  body: string;
  classId?: string;
  docId?: string;
};

export function buildCorrespondenceHandoffHash(payload: PenCorrespondenceHandoffPayload): string {
  return `#${PEN_CORRESPONDENCE_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}
