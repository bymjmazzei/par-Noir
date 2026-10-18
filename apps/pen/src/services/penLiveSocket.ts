/**
 * socket.io transport for live co-editing. The relay only forwards opaque
 * encrypted payloads between members of a room token; nothing is stored.
 */

import { io, type Socket } from 'socket.io-client';
import type { PenLiveTransport, PenLiveWireKind, PenLiveWirePayload } from '@par-noir/pen-live';
import { API_ENDPOINT } from '../config/api';

const EVENT_BY_KIND: Record<PenLiveWireKind, string> = {
  batch: 'pen:batch',
  sync: 'pen:sync',
  awareness: 'pen:awareness',
  control: 'pen:control'
};

let shared: { token: string; socket: Socket; users: number } | null = null;

function acquireSocket(accessToken: string): Socket {
  if (shared && shared.token === accessToken) {
    shared.users += 1;
    return shared.socket;
  }
  if (shared) shared.socket.disconnect();
  const socket = io(API_ENDPOINT, {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true
  });
  shared = { token: accessToken, socket, users: 1 };
  return socket;
}

function releaseSocket(socket: Socket): void {
  if (!shared || shared.socket !== socket) return;
  shared.users -= 1;
  if (shared.users <= 0) {
    shared.socket.disconnect();
    shared = null;
  }
}

export interface PenLiveSocketTransport extends PenLiveTransport {
  close(): void;
}

export function createPenLiveTransport(accessToken: string): PenLiveSocketTransport {
  const socket = acquireSocket(accessToken);
  const rooms = new Set<string>();
  const handlers = new Set<
    (kind: PenLiveWireKind, roomToken: string, payload: PenLiveWirePayload) => void
  >();
  const reconnectHandlers = new Set<() => void>();
  const kinds = Object.keys(EVENT_BY_KIND) as PenLiveWireKind[];

  const listeners = kinds.map((kind) => {
    const listener = (msg: { roomToken?: string; payload?: PenLiveWirePayload }) => {
      if (!msg?.roomToken || !msg.payload || !rooms.has(msg.roomToken)) return;
      for (const h of handlers) h(kind, msg.roomToken, msg.payload);
    };
    socket.on(EVENT_BY_KIND[kind], listener);
    return [EVENT_BY_KIND[kind], listener] as const;
  });

  // Sends before the first connect are dropped, so every connect rejoins and resyncs.
  const onConnect = () => {
    for (const room of rooms) socket.emit('pen:join', { roomToken: room });
    for (const h of reconnectHandlers) h();
  };
  socket.on('connect', onConnect);

  return {
    join(roomToken) {
      rooms.add(roomToken);
      if (socket.connected) socket.emit('pen:join', { roomToken });
    },
    leave(roomToken) {
      rooms.delete(roomToken);
      if (socket.connected) socket.emit('pen:leave', { roomToken });
    },
    send(kind, roomToken, payload) {
      if (!socket.connected) return;
      socket.emit(EVENT_BY_KIND[kind], { roomToken, payload });
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onReconnect(handler) {
      reconnectHandlers.add(handler);
      return () => reconnectHandlers.delete(handler);
    },
    close() {
      for (const room of rooms) if (socket.connected) socket.emit('pen:leave', { roomToken: room });
      rooms.clear();
      handlers.clear();
      reconnectHandlers.clear();
      for (const [event, listener] of listeners) socket.off(event, listener);
      socket.off('connect', onConnect);
      releaseSocket(socket);
    }
  };
}
