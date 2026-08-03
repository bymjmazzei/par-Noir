import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assessCloudSessionReadiness,
  type ApiStorageAccountRef,
  type StorageCredentialsEnvelope
} from '@par-noir/user-owned-storage';
import type { CloudReconnectGateConfig, CloudReconnectGateState } from './types';

const RATE_LIMIT_COOLDOWN_MS = 60_000;

/**
 * Post-unlock cloud readiness gate.
 * Fetches /api/storage/accounts at most when auth identity changes — not every render.
 */
export function useCloudReconnectGate(config: CloudReconnectGateConfig): CloudReconnectGateState {
  const {
    enabled,
    authToken,
    pnIdentifier,
    apiEndpoint,
    loadLocalEnvelope,
    dismissStorageKey
  } = config;

  const [readiness, setReadiness] = useState<CloudReconnectGateState['readiness']>('unknown');
  const [socialCloudProvider, setSocialCloudProvider] = useState<string | null>(null);
  const [apiAccounts, setApiAccounts] = useState<ApiStorageAccountRef[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLocalEnvelopeRef = useRef(loadLocalEnvelope);
  loadLocalEnvelopeRef.current = loadLocalEnvelope;

  const rateLimitedUntilRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastFetchKeyRef = useRef<string | null>(null);

  const isDismissed = useCallback(() => {
    if (!dismissStorageKey || typeof sessionStorage === 'undefined') return false;
    try {
      return sessionStorage.getItem(dismissStorageKey) === '1';
    } catch {
      return false;
    }
  }, [dismissStorageKey]);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (!enabled || !authToken || !pnIdentifier) {
      setReadiness('unknown');
      setPromptOpen(false);
      return;
    }

    const fetchKey = `${apiEndpoint}|${pnIdentifier}|${authToken.slice(0, 12)}`;
    if (!opts?.force && lastFetchKeyRef.current === fetchKey) {
      return;
    }

    const now = Date.now();
    if (now < rateLimitedUntilRef.current) {
      setError('Cloud status check rate-limited — wait a minute and try again.');
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);
    setError(null);

    try {
      const url = `${apiEndpoint.replace(/\/$/, '')}/api/storage/accounts/${encodeURIComponent(pnIdentifier)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (res.status === 429) {
        rateLimitedUntilRef.current = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        setError('Too many requests — wait about a minute, then unlock or refresh.');
        setReadiness('unknown');
        return;
      }

      if (!res.ok) {
        setReadiness('unknown');
        return;
      }

      const data = (await res.json()) as {
        accounts?: ApiStorageAccountRef[];
        socialCloudProvider?: string;
        primaryProvider?: string;
      };
      const accounts = data.accounts ?? [];
      const social = data.socialCloudProvider ?? data.primaryProvider ?? null;
      setApiAccounts(accounts);
      setSocialCloudProvider(social);
      lastFetchKeyRef.current = fetchKey;

      let localEnvelope: StorageCredentialsEnvelope | null = null;
      try {
        localEnvelope = await loadLocalEnvelopeRef.current();
      } catch {
        localEnvelope = null;
      }

      const next = assessCloudSessionReadiness({
        apiAccounts: accounts,
        socialCloudProvider: social,
        localEnvelope
      });
      setReadiness(next);
      if (next === 'linkedInactive' && !isDismissed()) {
        setPromptOpen(true);
      } else if (next === 'ready') {
        setPromptOpen(false);
        setPanelOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to check cloud status');
      setReadiness('unknown');
    } finally {
      inFlightRef.current = false;
      setChecking(false);
    }
  }, [enabled, authToken, pnIdentifier, apiEndpoint, isDismissed]);

  // Run once per identity/token — not when refresh identity changes.
  useEffect(() => {
    if (!enabled || !authToken || !pnIdentifier) {
      setReadiness('unknown');
      setPromptOpen(false);
      lastFetchKeyRef.current = null;
      return;
    }
    void refresh({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-check when auth identity changes
  }, [enabled, authToken, pnIdentifier, apiEndpoint]);

  const dismissPrompt = useCallback(() => {
    setPromptOpen(false);
    if (dismissStorageKey) {
      try {
        sessionStorage.setItem(dismissStorageKey, '1');
      } catch {
        /* ignore */
      }
    }
  }, [dismissStorageKey]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    setPromptOpen(false);
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const markReady = useCallback(() => {
    setReadiness('ready');
    setPromptOpen(false);
    setPanelOpen(false);
    if (dismissStorageKey) {
      try {
        sessionStorage.removeItem(dismissStorageKey);
      } catch {
        /* ignore */
      }
    }
  }, [dismissStorageKey]);

  const refreshStable = useCallback(() => refresh({ force: true }), [refresh]);

  return {
    readiness,
    socialCloudProvider,
    apiAccounts,
    promptOpen,
    panelOpen,
    checking,
    error,
    openPanel,
    closePanel,
    dismissPrompt,
    refresh: refreshStable,
    markReady
  };
}
