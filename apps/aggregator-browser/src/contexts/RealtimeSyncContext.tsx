/**
 * Ensures the shared realtime socket is initialized once per app session.
 */

import { useEffect, type ReactNode } from 'react';
import { subscribeRealtimeConnected } from '../services/realtimeSyncService';

export function RealtimeSyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    return subscribeRealtimeConnected(() => undefined);
  }, []);

  return <>{children}</>;
}
