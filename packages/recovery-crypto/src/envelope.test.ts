import { describe, expect, it } from 'vitest';
import { b64ToBytes } from './shamir';
import {
  buildRecoveryPayload,
  decryptKeyRecoveryEnvelope,
  encryptKeyRecoveryEnvelope,
} from './envelope';

const payload = buildRecoveryPayload({
  publicKey: 'pk',
  mlKemPublicKey: 'kem-pk',
  mlKemSecretKey: 'kem-sk',
  mlDsaSecretKey: 'dsa-sk',
  identityId: 'did:key:abc',
  pnName: 'old-key-one',
  recoveryConfig: { threshold: 2, totalShares: 5, version: 1, createdAt: '2026-01-01T00:00:00.000Z' },
});
const RECOVERY_KEY = 'recovery-0123456789abcdef0123456789abcdef';

describe('key recovery envelope', () => {
  it('round-trips with the recovery key and rejects another key', async () => {
    const envelope = await encryptKeyRecoveryEnvelope(RECOVERY_KEY, payload);
    expect(envelope.kind).toBe('recovery-key');
    await expect(decryptKeyRecoveryEnvelope(` ${RECOVERY_KEY}\n`, envelope)).resolves.toEqual(payload);
    await expect(decryptKeyRecoveryEnvelope('recovery-other', envelope)).rejects.toThrow(
      'does not open'
    );
  });

  it('cannot be opened with the SHA-256 key hash the server stores', async () => {
    const envelope = await encryptKeyRecoveryEnvelope(RECOVERY_KEY, payload);
    const serverHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RECOVERY_KEY));
    const hashKey = await crypto.subtle.importKey('raw', serverHash, 'AES-GCM', false, ['decrypt']);
    await expect(
      crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: b64ToBytes(envelope.iv) as BufferSource },
        hashKey,
        b64ToBytes(envelope.ciphertext) as BufferSource
      )
    ).rejects.toBeDefined();
  });
});
