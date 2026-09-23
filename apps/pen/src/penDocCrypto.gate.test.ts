/**
 * Gate: Pen cloud section payloads must be DM envelopes under docKey, not plaintext JSON.
 */

import { describe, it, expect } from 'vitest';
import { generateChatKey, isDmEnvelope } from '@par-noir/dm-crypto';
import {
  encryptSectionJson,
  decryptSectionPayload,
  sectionsToWireCipherMap,
  wireB64ToEnvelope
} from './services/penDocCrypto';
import type { PenSectionContent } from '@par-noir/pen-protocol';

const sample: PenSectionContent = {
  slug: 'body',
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'secret' }] }] }
};

describe('penDocCrypto', () => {
  it('encrypts to a DM envelope that is not parseable TipTap JSON', async () => {
    const key = generateChatKey();
    const envelope = await encryptSectionJson(sample, key);
    expect(isDmEnvelope(envelope)).toBe(true);
    expect(() => JSON.parse(envelope)).toThrow();
    const round = await decryptSectionPayload(envelope, key);
    expect(round.slug).toBe('body');
    expect(JSON.stringify(round.doc)).toContain('secret');
  });

  it('lazy-migrates legacy plaintext JSON without a key', async () => {
    const legacy = JSON.stringify(sample);
    const parsed = await decryptSectionPayload(legacy, null);
    expect(parsed.slug).toBe('body');
  });

  it('wire map round-trips through base64 transport', async () => {
    const key = generateChatKey();
    const map = await sectionsToWireCipherMap([sample], key);
    const envelope = wireB64ToEnvelope(map.body!);
    expect(isDmEnvelope(envelope)).toBe(true);
    const round = await decryptSectionPayload(envelope, key);
    expect(round.slug).toBe('body');
  });

  it('falsifies plaintext b64Json-as-ciphertext naming', async () => {
    const fake = btoa(JSON.stringify(sample));
    expect(isDmEnvelope(fake)).toBe(false);
    // Legacy path may still parse base64(JSON) — that is migrate-on-read, not "encrypted"
    const parsed = await decryptSectionPayload(fake, null);
    expect(parsed.slug).toBe('body');
  });
});
