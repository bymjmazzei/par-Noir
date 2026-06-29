/**
 * Apply messaging OAuth handoff delivered via oauth-callback.html (window.name bridge).
 */

import {
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
  parseMessagingHandoffFromStorage,
  type MessagingOAuthHandoffPayload,
} from '@par-noir/oauth-ui';
import { applyDmSessionHandoff, restoreDmSessionFromStorage } from './dmIdentitySession';
import { persistMessagingIdentityFromOAuth } from './oauthMessagingIdentityBridge';

export function applyMessagingOAuthHandoff(payload: MessagingOAuthHandoffPayload): boolean {
  let applied = false;
  if (payload.identity) {
    persistMessagingIdentityFromOAuth(payload.identity);
    applied = true;
  }
  if (payload.session) {
    applyDmSessionHandoff(payload.session);
    applied = true;
  }
  return applied;
}

export function applyPendingMessagingOAuthHandoffFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
    if (!raw) return false;
    localStorage.removeItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
    const payload = parseMessagingHandoffFromStorage(raw);
    if (!payload) return false;
    return applyMessagingOAuthHandoff(payload);
  } catch {
    return false;
  }
}

/** Apply oauth-callback messaging backup, then restore sessionStorage ML-KEM session. */
export function restoreMessagingAfterOAuth(): void {
  applyPendingMessagingOAuthHandoffFromStorage();
  restoreDmSessionFromStorage();
}
