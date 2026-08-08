/**
 * Derive ML-KEM secret from the unlocked identity file (for cloud vault seal).
 */

import { unlockIdentityMlKemSecret, type EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { SecureStorage } from '../utils/storage';
import SimpleStorage from '../utils/simpleStorage';

/** Resolve ML-KEM secret key for the active identity (needed to seal vault for OAuth apps). */
export async function resolveIdentityMlKemSecret(opts: {
  identityId: string;
  /** ML-DSA / storage public key when identityId is a pn- identifier */
  publicKey?: string | null;
  pnName: string;
  passcode: string;
}): Promise<string | null> {
  const payloads = await collectEncryptedPayloads(opts.identityId, opts.publicKey);
  for (const payload of payloads) {
    try {
      const secrets = await unlockIdentityMlKemSecret(payload, opts.pnName, opts.passcode);
      if (secrets.mlKemSecretKey) return secrets.mlKemSecretKey;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function collectEncryptedPayloads(
  identityId: string,
  publicKey?: string | null
): Promise<EncryptedIdentityPayload[]> {
  const out: EncryptedIdentityPayload[] = [];
  const seen = new Set<string>();
  const push = (p: EncryptedIdentityPayload | null) => {
    if (!p?.encryptedData || !p.iv || !p.salt) return;
    const key = `${p.salt}:${p.iv}:${p.encryptedData.slice(0, 32)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };

  const keys = [identityId, publicKey].filter((k): k is string => !!k && k.trim().length > 0);

  try {
    const secure = new SecureStorage();
    for (const k of keys) {
      try {
        const secureIdentity = await secure.getIdentity(k);
        if (secureIdentity?.encryptedData && secureIdentity.iv && secureIdentity.salt) {
          push({
            encryptedData: secureIdentity.encryptedData,
            iv: secureIdentity.iv,
            salt: secureIdentity.salt,
            publicKey: secureIdentity.publicKey,
            mlKemPublicKey: (secureIdentity as { mlKemPublicKey?: string }).mlKemPublicKey
          });
        }
      } catch {
        /* continue */
      }
    }
    try {
      const all = await secure.getIdentities();
      for (const id of all || []) {
        if (id?.encryptedData && id.iv && id.salt) {
          push({
            encryptedData: id.encryptedData,
            iv: id.iv,
            salt: id.salt,
            publicKey: id.publicKey,
            mlKemPublicKey: (id as { mlKemPublicKey?: string }).mlKemPublicKey
          });
        }
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }

  try {
    const simple = SimpleStorage.getInstance();
    for (const k of keys) {
      try {
        const simpleIdentity = await simple.getIdentity(k);
        push(normalizeSimpleEncrypted(simpleIdentity));
      } catch {
        /* continue */
      }
    }
    try {
      const all = await simple.getIdentities();
      for (const id of all || []) {
        push(normalizeSimpleEncrypted(id));
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }

  return out;
}

function normalizeSimpleEncrypted(simpleIdentity: unknown): EncryptedIdentityPayload | null {
  if (!simpleIdentity || typeof simpleIdentity !== 'object') return null;
  const row = simpleIdentity as {
    publicKey?: string;
    mlKemPublicKey?: string;
    encryptedData?:
      | string
      | { encryptedData?: string; iv?: string; salt?: string; mlKemPublicKey?: string };
  };
  const enc = row.encryptedData;
  if (enc && typeof enc === 'object' && enc.encryptedData && enc.iv && enc.salt) {
    return {
      encryptedData: enc.encryptedData,
      iv: enc.iv,
      salt: enc.salt,
      publicKey: row.publicKey,
      mlKemPublicKey: enc.mlKemPublicKey || row.mlKemPublicKey
    };
  }
  return null;
}
