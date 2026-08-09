import { validatePublicRowShareFields } from './publicRowGuard';

const validRef = {
  backend: 'google_drive',
  objectId: 'obj-1',
  publicUrl: 'https://drive.google.com/uc?export=download&id=obj-1',
};

const validToken = JSON.stringify({
  fileId: 'thumb.png',
  shareKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  contentKey: { encrypted: '', wrappedWith: '', iv: '' },
  expiresAt: '2027-01-01T00:00:00.000Z',
  permissions: ['read'],
});

describe('validatePublicRowShareFields', () => {
  it('passes private rows even without share fields', () => {
    expect(validatePublicRowShareFields({ isPublic: false })).toBeNull();
    expect(validatePublicRowShareFields({})).toBeNull();
  });

  it('rejects public rows with neither share field', () => {
    const failure = validatePublicRowShareFields({ isPublic: true });
    expect(failure?.error).toBe('missing_public_token');
  });

  it('rejects public rows with publicToken but no publicContentRef', () => {
    const failure = validatePublicRowShareFields({
      isPublic: true,
      publicToken: validToken,
    });
    expect(failure?.error).toBe('missing_public_content_ref');
  });

  it('rejects public rows with publicContentRef but no publicToken', () => {
    const failure = validatePublicRowShareFields({
      isPublic: true,
      publicContentRef: validRef,
    });
    expect(failure?.error).toBe('missing_public_token');
  });

  it('rejects embedded ciphertext publicTokens', () => {
    const failure = validatePublicRowShareFields({
      isPublic: true,
      publicToken: JSON.stringify({
        shareKey: 'k',
        shareEncrypted: { encrypted: 'ciphertext-blob', iv: 'iv' },
      }),
      publicContentRef: validRef,
    });
    expect(failure?.error).toBe('embedded_public_token_forbidden');
  });

  it('passes when both share fields are present', () => {
    expect(
      validatePublicRowShareFields({
        isPublic: true,
        publicToken: validToken,
        publicContentRef: validRef,
      })
    ).toBeNull();
  });
});
