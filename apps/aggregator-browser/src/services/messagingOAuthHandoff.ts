/**
 * Apply messaging OAuth handoff delivered via oauth-callback.html (window.name bridge).
 */

import {
  PN_MESSAGING_OAUTH_BROADCAST,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
  isMessagingOAuthHandoffPayload,
  parseMessagingHandoffFromStorage,
  type MessagingOAuthHandoffPayload,
} from '@par-noir/oauth-ui';
import {
  applyDmSessionHandoff,
  hasStoredEncryptedIdentity,
  isDmIdentityReady,
  restoreDmSessionFromStorage,
} from './dmIdentitySession';
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

export function applyMessagingHandoffFromUnknown(raw: unknown): boolean {
  if (!isMessagingOAuthHandoffPayload(raw)) return false;
  return applyMessagingOAuthHandoff(raw);
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

/** Encrypted identity on disk — passcode re-derive after tab refresh only; not OAuth unlock success. */
export function hasRestorableMessagingMaterial(): boolean {
  return hasStoredEncryptedIdentity();
}

/**
 * @deprecated Use isDmIdentityReady() for OAuth gates or hasRestorableMessagingMaterial() for passcode modal.
 */
export function isMessagingUnlockSatisfied(): boolean {
  return isDmIdentityReady() || hasStoredEncryptedIdentity();
}

/**
 * Poll for messaging handoff written by oauth-callback.html (storage + BroadcastChannel).
 * Call during OAuth popup wait and immediately after receiving the authorization code.
 */
export async function waitForAndApplyMessagingHandoff(maxMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  let applied = applyPendingMessagingOAuthHandoffFromStorage();
  if (applied) {
    restoreDmSessionFromStorage();
    return isDmIdentityReady();
  }

  return new Promise((resolve) => {
    let bc: BroadcastChannel | undefined;
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const tryApply = (): boolean => {
      const didApply = applyPendingMessagingOAuthHandoffFromStorage();
      if (didApply) {
        restoreDmSessionFromStorage();
      }
      return isDmIdentityReady();
    };

    try {
      bc = new BroadcastChannel(PN_MESSAGING_OAUTH_BROADCAST);
      bc.onmessage = (event: MessageEvent) => {
        if (isMessagingOAuthHandoffPayload(event.data)) {
          applyMessagingOAuthHandoff(event.data);
          restoreDmSessionFromStorage();
        }
        if (tryApply()) finish(true);
      };
    } catch {
      /* BroadcastChannel unavailable */
    }

    const poll = () => {
      if (tryApply()) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(isDmIdentityReady());
        return;
      }
      setTimeout(poll, 80);
    };

    poll();
  });
}

export const MESSAGING_HANDOFF_INCOMPLETE = 'MESSAGING_HANDOFF_INCOMPLETE';

export function messagingHandoffIncompleteMessage(): string {
  return 'Unlock did not load messaging keys. Lock your pN and unlock again with your identity file.';
}
