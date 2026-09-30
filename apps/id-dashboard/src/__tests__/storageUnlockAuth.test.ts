import {
  canEncryptUnlockedFiles,
  storageAuthFromUnlockedUser,
} from '../services/storageUnlockAuth';

test('shell unlock resolves storage auth from the public key without a passcode', () => {
  const auth = storageAuthFromUnlockedUser({
    id: 'did:key:z6Mkexample',
    publicKey: 'mlkem-public-key',
    authToken: 'api-token',
  });
  expect(auth).toEqual({ publicKey: 'mlkem-public-key', authToken: 'api-token' });
  expect(auth).not.toHaveProperty('passcode');
  expect(canEncryptUnlockedFiles({ id: 'did:key:z6Mkexample' }, auth?.publicKey ?? null)).toBe(true);
});

test('a locked session cannot encrypt', () => {
  expect(storageAuthFromUnlockedUser(null)).toBeNull();
  expect(canEncryptUnlockedFiles(null, null)).toBe(false);
  expect(canEncryptUnlockedFiles({ id: 'did:key:z6Mkexample' }, null)).toBe(false);
});
