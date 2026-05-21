import { describe, expect, it } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/post-quantum/utils.js';
import { bytesToBase64 } from '../src/encoding';
import {
  establishDmSession,
  openDmSession,
  deriveMessageKey,
  encryptDmMessage,
  decryptDmMessage,
  deriveGroupWrapKey,
  wrapChatKey,
  unwrapChatKey,
  generateChatKey,
  isDmCiphertext,
} from '../src/index';

describe('@par-noir/dm-crypto', () => {
  it('ML-KEM session roundtrip', () => {
    const kem = ml_kem768.keygen(randomBytes(64));
    const requesterSk = bytesToBase64(kem.secretKey);
    const requesterPk = bytesToBase64(kem.publicKey);
    const acceptor = ml_kem768.keygen(randomBytes(64));
    const acceptorSk = bytesToBase64(acceptor.secretKey);

    const { kemCiphertext, messageRootKey: acceptorRoot } = establishDmSession(requesterPk, acceptorSk);
    const requesterRoot = openDmSession(kemCiphertext, requesterSk);
    expect(requesterRoot).toEqual(acceptorRoot);
  });

  it('DM message encrypt/decrypt', async () => {
    const root = bytesToBase64(randomBytes(32));
    const connectionId = 'conn_ab_cd';
    const messageKey = deriveMessageKey(root, connectionId);
    const ct = await encryptDmMessage('hello par noir', messageKey);
    expect(isDmCiphertext(ct)).toBe(true);
    const plain = await decryptDmMessage(ct, messageKey);
    expect(plain).toBe('hello par noir');
  });

  it('group chatKey wrap/unwrap', async () => {
    const ownerPn = 'pn-owner';
    const connectionKey = bytesToBase64(randomBytes(32));
    const groupId = 'grp_test123';
    const chatKey = generateChatKey();
    const wrapKey = deriveGroupWrapKey(ownerPn, connectionKey, groupId);
    const wrapped = await wrapChatKey(chatKey, wrapKey);
    const opened = await unwrapChatKey(wrapped, wrapKey);
    expect(opened).toBe(chatKey);
  });

  it('wrong message key fails decrypt', async () => {
    const root = bytesToBase64(randomBytes(32));
    const key1 = deriveMessageKey(root, 'conn_a_b');
    const key2 = deriveMessageKey(root, 'conn_b_a');
    const ct = await encryptDmMessage('secret', key1);
    await expect(decryptDmMessage(ct, key2)).rejects.toThrow();
  });
});
