import { describe, expect, it } from 'vitest';
import { decryptPublicCiphertext } from './tokenDecryption';
import { sealPublicShareFromBytes, slimPublicTokenJson } from './publicShare';

describe('sealPublicShareFromBytes', () => {
  it('round-trips plaintext and omits ciphertext from the slim token', async () => {
    const plain = new TextEncoder().encode('pen-post');
    const sealed = await sealPublicShareFromBytes({ bytes: plain, title: 'Note' });
    expect(sealed.token.shareKey).toBeTruthy();
    expect(sealed.envelope.encrypted).toBeTruthy();
    const slim = JSON.parse(slimPublicTokenJson(sealed.token)) as { shareEncrypted?: unknown };
    expect(slim.shareEncrypted).toBeUndefined();
    const blob = await decryptPublicCiphertext(sealed.envelope, sealed.token.shareKey!, 'Note');
    const text = await blob.text();
    expect(text).toBe('pen-post');
  });
});
