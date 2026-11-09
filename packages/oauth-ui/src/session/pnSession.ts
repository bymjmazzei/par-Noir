/**
 * One session layer for every first-party app.
 *
 * - getAccessToken(): refreshes ahead of expiry, one refresh at a time (the API
 *   rotates refresh tokens, so parallel refreshes would kill the family).
 * - Idle lock compares timestamps on wake/focus/pageshow and on an interval;
 *   timers alone stall while the machine sleeps or the tab is backgrounded.
 * - lock(): app before-lock hooks (flush) → wipe hooks → lock-browser (manual)
 *   → clear storage → hard reload to the app home so no prior page survives.
 */

import { refreshPortalAccessToken, type PortalTokenResponse } from '../portalOAuthSession';
import {
  readSharedLastActive,
  readSharedLockedAt,
  writeSharedLastActive,
  writeSharedLockedAt,
} from './browserCookies';

export type PnLockReason = 'manual' | 'idle' | 'expired' | 'remote';

export interface PnSessionBase {
  accessToken: string;
  refreshToken?: string;
  /** Access-token expiry, ms epoch. */
  expiresAt: number;
  pnIdentifier: string;
  /** Idle lock in seconds; 0 = trusted device (no idle lock). */
  idleTimeoutS: number;
  unlockedAt: number;
  lastActiveAt: number;
}

export type PnSessionRecord<E extends object = object> = PnSessionBase & E;

export interface PnSessionConfig {
  clientId: string;
  apiEndpoint: string;
  storageKey: string;
  /** Defaults to sessionStorage (tab-scoped). */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** Where lock reloads to. Default '/'. */
  homePath?: string;
  refreshSkewMs?: number;
  beforeLockTimeoutMs?: number;
  now?: () => number;
  reload?: (path: string) => void;
}

export type PnSessionHook = (reason: PnLockReason) => void | Promise<void>;

export interface PnSession<E extends object = object> {
  readonly config: Readonly<PnSessionConfig>;
  load(): PnSessionRecord<E> | null;
  save(record: PnSessionRecord<E>): void;
  update(patch: Partial<PnSessionRecord<E>>): PnSessionRecord<E> | null;
  /** Build + save a record from a token response (exchange or refresh). */
  begin(tokens: PortalTokenResponse, fields: { pnIdentifier: string } & E): PnSessionRecord<E>;
  /** Clear storage without reload (failed unlock, abandoned handoff). */
  clear(): void;
  /** forceRefresh: after a 401, rotate even if the stored token looks fresh. */
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string | null>;
  onBeforeLock(fn: PnSessionHook): () => void;
  onWipe(fn: PnSessionHook): () => void;
  subscribe(fn: (record: PnSessionRecord<E> | null) => void): () => void;
  lock(reason: PnLockReason): Promise<void>;
  /** Attach idle tracking; returns a stop function. */
  startIdleWatch(): () => void;
  /** True if the idle window has passed (checked against shared activity). */
  isIdleExpired(): boolean;
  touch(): void;
}

