import { hkdfSha3_384 } from './hkdf.js';
import { aesGcmEncrypt, aesGcmDecrypt } from './aes.js';
import { base64ToBytes, bytesToBase64, utf8ToBytes } from './encoding.js';
import { openDmSession } from './session.js';

/** Wrap key for acceptor-side messageRootKey persistence on user Drive. */
export function deriveDmSessionWrapKey(
  mlKemSecretKeyB64: string,
  connectionId: string
): Uint8Array {
  const ikm = base64ToBytes(mlKemSecretKeyB64);
  return hkdfSha3_384(ikm, `par-noir-dm-session-wrap-v1:${connectionId}`, utf8ToBytes('acceptor'));
}

export async function wrapMessageRootKey(
  messageRootKeyB64: string,
  mlKemSecretKeyB64: string,
  connectionId: string
): Promise<string> {
  const wrapKey = deriveDmSessionWrapKey(mlKemSecretKeyB64, connectionId);
  return aesGcmEncrypt(base64ToBytes(messageRootKeyB64), wrapKey);
}

export async function unwrapMessageRootKey(
  wrappedB64: string,
  mlKemSecretKeyB64: string,
  connectionId: string
): Promise<string> {
  const wrapKey = deriveDmSessionWrapKey(mlKemSecretKeyB64, connectionId);
  const raw = await aesGcmDecrypt(wrappedB64, wrapKey);
  return bytesToBase64(raw);
}

export interface ResolveMessageRootKeyOpts {
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  legacyRoot?: string;
}

/**
 * Recover messageRootKey from Drive-stored blobs + unlocked ML-KEM secret.
 * Acceptor: unwrap(wrappedMessageRootKey). Requester: openDmSession(kemCiphertext).
 * Wrapped is tried first when present — KEM decaps to the wrong party yields garbage without throwing.
 */
export async function resolveMessageRootKey(
  connectionId: string,
  mlKemSecretKey: string,
  opts: ResolveMessageRootKeyOpts
): Promise<string> {
  const wrapped = opts.wrappedMessageRootKey?.trim();
  if (wrapped) {
    try {
      return await unwrapMessageRootKey(wrapped, mlKemSecretKey, connectionId);
    } catch {
      /* try kem path */
    }
  }

  const kem = opts.kemCiphertext?.trim();
  if (kem) {
    return openDmSession(kem, mlKemSecretKey);
  }

  if (opts.legacyRoot?.trim()) {
    return opts.legacyRoot;
  }

  throw new Error('Missing KEM session data for this conversation');
}
