/**
 * Soft refresh registry — pages register a reload fn while mounted.
 * Overscroll hosts call the active handler (data reload only; no cloud remint).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export type SoftRefreshHandler = () => void | Promise<void>;

interface SoftRefreshContextValue {
  /** Replace the active soft-refresh handler for the current surface. */
  registerSoftRefresh: (handler: SoftRefreshHandler | null) => void;
  /** Run the currently registered handler (no-op if none). */
  runSoftRefresh: () => Promise<void>;
  /** True while a soft refresh is in flight. */
  isRefreshing: () => boolean;
}

const SoftRefreshContext = createContext<SoftRefreshContextValue | null>(null);

export function SoftRefreshProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<SoftRefreshHandler | null>(null);
  const inflightRef = useRef(false);

  const registerSoftRefresh = useCallback((handler: SoftRefreshHandler | null) => {
    handlerRef.current = handler;
  }, []);

  const isRefreshing = useCallback(() => inflightRef.current, []);

  const runSoftRefresh = useCallback(async () => {
    if (inflightRef.current) return;
    const fn = handlerRef.current;
    if (!fn) return;
    inflightRef.current = true;
    try {
      await fn();
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const value = useMemo(
    () => ({ registerSoftRefresh, runSoftRefresh, isRefreshing }),
    [registerSoftRefresh, runSoftRefresh, isRefreshing]
  );

  return (
    <SoftRefreshContext.Provider value={value}>{children}</SoftRefreshContext.Provider>
  );
}

export function useSoftRefresh(): SoftRefreshContextValue {
  const ctx = useContext(SoftRefreshContext);
  if (!ctx) {
    throw new Error('useSoftRefresh requires SoftRefreshProvider');
  }
  return ctx;
}

/**
 * Register a soft-refresh handler for the lifetime of the calling component.
 * Pass a stable callback (or wrap with useCallback).
 */
export function useRegisterSoftRefresh(handler: SoftRefreshHandler | null): void {
  const { registerSoftRefresh } = useSoftRefresh();
  React.useEffect(() => {
    registerSoftRefresh(handler);
    return () => registerSoftRefresh(null);
  }, [handler, registerSoftRefresh]);
}
