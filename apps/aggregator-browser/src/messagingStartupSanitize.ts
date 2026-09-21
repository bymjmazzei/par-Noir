/**
 * Synchronous startup: clear unlock session that would survive browser reload.
 * Live OAuth handoff (postMessage / pending localStorage from an in-flight unlock)
 * may still apply ML-KEM; leftover OAuth without messaging keys is dropped.
 * Runs before React so storage-recovery effects cannot resurrect a prior unlock.
 */

import {
  PN_OAUTH_STORAGE_LATEST_KEY,
  PN_OAUTH_STORAGE_PENDING,
} from '@par-noir/oauth-ui';
import { clearDmIdentity, isDmIdentityReady } from './services/dmIdentitySession';
import { restoreMessagingAfterOAuth } from './services/messagingOAuthHandoff';
import { PNOAuthService } from './services/pnOAuthService';

function clearOAuthBridgeKeys(): void {
  try {
    localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
    localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('pn_oauth_callback_')) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * End any prior unlock session on cold start (F5 / reload).
 * Apply in-flight messaging handoff only (no ML-KEM sessionStorage restore).
 * If OAuth remains without ML-KEM ready, clear OAuth + bridge keys.
 */
export function sanitizeMessagingOAuthOnStartup(): void {
  if (typeof window === 'undefined') return;

  // Apply pending unlock handoff only — restoreDmSessionFromStorage is a wipe no-op.
  restoreMessagingAfterOAuth();

  if (isDmIdentityReady()) {
    // Fresh unlock completing (handoff applied) — keep OAuth if present.
    return;
  }

  // No in-memory ML-KEM: browser reload must not leave a token-only or prior session.
  clearDmIdentity();
  PNOAuthService.clearSession();
  clearOAuthBridgeKeys();
}
