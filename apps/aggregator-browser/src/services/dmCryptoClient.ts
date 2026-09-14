/**
 * Thin browser wiring for @par-noir/dm-crypto DmThreadSession.
 * Identity unlock supplies mlKemSecretKey; package owns crypto + session SoT.
 */

import {
  DmThreadSession,
  openAndRegisterDmThreadSession,
  getDmThreadSession,
  establishDmSession,
  wrapMessageRootKey,
  resolveMessageRootKey,
  UNABLE_TO_DECRYPT_MESSAGE,
  type DmThreadRole
} from '@par-noir/dm-crypto';
import { getDmIdentity } from './dmIdentitySession';
import { PNOAuthService } from './pnOAuthService';
import {
  getLegacyMessageRootKey,
  setLegacyMessageRootKey,
  clearDmSessionCache as clearLegacyAndSessions
} from './dmSessionCache';

/** Recovery blobs from user Drive inbox (not localStorage). */
export interface DmSessionRecovery {
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  legacyRoot?: string;
}

export { UNABLE_TO_DECRYPT_MESSAGE };
export type { DmThreadSession };

export function clearDmSessionCache(): void {
  clearLegacyAndSessions();
}

export async function openDmThreadSession(opts: {
  connectionId: string;
  peerPnIdentifier: string;
  peerRouteKey?: string;
  role?: DmThreadRole;
  recovery: DmSessionRecovery;
}): Promise<DmThreadSession> {
  const { mlKemSecretKey } = getDmIdentity();
  const pnIdentifier = PNOAuthService.loadSession()?.pnIdentifier;
  if (!pnIdentifier) {
    throw new Error('Messaging identity not ready');
  }
  const legacyRoot =
    opts.recovery.legacyRoot || getLegacyMessageRootKey(opts.connectionId);
  return openAndRegisterDmThreadSession({
    connectionId: opts.connectionId,
    mlKemSecretKey,
    myPnIdentifier: pnIdentifier,
    peerPnIdentifier: opts.peerPnIdentifier,
    peerRouteKey: opts.peerRouteKey,
    role: opts.role,
    recovery: {
      kemCiphertext: opts.recovery.kemCiphertext,
      wrappedMessageRootKey: opts.recovery.wrappedMessageRootKey,
      legacyRoot
    }
  });
}

export async function ensureDmThreadSession(opts: {
  connectionId: string;
  peerPnIdentifier: string;
  peerRouteKey?: string;
  role?: DmThreadRole;
  recovery: DmSessionRecovery;
}): Promise<DmThreadSession> {
  const existing = getDmThreadSession(opts.connectionId);
  if (existing) {
    if (opts.peerRouteKey) existing.setPeerRouteKey(opts.peerRouteKey);
    return existing;
  }
  return openDmThreadSession(opts);
}

export async function encryptOutgoingMessage(
  plaintext: string,
  connectionId: string,
  recovery?: DmSessionRecovery,
  opts?: { peerPnIdentifier?: string; peerRouteKey?: string; role?: DmThreadRole }
): Promise<string> {
  const session = await ensureDmThreadSession({
    connectionId,
    peerPnIdentifier: opts?.peerPnIdentifier || '',
    peerRouteKey: opts?.peerRouteKey,
    role: opts?.role,
    recovery: recovery || {}
  });
  return session.encryptOutgoing(plaintext);
}

export async function decryptIncomingMessage(
  encryptedContent: string,
  connectionId: string,
  recovery?: DmSessionRecovery,
  opts?: { peerPnIdentifier?: string; peerRouteKey?: string; role?: DmThreadRole }
): Promise<string> {
  if (!encryptedContent) return '';
  try {
    const session = await ensureDmThreadSession({
      connectionId,
      peerPnIdentifier: opts?.peerPnIdentifier || '',
      peerRouteKey: opts?.peerRouteKey,
      role: opts?.role,
      recovery: recovery || {}
    });
    return session.decryptIncoming(encryptedContent);
  } catch {
    return UNABLE_TO_DECRYPT_MESSAGE;
  }
}

export function createKemSession(peerMlKemPublicKey: string): {
  kemCiphertext: string;
  messageRootKey: string;
} {
  const { mlKemSecretKey } = getDmIdentity();
  const { kemCiphertext, messageRootKey } = establishDmSession(peerMlKemPublicKey, mlKemSecretKey);
  return { kemCiphertext, messageRootKey };
}

export async function wrapAcceptorMessageRootKey(
  messageRootKey: string,
  connectionId: string
): Promise<string> {
  const { mlKemSecretKey } = getDmIdentity();
  return wrapMessageRootKey(messageRootKey, mlKemSecretKey, connectionId);
}

export async function ensureMessageRootKey(
  connectionId: string,
  recovery?: DmSessionRecovery
): Promise<string> {
  const { mlKemSecretKey } = getDmIdentity();
  const legacyRoot = recovery?.legacyRoot || getLegacyMessageRootKey(connectionId);
  const root = await resolveMessageRootKey(connectionId, mlKemSecretKey, {
    kemCiphertext: recovery?.kemCiphertext,
    wrappedMessageRootKey: recovery?.wrappedMessageRootKey,
    legacyRoot
  });
  // Register a session so subsequent encrypt/decrypt share the same SoT.
  await ensureDmThreadSession({
    connectionId,
    peerPnIdentifier: '',
    recovery: { ...recovery, legacyRoot: root }
  }).catch(() => undefined);
  return root;
}

export function cacheLegacyMessageRoot(connectionId: string, rootB64: string): void {
  setLegacyMessageRootKey(connectionId, rootB64);
}
