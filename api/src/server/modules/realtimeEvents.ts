/**
 * Real-time event payloads.
 * Opaque ciphertext (same class as mailbox jobs) is allowed for online delivery speed.
 * Never plaintext message bodies, passcode, or pn name.
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
  | { type: 'data_point_request'; requestId: string };

export function pnRoomId(pnIdentifier: string): string {
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return `pn:${normalized}`;
}

type RealtimeEmitter = (pnIdentifier: string, event: string, payload: Record<string, unknown>) => void;

let realtimeEmitter: RealtimeEmitter | null = null;

export function registerRealtimeEmitter(fn: RealtimeEmitter): void {
  realtimeEmitter = fn;
}

export function emitNewNotification(pnIdentifier: string, notificationType: string): void {
  realtimeEmitter?.(pnIdentifier, 'new_notification', { notificationType });
}
