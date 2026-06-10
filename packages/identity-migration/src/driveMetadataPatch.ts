import type { IdentityKeyMaterial } from './types';
import { reencryptDriveFilePackage } from './driveFiles';

export interface ProfileJson {
  identifier?: string;
  mlKemPublicKey?: string;
  displayName?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface CompanionOwner {
  did?: string;
  identifier: string;
}

export interface CompanionMetadataLike {
  owner: CompanionOwner;
  publicToken?: {
    shareEncrypted?: { encrypted: string; iv: string; salt: string };
    shareKey?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function patchProfileJson(
  profile: ProfileJson,
  successorPn: string,
  mlKemPublicKey: string
): ProfileJson {
  return {
    ...profile,
    identifier: successorPn.startsWith('pn-') ? successorPn : `pn-${successorPn}`,
    mlKemPublicKey,
    updatedAt: new Date().toISOString(),
  };
}

export function patchCompanionMetadata<T extends CompanionMetadataLike>(
  companion: T,
  _predecessor: Pick<IdentityKeyMaterial, 'did' | 'publicKey' | 'pnIdentifier'>,
  successor: Pick<IdentityKeyMaterial, 'did' | 'publicKey' | 'pnIdentifier'>
): T {
  const out = {
    ...companion,
    owner: {
      ...companion.owner,
      did: successor.did.startsWith('did:') ? successor.did : `did:key:${successor.publicKey}`,
      identifier: successor.pnIdentifier,
    },
  } as T;
  return out;
}

/** Deep-replace predecessor pn/did strings in JSON-like structures. */
export function replaceIdentityStringsInJson(
  value: unknown,
  predecessorPn: string,
  successorPn: string,
  predecessorDid?: string,
  successorDid?: string
): unknown {
  if (typeof value === 'string') {
    let s = value;
    if (predecessorPn && s.includes(predecessorPn)) {
      s = s.split(predecessorPn).join(successorPn);
    }
    const predShort = predecessorPn.replace(/^pn-/, '');
    const succShort = successorPn.replace(/^pn-/, '');
    if (predShort && s.includes(predShort)) {
      s = s.split(predShort).join(succShort);
    }
    if (predecessorDid && successorDid && s.includes(predecessorDid)) {
      s = s.split(predecessorDid).join(successorDid);
    }
    return s;
  }
  if (Array.isArray(value)) {
    return value.map((v) =>
      replaceIdentityStringsInJson(v, predecessorPn, successorPn, predecessorDid, successorDid)
    );
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceIdentityStringsInJson(v, predecessorPn, successorPn, predecessorDid, successorDid);
    }
    return out;
  }
  return value;
}

export async function patchPublicTokenShareEncrypted(
  token: NonNullable<CompanionMetadataLike['publicToken']>,
  predecessor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>,
  successor: Pick<IdentityKeyMaterial, 'did' | 'publicKey'>
): Promise<NonNullable<CompanionMetadataLike['publicToken']>> {
  if (!token.shareEncrypted?.encrypted || !token.shareEncrypted.iv || !token.shareEncrypted.salt) {
    return token;
  }
  const pkg = {
    encrypted: token.shareEncrypted.encrypted,
    iv: token.shareEncrypted.iv,
    salt: token.shareEncrypted.salt,
  };
  const reencrypted = await reencryptDriveFilePackage(pkg, predecessor, successor);
  return {
    ...token,
    shareEncrypted: {
      encrypted: reencrypted.encrypted,
      iv: reencrypted.iv,
      salt: reencrypted.salt,
    },
  };
}

export function isJsonLikeFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.metadata.json');
}

export function isEncryptedPayloadFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.encrypted');
}

export function isTextPatchableFileName(name: string): boolean {
  return isJsonLikeFileName(name);
}
