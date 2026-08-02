/**
 * Determinism guarantees for pN identifier derivation.
 *
 * Every API and storage path keys off these identifiers, so the same credentials must
 * always derive the same value and the canonical form must stay passcode-independent.
 */
import { describe, expect, it } from 'vitest';
import { VolumeIdGenerator } from './volumeIdGenerator';

const PUBLIC_KEY = 'test-public-key-material';
const PN_NAME = 'test-pn-name';
const PASSCODE = 'test-passcode';

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

  it('canonical id does not depend on pn name or passcode', async () => {
    const canonical = await VolumeIdGenerator.generateCanonicalVolumeId(PUBLIC_KEY);
    const legacy = await VolumeIdGenerator.generateVolumeId({
      pnName: PN_NAME,
      passcode: PASSCODE,
      publicKey: PUBLIC_KEY,
    });

    expect(canonical).not.toBe(legacy);
  });

  it('legacy id is deterministic across all three factors', async () => {
    const params = { pnName: PN_NAME, passcode: PASSCODE, publicKey: PUBLIC_KEY };

    expect(await VolumeIdGenerator.generateVolumeId(params)).toBe(
      await VolumeIdGenerator.generateVolumeId({ ...params })
    );
  });

  it('legacy id changes when any single factor changes', async () => {
    const base = await VolumeIdGenerator.generateVolumeId({
      pnName: PN_NAME,
      passcode: PASSCODE,
      publicKey: PUBLIC_KEY,
    });

    const differentName = await VolumeIdGenerator.generateVolumeId({
      pnName: `${PN_NAME}-x`,
      passcode: PASSCODE,
      publicKey: PUBLIC_KEY,
    });
    const differentPasscode = await VolumeIdGenerator.generateVolumeId({
      pnName: PN_NAME,
      passcode: `${PASSCODE}-x`,
      publicKey: PUBLIC_KEY,
    });
    const differentKey = await VolumeIdGenerator.generateVolumeId({
      pnName: PN_NAME,
      passcode: PASSCODE,
      publicKey: `${PUBLIC_KEY}-x`,
    });

    expect(new Set([base, differentName, differentPasscode, differentKey]).size).toBe(4);
  });
});
