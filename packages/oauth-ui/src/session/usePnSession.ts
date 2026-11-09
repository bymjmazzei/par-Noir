import { useEffect, useState } from 'react';
import type { PnSession, PnSessionRecord } from './pnSession';

/**
 * Current session record; idle tracking runs while a session exists.
 * Lock always reloads the page, so consumers never render a stale unlocked view.
 */
export function usePnSession<E extends object>(session: PnSession<E>): PnSessionRecord<E> | null {
  const [record, setRecord] = useState<PnSessionRecord<E> | null>(() => session.load());
  const unlocked = record != null;

  useEffect(() => session.subscribe(setRecord), [session]);

  useEffect(() => {
    if (!unlocked) return;
    return session.startIdleWatch();
  }, [session, unlocked]);

  return record;
}
