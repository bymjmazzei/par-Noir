/**
 * Pen live co-editing relay.
 *
 * Forwards docKey-encrypted, member-signed Yjs batches and encrypted presence
 * between sockets in a room. Rooms are named by an HMAC token only docKey
 * holders can derive; the server holds no membership list, never opens
 * payloads, and stores and logs nothing. Durable state stays on the outbox.
 */

import type { Socket } from 'socket.io';

export const PEN_LIVE_MAX_PAYLOAD_CHARS = 64 * 1024;
export const PEN_LIVE_MAX_ROOMS_PER_SOCKET = 16;
const RATE_CAPACITY = 80;
const RATE_REFILL_PER_SEC = 40;
const ROOM_TOKEN_RE = /^[a-f0-9]{64}$/;

const RELAY_EVENTS = ['pen:batch', 'pen:sync', 'pen:awareness', 'pen:control'] as const;

type Ack = ((res: { ok: boolean; error?: string }) => void) | undefined;

export function penLiveRoomId(roomToken: string): string {
  return `penlive:${roomToken}`;
}

function reply(ack: Ack, res: { ok: boolean; error?: string }): void {
  if (typeof ack === 'function') ack(res);
}

function payloadSize(payload: unknown): number {
  try {
    return JSON.stringify(payload).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Wire the relay onto one connected socket. Only OAuth-authenticated sockets may use it. */
export function attachPenLiveRelay(socket: Socket): void {
  const pnIdentifier = (socket.data as { oauth?: { pnIdentifier?: string } }).oauth?.pnIdentifier;
  const joined = new Set<string>();
  let tokens = RATE_CAPACITY;
  let lastRefill = Date.now();

  const take = (): boolean => {
    const now = Date.now();
    tokens = Math.min(RATE_CAPACITY, tokens + ((now - lastRefill) / 1000) * RATE_REFILL_PER_SEC);
    lastRefill = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  socket.on('pen:join', (msg: { roomToken?: unknown } | undefined, ack: Ack) => {
    if (!pnIdentifier) return reply(ack, { ok: false, error: 'unauthorized' });
    const roomToken = String(msg?.roomToken ?? '');
    if (!ROOM_TOKEN_RE.test(roomToken)) return reply(ack, { ok: false, error: 'bad_room' });
    if (!joined.has(roomToken) && joined.size >= PEN_LIVE_MAX_ROOMS_PER_SOCKET) {
      return reply(ack, { ok: false, error: 'too_many_rooms' });
    }
    joined.add(roomToken);
    void socket.join(penLiveRoomId(roomToken));
    reply(ack, { ok: true });
  });

  socket.on('pen:leave', (msg: { roomToken?: unknown } | undefined) => {
    const roomToken = String(msg?.roomToken ?? '');
    if (!joined.delete(roomToken)) return;
    void socket.leave(penLiveRoomId(roomToken));
  });

  for (const event of RELAY_EVENTS) {
    socket.on(event, (msg: { roomToken?: unknown; payload?: unknown } | undefined) => {
      if (!pnIdentifier) return;
      const roomToken = String(msg?.roomToken ?? '');
      if (!joined.has(roomToken)) return;
      const payload = msg?.payload;
      if (!payload || typeof payload !== 'object') return;
      if (payloadSize(payload) > PEN_LIVE_MAX_PAYLOAD_CHARS) return;
      if (!take()) return;
      socket.to(penLiveRoomId(roomToken)).emit(event, { roomToken, payload });
    });
  }
}