const DEFAULT_SKEW_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 15_000;
const IDLE_CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove'] as const;

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function createPnSession<E extends object = object>(config: PnSessionConfig): PnSession<E> {
  const now = config.now ?? (() => Date.now());
  const skew = config.refreshSkewMs ?? DEFAULT_SKEW_MS;
  const homePath = config.homePath ?? '/';
  const reload =
    config.reload ??
    ((path: string) => {
      if (typeof window !== 'undefined') window.location.replace(path);
    });
  const apiBase = config.apiEndpoint.replace(/\/$/, '');

  const beforeLock = new Set<PnSessionHook>();
  const wipe = new Set<PnSessionHook>();
  const listeners = new Set<(record: PnSessionRecord<E> | null) => void>();
  let refreshInFlight: Promise<string | null> | null = null;
  let locking: Promise<void> | null = null;
  let flushingBeforeLock = false;
  let lastActivityWrite = 0;

  const store = () => config.storage ?? defaultStorage();

  function emit(record: PnSessionRecord<E> | null): void {
    for (const fn of listeners) {
      try {
        fn(record);
      } catch {
        /* listener errors never block session state */
      }
    }
  }

  function load(): PnSessionRecord<E> | null {
    try {
      const raw = store()?.getItem(config.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PnSessionRecord<E>;
      if (!parsed?.accessToken || !parsed?.pnIdentifier) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function save(record: PnSessionRecord<E>): void {
    store()?.setItem(config.storageKey, JSON.stringify(record));
    emit(record);
  }

  function update(patch: Partial<PnSessionRecord<E>>): PnSessionRecord<E> | null {
    const current = load();
    if (!current) return null;
    const next = { ...current, ...patch } as PnSessionRecord<E>;
    save(next);
    return next;
  }

  function begin(
    tokens: PortalTokenResponse,
    fields: { pnIdentifier: string } & E
  ): PnSessionRecord<E> {
    const t = now();
    const record = {
      ...fields,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: t + (tokens.expires_in || 3600) * 1000,
      idleTimeoutS: typeof tokens.idle_timeout_s === 'number' ? tokens.idle_timeout_s : 3600,
      unlockedAt: t,
      lastActiveAt: t,
    } as PnSessionRecord<E>;
    save(record);
    writeSharedLastActive(t);
    return record;
  }

  function clear(): void {
    store()?.removeItem(config.storageKey);
    emit(null);
  }

  async function refresh(record: PnSessionRecord<E>): Promise<string | null> {
    if (!record.refreshToken) {
      void lock('expired');
      return null;
    }
    let data: PortalTokenResponse | null;
    try {
      data = await refreshPortalAccessToken({
        apiEndpoint: apiBase,
        clientId: config.clientId,
        refreshToken: record.refreshToken,
      });
    } catch {
      // Offline: keep the session; the caller's request will fail and retry later.
      return record.expiresAt > now() ? record.accessToken : null;
    }
    if (!data) {
      void lock('expired');
      return null;
    }
    const latest = load() ?? record;
    const next = {
      ...latest,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || latest.refreshToken,
      expiresAt: now() + (data.expires_in || 3600) * 1000,
      idleTimeoutS:
        typeof data.idle_timeout_s === 'number' ? data.idle_timeout_s : latest.idleTimeoutS,
    } as PnSessionRecord<E>;
    save(next);
    return next.accessToken;
  }

  async function getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string | null> {
    // Before-lock hooks may still flush with the current token; nothing refreshes once locking.
    if (locking) return flushingBeforeLock ? load()?.accessToken ?? null : null;
    const record = load();
    if (!record) return null;
    if (isLockedElsewhere(record)) {
      void lock('remote');
      return null;
    }
    if (isIdleExpired()) {
      void lock('idle');
      return null;
    }
    if (!opts?.forceRefresh && record.expiresAt - skew > now()) return record.accessToken;
    if (!refreshInFlight) {
      refreshInFlight = refresh(record).finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  function lastActive(record: PnSessionRecord<E>): number {
    return Math.max(record.lastActiveAt || 0, readSharedLastActive());
  }

  function isLockedElsewhere(record: PnSessionRecord<E>): boolean {
    return readSharedLockedAt() > (record.unlockedAt || 0);
  }

  function isIdleExpired(): boolean {
    const record = load();
    if (!record || !record.idleTimeoutS) return false;
    return now() - lastActive(record) > record.idleTimeoutS * 1000;
  }

  function touch(): void {
    const t = now();
    if (t - lastActivityWrite < ACTIVITY_THROTTLE_MS) return;
    const record = load();
    if (!record) return;
    // Activity after the window has lapsed must not revive the session.
    if (isIdleExpired()) {
      void lock('idle');
      return;
    }
    lastActivityWrite = t;
    store()?.setItem(config.storageKey, JSON.stringify({ ...record, lastActiveAt: t }));
    writeSharedLastActive(t);
  }

  async function runHooks(hooks: Set<PnSessionHook>, reason: PnLockReason, timeoutMs?: number) {
    for (const fn of [...hooks]) {
      try {
        const run = Promise.resolve(fn(reason));
        if (timeoutMs) {
          await Promise.race([run, new Promise((r) => setTimeout(r, timeoutMs))]);
        } else {
          await run;
        }
      } catch {
        /* one failing hook must not stop the lock */
      }
    }
  }

  function lock(reason: PnLockReason): Promise<void> {
    if (locking) return locking;
    locking = (async () => {
      const record = load();
      if (reason === 'manual') writeSharedLockedAt(now());
      flushingBeforeLock = true;
      await runHooks(beforeLock, reason, config.beforeLockTimeoutMs ?? 3000);
      flushingBeforeLock = false;
      await runHooks(wipe, reason);
      if (reason === 'manual' && record?.refreshToken) {
        try {
          await fetch(`${apiBase}/oauth/lock-browser`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: record.refreshToken, reason }),
            keepalive: true,
          });
        } catch {
          /* best effort: server idle backstop still applies */
        }
      }
      clear();
      reload(homePath);
    })();
    return locking;
  }

  function startIdleWatch(): () => void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
    // getAccessToken covers locked-elsewhere, idle, and refresh-ahead-of-expiry,
    // so the stored token stays fresh for readers that only call load().
    const check = () => {
      if (load()) void getAccessToken();
    };
    const onActivity = () => touch();
    const onWake = () => {
      if (document.visibilityState === 'hidden') return;
      check();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);
    const interval = window.setInterval(check, IDLE_CHECK_INTERVAL_MS);
    check();
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      window.clearInterval(interval);
    };
  }

  return {
    config,
    load,
    save,
    update,
    begin,
    clear,
    getAccessToken,
    onBeforeLock(fn) {
      beforeLock.add(fn);
      return () => beforeLock.delete(fn);
    },
    onWipe(fn) {
      wipe.add(fn);
      return () => wipe.delete(fn);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    lock,
    startIdleWatch,
    isIdleExpired,
    touch,
  };
}

/** socket.io `auth` callback so every reconnect presents a fresh token. */
export function pnSocketAuth(session: Pick<PnSession, 'getAccessToken'>) {
  return (cb: (data: { token: string }) => void) => {
    void session.getAccessToken().then((token) => cb({ token: token || '' }));
  };
}

/** Another app in this browser locked: lock here too. */
export function bindSessionLockedEvent(
  socket: { on(ev: string, fn: () => void): unknown; off?(ev: string, fn: () => void): unknown },
  session: Pick<PnSession, 'lock'>
): () => void {
  const handler = () => {
    void session.lock('remote');
  };
  socket.on('session_locked', handler);
  return () => {
    socket.off?.('session_locked', handler);
  };
}
