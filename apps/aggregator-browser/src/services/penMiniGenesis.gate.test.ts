/**
 * @vitest-environment jsdom
 *
 * Gate: Pen Mini Note genesis must use durable browse ML-DSA — no ephemeral fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mlKem768Keygen, mlDsa65Keygen, bytesToBase64 } from '@par-noir/pqc-crypto';
import {
  applyDmSessionHandoff,
  clearDmIdentity,
} from './dmIdentitySession';
import {
  buildMiniBodySections,
  signPenMiniNoteGenesis,
  verifyPenMiniGenesis,
} from './penMiniGenesis';

function kemPair() {
  const kem = mlKem768Keygen();
  return {
    mlKemSecretKey: bytesToBase64(kem.secretKey),
    mlKemPublicKey: bytesToBase64(kem.publicKey),
  };
}

function unlockWithDsa() {
  const kem = kemPair();
  const dsa = mlDsa65Keygen();
  applyDmSessionHandoff({
    ...kem,
    mlDsaPublicKey: bytesToBase64(dsa.publicKey),
    mlDsaSecretKey: bytesToBase64(dsa.secretKey),
  });
  return dsa;
}

describe('penMiniGenesis gate', () => {
  beforeEach(() => {
    clearDmIdentity();
  });

  afterEach(() => {
    clearDmIdentity();
  });

  it('throws without ML-DSA in browse session', () => {
    applyDmSessionHandoff(kemPair());
    expect(() =>
      signPenMiniNoteGenesis({
        authorPn: 'pn_author',
        templateId: 'note.basic.v1',
        sections: buildMiniBodySections('hello'),
      })
    ).toThrow(/signing_keys_required/);
  });

  it('signs genesis that verifies for committed sections', () => {
    const dsa = unlockWithDsa();
    const sections = buildMiniBodySections('Pen Mini note body');
    const signed = signPenMiniNoteGenesis({
      authorPn: 'pn_author',
      templateId: 'note.basic.v1',
      sections,
    });
    expect(signed.docId.startsWith('pen_')).toBe(true);
    expect(signed.templateId).toBe('note.basic.v1');
    expect(signed.penClassId).toBe('social.note');
    expect(signed.penIrRef.objectId).toBe(signed.docId);
    expect(signed.headProof).toBe(signed.genesis);
    expect(verifyPenMiniGenesis(signed.genesis)).toBe(true);
    expect(signed.genesis.publicKey).toBe(bytesToBase64(dsa.publicKey));
  });

  it('rejects forged genesis public key mismatch', () => {
    unlockWithDsa();
    const signed = signPenMiniNoteGenesis({
      authorPn: 'pn_author',
      templateId: 'note.basic.v1',
      sections: buildMiniBodySections('body'),
    });
    const forged = {
      ...signed.genesis,
      contentCommitment: 'deadbeef',
    };
    expect(verifyPenMiniGenesis(forged)).toBe(false);
  });
});
