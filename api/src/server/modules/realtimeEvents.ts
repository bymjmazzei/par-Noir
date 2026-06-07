/**
 * Real-time event payloads (metadata only — no message bodies).
 */

export type RealtimeEvent =
  | { type: 'new_message'; threadId: string; messageId: string; fromPnIdentifier: string }
  | { type: 'new_notification'; notificationType: string }
  | { type: 'data_point_request'; requestId: string };

export function pnRoomId(pnIdentifier: string): string {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return `pn:${normalized}`;
}
