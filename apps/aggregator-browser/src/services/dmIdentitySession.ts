/**
 * Messaging crypto unlock — ML-KEM secret in memory only.
 */

import { unlockIdentityMlKemSecret, type EncryptedIdentityPayload } from '@par-noir/dm-crypto';
import { clearDmSessionCache } from './dmSessionCache';
import { PNOAuthService } from './pnOAuthService';
import { API_ENDPOINT } from '../config/api';

const IDENTITY_STORAGE_KEY = 'pn_encrypted_identity_v1';

export interface DmIdentityState {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
  pnName: string;
}

let state: DmIdentityState | null = null;

export function isDmIdentityReady(): boolean {
  return state !== null;
}

export function getDmIdentity(): DmIdentityState {
  if (!state) {
    throw new Error('Messaging identity not unlocked');
  }
  return state;
}

export function clearDmIdentity(): void {
  state = null;
  clearDmSessionCache();
}

function loadStoredIdentity(): EncryptedIdentityPayload | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EncryptedIdentityPayload;
  } catch {
    return null;
  }
}

/** Call after OAuth if identity blob was stored locally during consent. */
export function storeEncryptedIdentityForMessaging(payload: EncryptedIdentityPayload): void {
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
}

export async function unlockDmIdentity(pnName: string, passcode: string): Promise<DmIdentityState> {
  const payload = loadStoredIdentity();
  if (!payload?.encryptedData || !payload.salt || !payload.iv) {
    throw new Error(
      'No local identity file for messaging unlock. Unlock your pN in the dashboard and sign in again.'
    );
  }
  const secrets = await unlockIdentityMlKemSecret(payload, pnName, passcode);
  state = {
    mlKemSecretKey: secrets.mlKemSecretKey,
    mlKemPublicKey: secrets.mlKemPublicKey,
    pnName: secrets.pnName || pnName
  };
  if (secrets.mlKemPublicKey) {
    void publishMlKemPublicKey(secrets.mlKemPublicKey).catch(() => {});
  }
  return state;
}

async function publishMlKemPublicKey(mlKemPublicKey: string): Promise<void> {
  const session = PNOAuthService.loadSession();
  const pnIdentifier = session?.pnIdentifier;
  if (!pnIdentifier) return;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  await fetch(`${API_ENDPOINT}/api/profile/ml-kem-public-key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userPnIdentifier: pnIdentifier, mlKemPublicKey })
  });
}
