import { describe, expect, it, beforeEach } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { establishDmSession } from './session.js';
import { deriveMessageKey, encryptDmMessage } from './message.js';
import { wrapMessageRootKey } from './dmSessionWrap.js';
import { bytesToBase64 } from './encoding.js';
import {
  DmThreadSession,
  clearDmThreadSessions,
  openAndRegisterDmThreadSession,
  getDmThreadSession,
  UNABLE_TO_DECRYPT_MESSAGE
} from './dmThreadSession.js';

function keyPair() {
  const kem = ml_kem768.keygen(randomBytes(64));
  return {
    publicKey: bytesToBase64(kem.publicKey),
    secretKey: bytesToBase64(kem.secretKey)
  };
}

describe('DmThreadSession', () => {
  beforeEach(() => clearDmThreadSessions());

  it('opens acceptor session, encrypts, decrypts', async () => {
    const a = keyPair();
    const b = keyPair();
    const { kemCiphertext, messageRootKey } = establishDmSession(a.publicKey, b.secretKey);
    const connectionId = 'conn_test_1';
    const wrapped = await wrapMessageRootKey(messageRootKey, b.secretKey, connectionId);
    const peerRoute = 'a'.repeat(64);

    const session = await openAndRegisterDmThreadSession({
      connectionId,
      mlKemSecretKey: b.secretKey,
      myPnIdentifier: 'pn-b',
      peerPnIdentifier: 'pn-a',
      peerRouteKey: peerRoute,
      role: 'acceptor',
      recovery: { wrappedMessageRootKey: wrapped, kemCiphertext }
    });

    expect(getDmThreadSession(connectionId)).toBe(session);
    const enc = await session.encryptOutgoing('hello');
    const plain = await session.decryptIncoming(enc);
    expect(plain).toBe('hello');
    expect(session.isOwnMessage('self')).toBe(true);
    expect(session.isOwnMessage('peer')).toBe(false);
    expect(session.isOwnMessage('pn-b')).toBe(true);
  });

  it('refuses send without peer route', async () => {
    const a = keyPair();
    const b = keyPair();
    const { kemCiphertext, messageRootKey } = establishDmSession(a.publicKey, b.secretKey);
    const connectionId = 'conn_test_2';
    const session = await DmThreadSession.open({
      connectionId,
      mlKemSecretKey: a.secretKey,
      myPnIdentifier: 'pn-a',
      peerPnIdentifier: 'pn-b',
      role: 'requester',
      recovery: { kemCiphertext }
    });
    await expect(session.encryptOutgoing('x')).rejects.toThrow(/Peer mailbox route missing/);
    const messageKey = deriveMessageKey(messageRootKey, connectionId);
    const enc = await encryptDmMessage('from-b', messageKey);
    expect(await session.decryptIncoming(enc)).toBe('from-b');
  });

  it('returns hard fail string for undecryptable v2 ciphertext', async () => {
    const a = keyPair();
    const b = keyPair();
    const { kemCiphertext } = establishDmSession(a.publicKey, b.secretKey);
    const session = await DmThreadSession.open({
      connectionId: 'conn_test_3',
      mlKemSecretKey: a.secretKey,
      myPnIdentifier: 'pn-a',
      peerPnIdentifier: 'pn-b',
      peerRouteKey: 'b'.repeat(64),
      recovery: { kemCiphertext }
    });
    // Valid shape but wrong key material
    const other = keyPair();
    const { messageRootKey: otherRoot } = establishDmSession(other.publicKey, other.secretKey);
    const messageKey = deriveMessageKey(otherRoot, 'conn_test_3');
    const enc = await encryptDmMessage('secret', messageKey);
    expect(await session.decryptIncoming(enc)).toBe(UNABLE_TO_DECRYPT_MESSAGE);
  });
});
