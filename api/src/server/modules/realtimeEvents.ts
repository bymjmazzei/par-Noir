/**
 * Real-time event payloads.
 * Opaque ciphertext (same class as mailbox jobs) is allowed for online delivery speed.
 * Never plaintext message bodies, Key 1, or Key 2.
 */

export type RealtimeEvent =
  | {
      type: 'new_message';
      threadId?: string;
      groupId?: string;
      messageId: string;
      /** Opaque E2E ciphertext — same bytes as mailbox message_append when present. */
      encryptedContent?: string;
      cryptoVersion?: number;
      connectionId?: string;
      timestamp?: string;
      channelClientId?: string;
      throughway?: boolean;
      /** Group sealed envelope (opaque); peer opens with ML-KEM. */
      envelope?: { kemCiphertext: string; ciphertext: string };
      envelopeContext?: string;
    }
  | { type: 'new_notification'; notificationType: string }
  | { type: 'data_point_request'; requestId: string }
  | { type: 'session_locked'; reason: string };

export function pnRoomId(pnIdentifier: string): string {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return `pn:${normalized}`;
}

/** Every first-party app socket for one pN in one browser. */
export function browserRoomId(pnIdentifier: string, browserId: string): string {
  return `${pnRoomId(pnIdentifier)}:bid:${browserId}`;
}

type RealtimeEmitter = (pnIdentifier: string, event: string, payload: Record<string, unknown>) => void;
type RoomEmitter = (room: string, event: string, payload: Record<string, unknown>) => void;

let realtimeEmitter: RealtimeEmitter | null = null;
let roomEmitter: RoomEmitter | null = null;

export function registerRealtimeEmitter(fn: RealtimeEmitter): void {
  realtimeEmitter = fn;
}

export function registerRoomEmitter(fn: RoomEmitter): void {
  roomEmitter = fn;
}

export function emitNewNotification(pnIdentifier: string, notificationType: string): void {
  realtimeEmitter?.(pnIdentifier, 'new_notification', { notificationType });
}

export function emitSessionLocked(pnIdentifier: string, browserId: string, reason: string): void {
  roomEmitter?.(browserRoomId(pnIdentifier, browserId), 'session_locked', { reason });
}
