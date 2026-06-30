/**
 * Receives encrypted identity and ML-KEM session from OAuth consent (postMessage).
 */

import type { EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import {
  PN_MESSAGING_IDENTITY_MESSAGE,
  PN_MESSAGING_SESSION_MESSAGE,
  type DmSessionHandoff,
} from '@par-noir/messaging-ui';
import {
  PN_MESSAGING_OAUTH_BROADCAST,
} from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { applyDmSessionHandoff, storeEncryptedIdentityForMessaging } from './dmIdentitySession';
import { applyMessagingHandoffFromUnknown } from './messagingOAuthHandoff';

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

function getAllowedMessagingOrigins(): Set<string> {
  const origins = new Set<string>();
  if (typeof window !== 'undefined') {
    origins.add(window.location.origin);
  }
  try {
    if (API_ENDPOINT) {
      origins.add(new URL(API_ENDPOINT).origin);
    }
  } catch {
    /* ignore invalid API_ENDPOINT */
  }
  return origins;
}

export function persistMessagingIdentityFromOAuth(identity: EncryptedIdentityPayload): void {
  storeEncryptedIdentityForMessaging({
    encryptedData: identity.encryptedData,
    iv: identity.iv,
    salt: identity.salt,
    publicKey: identity.publicKey,
    mlKemPublicKey: identity.mlKemPublicKey,
  });
}

export function installOAuthMessagingIdentityListener(): () => void {
  const allowedOrigins = getAllowedMessagingOrigins();

  const handler = (event: MessageEvent) => {
    if (!allowedOrigins.has(event.origin)) return;

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

  let broadcastChannel: BroadcastChannel | null = null;
  try {
    broadcastChannel = new BroadcastChannel(PN_MESSAGING_OAUTH_BROADCAST);
    broadcastChannel.onmessage = (event: MessageEvent) => {
      if (applyMessagingHandoffFromUnknown(event.data)) {
        /* applied via normalize */
      }
    };
  } catch {
    /* BroadcastChannel unavailable */
  }

  return () => {
    window.removeEventListener('message', handler, true);
    broadcastChannel?.close();
  };
}
