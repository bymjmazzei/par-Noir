/**
 * Single Socket.IO connection shared across the messaging app.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

export type RealtimeEventType = 'new_message' | 'new_notification' | 'mailbox_pending';

export type RealtimePayload = Record<string, unknown>;

type Subscriber = {
  events: Set<RealtimeEventType>;
  callback: (payload?: RealtimePayload) => void;
};

type SocketLike = {
  disconnect: () => void;
  on: (ev: string, fn: (...args: unknown[]) => void) => void;
};

let socket: SocketLike | null = null;
let connected = false;
let connectPromise: Promise<void> | null = null;
const subscribers = new Set<Subscriber>();
const connectedListeners = new Set<(value: boolean) => void>();

function notifyConnected(value: boolean): void {
  connected = value;
  for (const listener of connectedListeners) {
    listener(value);
  }
}

function asPayload(raw: unknown): RealtimePayload | undefined {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as RealtimePayload;
  }
  return undefined;
}

function fanOut(event: RealtimeEventType, payload?: RealtimePayload): void {
  for (const sub of subscribers) {
    if (sub.events.has(event)) {
      sub.callback(payload);
    }
  }
}

/** Test hook for subscriber fan-out. */
export function dispatchRealtimeEventForTest(
  event: RealtimeEventType,
  payload?: RealtimePayload
): void {
  fanOut(event, payload);
}

async function ensureConnected(): Promise<void> {
  if (socket) return;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const session = PNOAuthService.loadSession();
    if (!session?.accessToken) {
      notifyConnected(false);
      return;
    }

    const { io } = await import('socket.io-client');
    const s = io(API_ENDPOINT, {
      transports: ['websocket', 'polling'],
      auth: { token: session.accessToken },
    });

    s.on('new_message', (raw: unknown) => {
      const payload = asPayload(raw);
      // Ciphertext-bearing events: fan wake with opaque fields for online session paint.
      void import('./inboundMailboxPreview')
        .then((m) => m.handleRealtimeCiphertextPreview(payload))
        .catch(() => undefined);
      fanOut('new_message', payload);
    });
    s.on('new_notification', (raw: unknown) => fanOut('new_notification', asPayload(raw)));
    // Thin wake — drain/apply for durable Sheets (does not block socket paint).
    s.on('mailbox_pending', (raw: unknown) => fanOut('mailbox_pending', asPayload(raw)));
    s.on('connect', () => notifyConnected(true));
    s.on('disconnect', () => notifyConnected(false));
    socket = s;
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

export function subscribeRealtimeSync(
  events: RealtimeEventType[],
  callback: (payload?: RealtimePayload) => void
): () => void {
  const sub: Subscriber = { events: new Set(events), callback };
  subscribers.add(sub);
  void ensureConnected();

  return () => {
    subscribers.delete(sub);
  };
}

export function subscribeRealtimeConnected(listener: (connected: boolean) => void): () => void {
  connectedListeners.add(listener);
  listener(connected);
  void ensureConnected();

  return () => {
    connectedListeners.delete(listener);
  };
}

export function isRealtimeSyncConnected(): boolean {
  return connected;
}

/** Test / logout helper */
export function disconnectRealtimeSync(): void {
  socket?.disconnect();
  socket = null;
  notifyConnected(false);
}
