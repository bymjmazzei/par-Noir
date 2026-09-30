export type StorageResolvedAuth = {
  publicKey: string;
  authToken?: string;
};

type UnlockedUser = {
  id?: string;
  publicKey?: string;
  authToken?: string;
} | null | undefined;

/** Public key on a shell or passcode unlock. A passcode is not part of this. */
export function publicKeyFromUnlockedUser(user: UnlockedUser): string | null {
  if (!user) return null;
  if (typeof user.publicKey === 'string' && user.publicKey.length > 0) return user.publicKey;
  if (typeof user.id === 'string' && user.id.startsWith('did:key:')) return user.id;
  return null;
}

/** Storage can encrypt once the unlocked session has a public key. */
export function storageAuthFromUnlockedUser(user: UnlockedUser): StorageResolvedAuth | null {
  const publicKey = publicKeyFromUnlockedUser(user);
  if (!publicKey) return null;
  const authToken = user && typeof user.authToken === 'string' && user.authToken.length > 0
    ? user.authToken
    : undefined;
  return authToken ? { publicKey, authToken } : { publicKey };
}

export function canEncryptUnlockedFiles(user: UnlockedUser, publicKey: string | null): boolean {
  return Boolean(user?.id && publicKey);
}
