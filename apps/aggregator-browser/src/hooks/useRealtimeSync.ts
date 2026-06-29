/**
 * Optional Socket.IO client for message/notification hints (falls back to polling).
 */

import { useEffect, useRef, useState } from 'react';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from '../services/pnOAuthService';

export function useRealtimeSync(onEvent?: () => void): boolean {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: { disconnect: () => void; on: (ev: string, fn: () => void) => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const session = PNOAuthService.loadSession();
        if (!session?.accessToken) return;

        const { io } = await import('socket.io-client');
        if (cancelled) return;

        const s = io(API_ENDPOINT, {
          transports: ['websocket', 'polling'],
          auth: { token: session.accessToken }
        });

        s.on('new_message', () => callbackRef.current?.());
        // Server payload is { threadId, messageId } only — client refetches inbox/thread.
        s.on('new_notification', () => callbackRef.current?.());
        s.on('connect', () => setConnected(true));
        s.on('disconnect', () => setConnected(false));
        socket = s;
      } catch {
        setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      setConnected(false);
      socket?.disconnect();
    };
  }, []);

  return connected;
}
