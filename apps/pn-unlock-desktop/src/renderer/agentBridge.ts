/**
 * Serves the local AI agent socket from this window. The custody bridge in oauth-ui does every
 * check and read; this file only connects it to the preload channel and the Touch ID vault.
 */

import { createAgentCustodyBridge, createAgentJwksSource } from '@par-noir/oauth-ui';
import type { UnlockDesktopApi } from '../preload/preload';
import { listUnlockVaultIdentities, unlockSessionVaultEntries } from './sessionVaultDesktop';

export function startAgentBridge(apiEndpoint: string): () => void {
  const api = (window as Window & { pnUnlockDesktop?: UnlockDesktopApi }).pnUnlockDesktop;
  if (!api?.onAgentRequest) return () => undefined;

  const bridge = createAgentCustodyBridge({
    apiEndpoint,
    jwks: createAgentJwksSource({ apiEndpoint }),
    listVaultIdentities: listUnlockVaultIdentities,
    unlockVaultEntries: async (reason) => {
      const entries = await unlockSessionVaultEntries(reason);
      return entries.length ? entries : null;
    },
  });

  const unsubscribe = api.onAgentRequest((requestId, line) => {
    void bridge.handleLine(line).then((out) => api.respondAgent(requestId, out));
  });
  const wipe = () => bridge.wipeAll();
  window.addEventListener('beforeunload', wipe);
  api.agentReady();

  return () => {
    unsubscribe();
    window.removeEventListener('beforeunload', wipe);
    wipe();
  };
}
