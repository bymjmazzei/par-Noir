/**
 * Import encrypted identity from a pN identity file on device (no OAuth handoff).
 */

import type { EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import {
  storeEncryptedIdentityForMessaging,
  unlockDmIdentity,
} from './dmIdentitySession';

export const PN_SHOW_IDENTITY_IMPORT_EVENT = 'pn_show_identity_import_modal';

type IdentityFileRow = {
  encryptedData?: string;
  encrypted?: string;
  iv?: string;
  salt?: string;
  publicKey?: string;
  mlKemPublicKey?: string;
};

export function normalizeIdentityFileJson(raw: unknown): EncryptedIdentityPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as IdentityFileRow;
  const encryptedData = row.encryptedData ?? row.encrypted;
  if (typeof encryptedData !== 'string' || !row.iv || !row.salt) return null;
  return {
    encryptedData,
    iv: row.iv,
    salt: row.salt,
    publicKey: row.publicKey,
    mlKemPublicKey: row.mlKemPublicKey,
  };
}

export async function readIdentityFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

/** Store encrypted identity and derive ML-KEM session locally. */
export async function importMessagingIdentityFromFile(
  file: File,
  pnName: string,
  passcode: string
): Promise<void> {
  const raw = await readIdentityFile(file);
  const payload = normalizeIdentityFileJson(raw);
  if (!payload) {
    throw new Error('Invalid identity file. Use your .pn.json export from pn.parnoir.com.');
  }
  storeEncryptedIdentityForMessaging(payload);
  await unlockDmIdentity(pnName.trim(), passcode);
}

export function requestMessagingIdentityImport(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PN_SHOW_IDENTITY_IMPORT_EVENT));
  }
}
