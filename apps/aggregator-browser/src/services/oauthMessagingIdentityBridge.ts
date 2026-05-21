/**
 * Receives encrypted identity from OAuth consent (postMessage) for E2E messaging unlock.
 */

import type { EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { storeEncryptedIdentityForMessaging } from './dmIdentitySession';

export const PN_MESSAGING_IDENTITY_MESSAGE = 'pn_messaging_identity' as const;

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
    if (!isMessagingIdentityMessage(event.data)) return;
    try {
      persistMessagingIdentityFromOAuth(event.data.identity);
    } catch {
      /* ignore malformed */
    }
  };
  window.addEventListener('message', handler, true);
  return () => window.removeEventListener('message', handler, true);
}
