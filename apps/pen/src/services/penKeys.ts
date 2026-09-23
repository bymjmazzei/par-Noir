import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import {
  mergeMessagingSessionParts,
  normalizeMessagingHandoffPayload,
  parseMessagingHandoffFromStorage,
  PN_MESSAGING_OAUTH_HANDOFF_STORAGE
} from '@par-noir/oauth-ui';
import type { PenSession } from './penSession';
import { savePenSession } from './penSession';

/** Prefer session ML-DSA keys from messaging handoff. No ephemeral fallback. */
export function resolveSigningKeys(session: PenSession): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  ephemeral: boolean;
} {
  const enriched = enrichSessionSigningKeys(session);
  if (enriched.mlDsaSecretKey && enriched.mlDsaPublicKey) {
    try {
      return {
        publicKey: base64ToBytes(enriched.mlDsaPublicKey),
        secretKey: base64ToBytes(enriched.mlDsaSecretKey),
        ephemeral: false
      };
    } catch {
      throw new Error('signing_keys_invalid');
    }
  }
  throw new Error(
    'signing_keys_required — unlock again so ML-DSA keys are included in the messaging handoff'
  );
}

/** Merge durable ML-DSA from oauth messaging stash into a Pen session when missing. */
export function enrichSessionSigningKeys(session: PenSession): PenSession {
  if (session.mlDsaPublicKey && session.mlDsaSecretKey) return session;
  let fromStorage:
    | { mlKemSecretKey: string; mlDsaSecretKey?: string; mlDsaPublicKey?: string }
    | undefined;
  try {
    fromStorage = parseMessagingHandoffFromStorage(
      localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE)
    )?.session;
  } catch {
    fromStorage = undefined;
  }
  const merged = mergeMessagingSessionParts(
    session.mlKemSecretKey
      ? {
          mlKemSecretKey: session.mlKemSecretKey,
          mlDsaPublicKey: session.mlDsaPublicKey,
          mlDsaSecretKey: session.mlDsaSecretKey
        }
      : null,
    fromStorage
  );
  if (!merged?.mlDsaPublicKey || !merged?.mlDsaSecretKey) return session;
  const next: PenSession = {
    ...session,
    mlKemSecretKey: merged.mlKemSecretKey || session.mlKemSecretKey,
    mlDsaPublicKey: merged.mlDsaPublicKey,
    mlDsaSecretKey: merged.mlDsaSecretKey
  };
  try {
    savePenSession(next);
  } catch {
    /* ignore */
  }
  return next;
}

/** True when handoff includes ML-DSA pair Pen needs for genesis/promote. */
export function handoffHasSigningKeys(messagingHandoff?: unknown): boolean {
  const session = normalizeMessagingHandoffPayload(messagingHandoff)?.session;
  if (session?.mlDsaPublicKey && session?.mlDsaSecretKey) return true;
  try {
    const stored = parseMessagingHandoffFromStorage(
      localStorage.getItem(PN_MESSAGING_OAUTH_HANDOFF_STORAGE)
    )?.session;
    return Boolean(stored?.mlDsaPublicKey && stored?.mlDsaSecretKey);
  } catch {
    return false;
  }
}
