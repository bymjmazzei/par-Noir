import { describe, it, expect } from 'vitest';
import {
  custodyAad,
  generateRecoveryKeyPair,
  openSealedShare,
  parseSealedShare,
  recoveryRequestIdFor,
  releaseAad,
  sealShareToKey,
  serializeSealedShare,
} from './shareSealing';
import { combineShares, splitSecret } from './shamir';

describe('shareSealing', () => {
  const share = { index: 2, share: '802abc123def' };

  it('round-trips a share sealed to an ML-KEM key', async () => {
    const kp = generateRecoveryKeyPair();
    const aad = releaseAad({ requestId: 'r1', custodianId: 'c1', shareIndex: 2, epoch: 1 });
    const sealed = await sealShareToKey(share, kp.publicKey, aad);
    const opened = await openSealedShare(parseSealedShare(serializeSealedShare(sealed)), kp.secretKey, aad);
    expect(opened).toEqual(share);
  });

  it('fails with the wrong secret key', async () => {
    const kp = generateRecoveryKeyPair();
    const other = generateRecoveryKeyPair();
    const aad = releaseAad({ requestId: 'r1', custodianId: 'c1', shareIndex: 2, epoch: 1 });
    const sealed = await sealShareToKey(share, kp.publicKey, aad);
    await expect(openSealedShare(sealed, other.secretKey, aad)).rejects.toThrow('could not be opened');
  });

  it('fails when the AAD does not match (no replay across requests or epochs)', async () => {
    const kp = generateRecoveryKeyPair();
    const sealed = await sealShareToKey(
      share,
      kp.publicKey,
      custodyAad({ ownerPublicKey: 'pk', custodianId: 'c1', shareIndex: 2, epoch: 1 })
    );
    await expect(
      openSealedShare(sealed, kp.secretKey, custodyAad({ ownerPublicKey: 'pk', custodianId: 'c1', shareIndex: 2, epoch: 2 }))
    ).rejects.toThrow('could not be opened');
    await expect(
      openSealedShare(sealed, kp.secretKey, releaseAad({ requestId: 'r1', custodianId: 'c1', shareIndex: 2, epoch: 1 }))
    ).rejects.toThrow('could not be opened');
  });

  it('reseal from custody key to temporary key recombines the secret', async () => {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const shares = splitSecret(secret, 2, 3);
    const custodian = generateRecoveryKeyPair();
    const temp = generateRecoveryKeyPair();
    const requestId = await recoveryRequestIdFor(temp.publicKey);

    const released = [];
    for (const s of shares.slice(0, 2)) {
      const cAad = custodyAad({ ownerPublicKey: 'owner', custodianId: `c${s.index}`, shareIndex: s.index, epoch: 1 });
      const custody = await sealShareToKey(s, custodian.publicKey, cAad);
      const held = await openSealedShare(custody, custodian.secretKey, cAad);
      const rAad = releaseAad({ requestId, custodianId: `c${s.index}`, shareIndex: s.index, epoch: 1 });
      released.push(await openSealedShare(await sealShareToKey(held, temp.publicKey, rAad), temp.secretKey, rAad));
    }
    expect(Array.from(combineShares(released))).toEqual(Array.from(secret));
  });

  it('derives a stable request id from the temporary public key', async () => {
    const kp = generateRecoveryKeyPair();
    const a = await recoveryRequestIdFor(kp.publicKey);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(await recoveryRequestIdFor(kp.publicKey)).toBe(a);
  });

  it('rejects malformed sealed payloads', () => {
    expect(() => parseSealedShare('{"v":1}')).toThrow('invalid sealed share');
  });
});
