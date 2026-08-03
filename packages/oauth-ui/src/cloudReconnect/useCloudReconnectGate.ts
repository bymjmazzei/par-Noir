import { useCallback, useEffect, useState } from 'react';
import {
  assessCloudSessionReadiness,
  type ApiStorageAccountRef
} from '@par-noir/user-owned-storage';
import type { CloudReconnectGateConfig, CloudReconnectGateState } from './types';

export function useCloudReconnectGate(config: CloudReconnectGateConfig): CloudReconnectGateState {
  const [readiness, setReadiness] = useState<CloudReconnectGateState['readiness']>('unknown');
  const [socialCloudProvider, setSocialCloudProvider] = useState<string | null>(null);
  const [apiAccounts, setApiAccounts] = useState<ApiStorageAccountRef[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDismissed = useCallback(() => {
    if (!config.dismissStorageKey || typeof sessionStorage === 'undefined') return false;
    try {
      return sessionStorage.getItem(config.dismissStorageKey) === '1';
    } catch {
      return false;
    }
  }, [config.dismissStorageKey]);

  const refresh = useCallback(async () => {
    if (!config.enabled || !config.authToken || !config.pnIdentifier) {
      setReadiness('unknown');
      setPromptOpen(false);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const url = `${config.apiEndpoint.replace(/\/$/, '')}/api/storage/accounts/${encodeURIComponent(config.pnIdentifier)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${config.authToken}` }
      });
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

      const localEnvelope = await config.loadLocalEnvelope();
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
      setChecking(false);
    }
  }, [config, isDismissed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismissPrompt = useCallback(() => {
    setPromptOpen(false);
    if (config.dismissStorageKey) {
      try {
        sessionStorage.setItem(config.dismissStorageKey, '1');
      } catch {
        /* ignore */
      }
    }
  }, [config.dismissStorageKey]);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    setPromptOpen(false);
  }, []);

  const closePanel = useCallback(() => setPanelOpen(false), []);

  const markReady = useCallback(() => {
    setReadiness('ready');
    setPromptOpen(false);
    setPanelOpen(false);
    if (config.dismissStorageKey) {
      try {
        sessionStorage.removeItem(config.dismissStorageKey);
      } catch {
        /* ignore */
      }
    }
  }, [config.dismissStorageKey]);

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
    refresh,
    markReady
  };
}
