import { describe, it, expect } from 'vitest';
import { createShareCommitment, proveShareKnowledge, verifyShareKnowledgeProof } from './shareProof';
import type { ShamirShare } from './shamir';

describe('shareProof', () => {
  const publicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest';
  const share: ShamirShare = { index: 1, share: '801234567890abcdef' };

  it('creates commitment and verifies proof', async () => {
    const commitment = await createShareCommitment(publicKey, share);
    const proof = await proveShareKnowledge(publicKey, share, commitment.commitment);
    expect(await verifyShareKnowledgeProof(proof)).toBe(true);
  });

  it('rejects proof when share does not match commitment', async () => {
    const commitment = await createShareCommitment(publicKey, share);
    const wrongShare: ShamirShare = { index: 2, share: '801ffffffffffffffff' };
    await expect(proveShareKnowledge(publicKey, wrongShare, commitment.commitment)).rejects.toThrow();
  });
});
