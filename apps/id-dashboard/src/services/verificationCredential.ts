/**
 * Keeps the pN's held verification credential and the API's verified flag in step. The server
 * holds no identity data, so the credential in the pN's own Knowledge docs is the record.
 */

import { MonetizationService } from './monetization/MonetizationService';
import {
  findHeldVerificationCredential,
  saveVerificationCredential,
  type AttestationKeys,
} from './knowledgeAttestation';

/** `sub` of a JWT without verifying it (the API verifies; this only routes present vs reissue). */
export function credentialSubject(jwt: string): string | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/**
 * A predecessor's credential (after identity re-key) is exchanged for one issued to this pN;
 * otherwise a held credential restores a missing server flag. Returns true when the flag changed.
 */
export async function syncHeldVerificationCredential(params: {
  keys: AttestationKeys;
  authToken: string;
  serverVerified: boolean;
}): Promise<boolean> {
  const { keys, authToken, serverVerified } = params;
  const held = await findHeldVerificationCredential(keys.pnIdentifier, authToken);
  if (!held) return false;
  if (credentialSubject(held) !== keys.pnIdentifier) {
    const next = await MonetizationService.reissueVerificationCredential(authToken, held);
    await saveVerificationCredential({ keys, authToken, credential: next.credential, expiresAt: next.expiresAt });
    return !serverVerified;
  }
  if (serverVerified) return false;
  await MonetizationService.presentVerificationCredential(authToken, held);
  return true;
}
