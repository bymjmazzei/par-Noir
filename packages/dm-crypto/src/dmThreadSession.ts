/**
 * Single SoT for one DM connection: root key, peer route, encrypt/decrypt.
 * UI and send paths must not invent parallel recovery or attribution.
 */

import { deriveMessageKey, encryptDmMessage, decryptDmMessage, isDmCiphertext } from './message.js';
import { resolveMessageRootKey, type ResolveMessageRootKeyOpts } from './dmSessionWrap.js';

export type DmThreadRole = 'requester' | 'acceptor' | 'unknown';

export interface DmThreadSessionOpenParams {
  connectionId: string;
  mlKemSecretKey: string;
  myPnIdentifier: string;
  peerPnIdentifier: string;
  /** Peer opaque mailbox route — required to send throughway. */
  peerRouteKey?: string;
  role?: DmThreadRole;
  recovery: ResolveMessageRootKeyOpts;
}

export const UNABLE_TO_DECRYPT_MESSAGE = '[Unable to decrypt message]';
export const MISSING_SESSION_FOR_CIPHERTEXT = '[Unable to decrypt message]';

/**
 * Opened DM thread session. One per connectionId for a given unlock.
 */
export class DmThreadSession {
  readonly connectionId: string;
  readonly myPnIdentifier: string;
  readonly peerPnIdentifier: string;
  readonly role: DmThreadRole;
  private messageRootKey: string;
  private peerRouteKey: string | undefined;

  private constructor(
    params: DmThreadSessionOpenParams,
    messageRootKey: string
  ) {
    this.connectionId = params.connectionId.trim();
    this.myPnIdentifier = params.myPnIdentifier;
    this.peerPnIdentifier = params.peerPnIdentifier;
    this.role = params.role || 'unknown';
    this.messageRootKey = messageRootKey;
    this.peerRouteKey = params.peerRouteKey?.trim() || undefined;
  }

  static async open(params: DmThreadSessionOpenParams): Promise<DmThreadSession> {
    const connectionId = (params.connectionId || '').trim();
    if (!connectionId) {
      throw new Error('connectionId required to open DmThreadSession');
    }
    if (!params.mlKemSecretKey?.trim()) {
      throw new Error('mlKemSecretKey required to open DmThreadSession');
    }
    const hasRecovery =
      !!params.recovery.kemCiphertext?.trim() ||
      !!params.recovery.wrappedMessageRootKey?.trim() ||
      !!params.recovery.legacyRoot?.trim();
    if (!hasRecovery) {
      throw new Error('No encrypted session for this conversation. Re-accept the connection.');
    }
    const root = await resolveMessageRootKey(connectionId, params.mlKemSecretKey, params.recovery);
    return new DmThreadSession(params, root);
  }

  getPeerRouteKey(): string | undefined {
    return this.peerRouteKey;
  }

  setPeerRouteKey(routeKey: string | undefined): void {
    const t = routeKey?.trim();
    this.peerRouteKey = t || undefined;
  }

  /** Hard refuse send without peer throughway route. */
  assertCanSend(): void {
    if (!this.peerRouteKey || !/^[a-f0-9]{64}$/i.test(this.peerRouteKey)) {
      throw new Error(
        'Peer mailbox route missing. Re-accept the connection after both sides unlock messaging.'
      );
    }
  }

  async encryptOutgoing(plaintext: string): Promise<string> {
    this.assertCanSend();
    const messageKey = deriveMessageKey(this.messageRootKey, this.connectionId);
    return encryptDmMessage(plaintext, messageKey);
  }

  /**
   * Decrypt inbound/outbound ciphertext for paint.
   * Plain non-v2 strings (system messages) pass through.
   * Empty ciphertext → empty string; missing/failed decrypt of v2 → hard fail string (never silent blank).
   */
  async decryptIncoming(encryptedContent: string): Promise<string> {
    if (!encryptedContent) return '';
    if (!isDmCiphertext(encryptedContent)) {
      return encryptedContent;
    }
    try {
      const messageKey = deriveMessageKey(this.messageRootKey, this.connectionId);
      const plain = await decryptDmMessage(encryptedContent, messageKey);
      if (plain == null || plain === '') {
        return UNABLE_TO_DECRYPT_MESSAGE;
      }
      return plain;
    } catch {
      return UNABLE_TO_DECRYPT_MESSAGE;
    }
  }

  /**
   * Attribute a durable row: relative self/peer markers vs my pn.
   */
  isOwnMessage(fromPnIdentifier: string): boolean {
    const from = (fromPnIdentifier || '').trim();
    if (!from || from === 'system') return false;
    if (from === 'self') return true;
    if (from === 'peer') return false;
    return from === this.myPnIdentifier;
  }
}

/** Process-local registry (cleared on lock). */
const sessions = new Map<string, DmThreadSession>();

export function getDmThreadSession(connectionId: string): DmThreadSession | undefined {
  return sessions.get(connectionId.trim());
}

export function setDmThreadSession(session: DmThreadSession): void {
  sessions.set(session.connectionId, session);
}

export async function openAndRegisterDmThreadSession(
  params: DmThreadSessionOpenParams
): Promise<DmThreadSession> {
  const session = await DmThreadSession.open(params);
  setDmThreadSession(session);
  return session;
}

export function clearDmThreadSessions(): void {
  sessions.clear();
}
