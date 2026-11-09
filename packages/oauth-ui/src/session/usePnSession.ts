import { useEffect, useState } from 'react';
import type { PnSession, PnSessionRecord } from './pnSession';

const LIVE_FIELDS = ['accessToken', 'refreshToken', 'expiresAt', 'idleTimeoutS', 'lastActiveAt'] as const;

function identityKey(record: PnSessionRecord): string {
  const rest: Record<string, unknown> = { ...record };
  for (const f of LIVE_FIELDS) delete rest[f];
  return JSON.stringify(rest);
}

/**
 * Record whose token fields always read the latest stored values. Token refresh
 * therefore never changes object identity, so effects keyed on the session do
 * not re-run (and editors do not remount) every hour.
 */
export function livePnSessionRecord<E extends object>(
  session: Pick<PnSession<E>, 'load'>,
  snapshot: PnSessionRecord<E>
): PnSessionRecord<E> {
  const view = { ...snapshot };
  for (const f of LIVE_FIELDS) {
    Object.defineProperty(view, f, {
      enumerable: true,
      configurable: true,
      get: () => (session.load() ?? snapshot)[f],
    });
  }
  return view;
}

/**
 * Current session record; idle tracking and refresh-ahead run while a session exists.
 * Lock always reloads the page, so consumers never render a stale unlocked view.
 */
export function usePnSession<E extends object>(session: PnSession<E>): PnSessionRecord<E> | null {
  const [record, setRecord] = useState<PnSessionRecord<E> | null>(() => {
    const initial = session.load();
    return initial ? livePnSessionRecord(session, initial) : null;
  });
  const unlocked = record != null;

  useEffect(
    () =>
      session.subscribe((next) =>
        setRecord((prev) => {
          if (!next) return null;
          if (prev && identityKey(prev) === identityKey(next)) return prev;
          return livePnSessionRecord(session, next);
        })
      ),
    [session]
  );

  useEffect(() => {
    if (!unlocked) return;
    return session.startIdleWatch();
  }, [session, unlocked]);

  return record;
}
