/**
 * Gate: attached media uploaded under docKey must be DM envelopes, not raw JPEG bytes.
 */

import { describe, it, expect } from 'vitest';
import { encryptMediaBytes, generateChatKey, isDmEnvelope } from '@par-noir/dm-crypto';

/** Minimal JPEG SOI + APP0 marker — must not survive encrypt as plaintext magic. */
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('penAttach encryptMediaBytes path', () => {
  it('after encrypt, payload isDmEnvelope and not JPEG magic', async () => {
    const docKey = generateChatKey();
    const envelope = await encryptMediaBytes(JPEG_MAGIC, docKey);
    expect(isDmEnvelope(envelope)).toBe(true);

    const asBytes = new TextEncoder().encode(envelope);
    expect(asBytes[0]).not.toBe(0xff);
    expect(asBytes[1]).not.toBe(0xd8);
    expect(envelope.startsWith('\xff\xd8')).toBe(false);
  });
});
