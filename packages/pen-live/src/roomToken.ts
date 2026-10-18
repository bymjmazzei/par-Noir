import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { base64ToBytes } from './crypto.js';

/**
 * Relay room name. Only docKey holders can derive it, so the relay needs no
 * membership list; a new epoch (re-key) moves members to a new room.
 */
export function penLiveRoomToken(docKeyB64: string, groupId: string, keyEpoch: number): string {
  const msg = new TextEncoder().encode(`pen-live:${groupId}:${keyEpoch}`);
  return bytesToHex(hmac(sha256, base64ToBytes(docKeyB64), msg));
}
