/**
 * Optional Socket.IO client for message/notification hints (falls back to polling).
 */

import { useEffect, useRef } from 'react';
import { API_ENDPOINT } from '../config/api';
import { PNOAuthService } from './pnOAuthService';

export function useRealtimeSync(onEvent?: () => void): void {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    let socket: { disconnect: () => void } | null = null;
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
        s.on('new_notification', () => callbackRef.current?.());
        socket = s;
      } catch {
        // Polling fallback remains in MessageList/MessageThread
      }
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, []);
}
