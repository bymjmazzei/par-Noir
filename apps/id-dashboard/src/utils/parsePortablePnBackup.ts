import type { EncryptedIdentity } from './crypto';

type PortablePnRoot = {
  identities?: EncryptedIdentity[];
  encryptedData?: string;
  iv?: string;
  salt?: string;
};

function assertEncryptedIdentity(identity: EncryptedIdentity): EncryptedIdentity {
  if (!identity?.encryptedData || !identity?.iv || !identity?.salt) {
    throw new Error('Invalid pN file: missing encrypted payload');
  }
  return identity;
}

/**
 * Resolve the encrypted identity record from a portable .pn backup (upload or download).
 */
export function parsePortablePnBackup(parsed: unknown): EncryptedIdentity {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid pN file format');
  }

  const root = parsed as PortablePnRoot;

  if (Array.isArray(root.identities)) {
    if (root.identities.length === 0) {
      throw new Error('Invalid pN file: no identities found');
    }
    if (root.identities.length > 1) {
      throw new Error(
        'Invalid pN file: Multiple identities found. Each pN file should contain only one identity.'
      );
    }
    return assertEncryptedIdentity(root.identities[0]);
  }

  if (root.encryptedData && root.iv && root.salt) {
    return assertEncryptedIdentity(root as EncryptedIdentity);
  }

  throw new Error('Invalid pN file format');
}
