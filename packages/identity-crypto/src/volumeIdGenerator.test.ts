/**
 * Determinism guarantees for pN identifier derivation.
 *
 * Every API and storage path keys off these identifiers, so the same public key must always
 * derive the same value, and no secret may be an input.
 */
import { describe, expect, it } from 'vitest';
import { VolumeIdGenerator } from './volumeIdGenerator';

const PUBLIC_KEY = 'test-public-key-material';

describe('VolumeIdGenerator', () => {
  it('derives a pn- prefixed 12 hex char id from a public key', async () => {
    const id = await VolumeIdGenerator.generateCanonicalVolumeId(PUBLIC_KEY);

    expect(id).toMatch(/^pn-[0-9a-f]{12}$/);
  });

  it('is deterministic for the same public key', async () => {
    const first = await VolumeIdGenerator.generateCanonicalVolumeId(PUBLIC_KEY);
    const second = await VolumeIdGenerator.generateCanonicalVolumeId(PUBLIC_KEY);

    expect(first).toBe(second);
  });

  it('derives different canonical ids for different public keys', async () => {
    const first = await VolumeIdGenerator.generateCanonicalVolumeId(PUBLIC_KEY);
    const second = await VolumeIdGenerator.generateCanonicalVolumeId(`${PUBLIC_KEY}-other`);

    expect(first).not.toBe(second);
  });

  it('exposes no secret-derived id', () => {
    expect(Object.getOwnPropertyNames(VolumeIdGenerator)).not.toContain('generateVolumeId');
  });
});
