/**
 * Subscribe to shared Socket.IO hints (falls back to polling when disconnected).
 */

import { useEffect, useRef, useState } from 'react';
import {
  subscribeRealtimeConnected,
  subscribeRealtimeSync,
  type RealtimeEventType,
} from '../services/realtimeSyncService';

export function useRealtimeSync(
  events: RealtimeEventType[] = ['new_message', 'new_notification'],
  onEvent?: () => void
): boolean {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;
  const [connected, setConnected] = useState(false);
  const eventsKey = events.join(',');

  useEffect(() => {
    return subscribeRealtimeConnected(setConnected);
  }, []);

  useEffect(() => {
    if (!onEvent) return;
    const parsed = eventsKey.split(',').filter(Boolean) as RealtimeEventType[];
    return subscribeRealtimeSync(parsed, () => callbackRef.current?.());
  }, [eventsKey, onEvent]);

  return connected;
}

export function useRealtimeConnected(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    return subscribeRealtimeConnected(setConnected);
  }, []);

  return connected;
}
