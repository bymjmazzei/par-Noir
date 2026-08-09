import { describe, expect, it } from 'vitest';
import {
  isPublicContentRef,
  publicTokenContainsEmbeddedCiphertext,
} from './publicContentRef';

describe('publicContentRef', () => {
  it('accepts a valid ref', () => {
    expect(
      isPublicContentRef({
        backend: 'google_drive',
        objectId: 'abc',
        publicUrl: 'https://drive.google.com/uc?export=download&id=abc&confirm=t',
      })
    ).toBe(true);
  });

  it('rejects non-https urls', () => {
    expect(
      isPublicContentRef({
        backend: 'google_drive',
        objectId: 'abc',
        publicUrl: 'ftp://example.com/x',
      })
    ).toBe(false);
  });
});

describe('publicTokenContainsEmbeddedCiphertext', () => {
  it('detects nested shareEncrypted', () => {
    expect(
      publicTokenContainsEmbeddedCiphertext({
        shareKey: 'abc',
        shareEncrypted: { encrypted: 'AAAA', iv: 'BBBB', salt: 'CCCC' },
      })
    ).toBe(true);
  });

  it('allows slim key-only token', () => {
    expect(
      publicTokenContainsEmbeddedCiphertext({
        shareKey: 'abc',
        fileId: 'x',
        permissions: ['read'],
        expiresAt: new Date().toISOString(),
        contentKey: { encrypted: '', wrappedWith: '', iv: '' },
      })
    ).toBe(false);
  });

  it('detects stringified legacy token', () => {
    expect(
      publicTokenContainsEmbeddedCiphertext(
        JSON.stringify({
          shareKey: 'k',
          shareEncrypted: JSON.stringify({ encrypted: 'e', iv: 'i', salt: 's' }),
        })
      )
    ).toBe(true);
  });
});
