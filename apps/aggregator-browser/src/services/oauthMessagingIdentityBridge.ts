/**
 * Receives encrypted identity and ML-KEM session from OAuth consent (postMessage).
 */

import type { EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import {
  PN_MESSAGING_IDENTITY_MESSAGE,
  PN_MESSAGING_SESSION_MESSAGE,
  type DmSessionHandoff
} from '@par-noir/messaging-ui';
import { applyDmSessionHandoff, storeEncryptedIdentityForMessaging } from './dmIdentitySession';

export { PN_MESSAGING_IDENTITY_MESSAGE, PN_MESSAGING_SESSION_MESSAGE };

export function isMessagingIdentityMessage(data: unknown): data is {
  type: typeof PN_MESSAGING_IDENTITY_MESSAGE;
  identity: EncryptedIdentityPayload;
} {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.type !== PN_MESSAGING_IDENTITY_MESSAGE) return false;
  const id = d.identity as Record<string, unknown> | undefined;
  return !!(
    id &&
    typeof id.encryptedData === 'string' &&
    typeof id.iv === 'string' &&
    typeof id.salt === 'string'
  );
}

export function isMessagingSessionMessage(data: unknown): data is {
  type: typeof PN_MESSAGING_SESSION_MESSAGE;
  session: DmSessionHandoff;
} {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.type !== PN_MESSAGING_SESSION_MESSAGE) return false;
  const session = d.session as Record<string, unknown> | undefined;
  return !!(session && typeof session.mlKemSecretKey === 'string' && session.mlKemSecretKey.length > 0);
}

export function persistMessagingIdentityFromOAuth(identity: EncryptedIdentityPayload): void {
  storeEncryptedIdentityForMessaging({
    encryptedData: identity.encryptedData,
    iv: identity.iv,
    salt: identity.salt,
    publicKey: identity.publicKey,
    mlKemPublicKey: identity.mlKemPublicKey
  });
}

export function installOAuthMessagingIdentityListener(): () => void {
  const handler = (event: MessageEvent) => {
    if (isMessagingIdentityMessage(event.data)) {
      try {
        persistMessagingIdentityFromOAuth(event.data.identity);
      } catch {
        /* ignore malformed */
      }
      return;
    }
    if (isMessagingSessionMessage(event.data)) {
      try {
        applyDmSessionHandoff(event.data.session);
      } catch {
        /* ignore malformed */
      }
    }
  };
  window.addEventListener('message', handler, true);
  return () => window.removeEventListener('message', handler, true);
}
