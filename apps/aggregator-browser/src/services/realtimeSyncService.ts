/**
 * Single Socket.IO connection shared across the messaging app.
 */

import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

export type RealtimeEventType = 'new_message' | 'new_notification';

type Subscriber = {
  events: Set<RealtimeEventType>;
  callback: () => void;
};

type SocketLike = {
  disconnect: () => void;
  on: (ev: string, fn: () => void) => void;
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

function fanOut(event: RealtimeEventType): void {
  for (const sub of subscribers) {
    if (sub.events.has(event)) {
      sub.callback();
    }
  }
}

/** Test hook for subscriber fan-out. */
export function dispatchRealtimeEventForTest(event: RealtimeEventType): void {
  fanOut(event);
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

    s.on('new_message', () => fanOut('new_message'));
    s.on('new_notification', () => fanOut('new_notification'));
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
  callback: () => void
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
