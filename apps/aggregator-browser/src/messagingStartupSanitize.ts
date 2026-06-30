/**
 * Synchronous startup: apply any pending handoff, then drop OAuth sessions
 * that cannot support messaging. Runs before React so storage-recovery effects cannot
 * resurrect a token-only session first.
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

/** Drop OAuth + bridge keys when messaging keys are missing (browse + messaging builds). */
export function sanitizeMessagingOAuthOnStartup(): void {
  if (typeof window === 'undefined') return;

  restoreMessagingAfterOAuth();

  const session = PNOAuthService.loadSession();
  if (!session?.accessToken) return;

  if (isDmIdentityReady()) return;

  clearDmIdentity();
  PNOAuthService.clearSession();
  clearOAuthBridgeKeys();
}
