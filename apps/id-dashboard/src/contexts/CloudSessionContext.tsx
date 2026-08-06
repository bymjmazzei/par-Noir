import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PN_CLOUD_CREDENTIALS_READY_EVENT } from '@par-noir/oauth-ui';
import {
  clearCloudSessionBootstrap,
  ensureCloudSession as ensureWarm,
  getCloudSessionStatus,
  isCloudSessionReady,
  type CloudSessionBootstrapResult,
  type CloudSessionStatus
} from '../services/storage/cloudSessionBootstrap';

export interface CloudSessionContextValue {
  status: CloudSessionStatus;
  error?: string;
  isReady: boolean;
  ensureCloudSession: () => Promise<CloudSessionBootstrapResult>;
  /** @deprecated bootstrap removed from unlock; kept for callers that update local status */
  markFromBootstrap: (result: CloudSessionBootstrapResult) => void;
  reset: () => void;
}

const CloudSessionContext = createContext<CloudSessionContextValue | null>(null);

export interface CloudSessionProviderProps {
  apiToken: string | null;
  pnIdentifier: string | null;
  sessionId: string | null;
  children: React.ReactNode;
}

export const CloudSessionProvider: React.FC<CloudSessionProviderProps> = ({
  apiToken,
  pnIdentifier,
  sessionId,
  children
}) => {
  const [status, setStatus] = useState<CloudSessionStatus>(() => getCloudSessionStatus().status);
  const [error, setError] = useState<string | undefined>(() => getCloudSessionStatus().error);
  const [readyTick, setReadyTick] = useState(0);

  useEffect(() => {
    const sync = () => {
      const s = getCloudSessionStatus();
      setStatus(s.status);
      setError(s.error);
      setReadyTick((t) => t + 1);
    };
    window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, sync);
    return () => window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, sync);
  }, []);

  const markFromBootstrap = useCallback((result: CloudSessionBootstrapResult) => {
    setStatus(result.status);
    setError(result.error);
  }, []);

  const ensureCloudSession = useCallback(async () => {
    const result = await ensureWarm({ apiToken, pnIdentifier, sessionId });
    markFromBootstrap(result);
    return result;
  }, [apiToken, pnIdentifier, sessionId, markFromBootstrap]);

  const reset = useCallback(() => {
    clearCloudSessionBootstrap(pnIdentifier || undefined);
    setStatus('idle');
    setError(undefined);
  }, [pnIdentifier]);

  const value = useMemo<CloudSessionContextValue>(
    () => ({
      status,
      error,
      isReady: !!(pnIdentifier && isCloudSessionReady(pnIdentifier)),
      ensureCloudSession,
      markFromBootstrap,
      reset
    }),
    [status, error, pnIdentifier, ensureCloudSession, markFromBootstrap, reset, readyTick]
  );

  return <CloudSessionContext.Provider value={value}>{children}</CloudSessionContext.Provider>;
};

export function useCloudSession(): CloudSessionContextValue {
  const ctx = useContext(CloudSessionContext);
  if (!ctx) {
    return {
      status: 'idle',
      isReady: false,
      ensureCloudSession: async () => ({ status: 'needs_reconnect', error: 'No CloudSessionProvider' }),
      markFromBootstrap: () => undefined,
      reset: () => undefined
    };
  }
  return ctx;
}

/** Non-hook ensure for services — warms session/sealed secrets only. */
export {
  ensureCloudSession as ensureCloudSessionBootstrap,
  isCloudSessionReady
} from '../services/storage/cloudSessionBootstrap';
