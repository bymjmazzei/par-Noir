/**
 * Apply messaging OAuth handoff delivered via oauth-callback.html (window.name bridge).
 */

import {
  PN_MESSAGING_OAUTH_BROADCAST,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
  normalizeMessagingHandoffPayload,
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
  const payload = normalizeMessagingHandoffPayload(raw);
  if (!payload) return false;
  return applyMessagingOAuthHandoff(payload);
}

/** Apply every known messaging handoff source (callback payload + localStorage stash). */
export function applyAllMessagingHandoffSources(messagingHandoff?: unknown): void {
  if (messagingHandoff) {
    applyMessagingHandoffFromUnknown(messagingHandoff);
  }
  applyPendingMessagingOAuthHandoffFromStorage();
  restoreDmSessionFromStorage();
}

export function applyPendingMessagingOAuthHandoffFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
    if (!raw) return false;
    const payload = parseMessagingHandoffFromStorage(raw);
    if (!payload) return false;
    applyMessagingOAuthHandoff(payload);
    // Keep stashed payload until ML-KEM session is in memory (identity-only is not enough).
    if (isDmIdentityReady()) {
      localStorage.removeItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
    }
    return isDmIdentityReady();
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
  if (applyPendingMessagingOAuthHandoffFromStorage()) {
    restoreDmSessionFromStorage();
    if (isDmIdentityReady()) return true;
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
      window.removeEventListener('storage', onStorage);
      resolve(ok);
    };

    const tryApply = (): boolean => {
      applyPendingMessagingOAuthHandoffFromStorage();
      restoreDmSessionFromStorage();
      return isDmIdentityReady();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PN_MESSAGING_OAUTH_HANDOFF_STORAGE || !event.newValue) return;
      if (tryApply()) finish(true);
    };

    try {
      window.addEventListener('storage', onStorage);
    } catch {
      /* ignore */
    }

    try {
      bc = new BroadcastChannel(PN_MESSAGING_OAUTH_BROADCAST);
      bc.onmessage = (event: MessageEvent) => {
        if (applyMessagingHandoffFromUnknown(event.data)) {
          restoreDmSessionFromStorage();
          if (isDmIdentityReady()) {
            try {
              localStorage.removeItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE);
            } catch {
              /* ignore */
            }
          }
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
