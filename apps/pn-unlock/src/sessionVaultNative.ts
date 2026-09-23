/**
 * Capacitor Keychain session vault for the unlock broker.
 */

import { Capacitor } from '@capacitor/core';
import {
  createDeviceSessionVault,
  capacitorSecureStorageKv,
  UnsupportedSessionVault,
  unlockIdentityLabel,
  type DeviceSessionVault,
  type UnlockKeysPayload,
  type UnlockIdentityListing,
} from '@par-noir/device-session-vault';

const APP_ID = 'unlock' as const;

let vaultSingleton: DeviceSessionVault | UnsupportedSessionVault | null = null;

async function getVault(): Promise<DeviceSessionVault | UnsupportedSessionVault> {
  if (vaultSingleton) return vaultSingleton;
  try {
    if (!Capacitor.isNativePlatform()) {
      vaultSingleton = new UnsupportedSessionVault();
      return vaultSingleton;
    }
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    const { NativeBiometric } = await import('@bytetrade/capacitor-native-biometric');
    vaultSingleton = createDeviceSessionVault({
      kv: capacitorSecureStorageKv(SecureStoragePlugin as any),
      verifyBiometric: async (reason) => {
        try {
          await NativeBiometric.verifyIdentity({
            reason,
            title: 'par Noir Unlock',
          });
          return true;
        } catch {
          return false;
        }
      },
      isBiometricAvailable: async () => {
        try {
          const r = await NativeBiometric.isAvailable();
          return !!r.isAvailable;
        } catch {
          return false;
        }
      },
    });
    return vaultSingleton;
  } catch {
    vaultSingleton = new UnsupportedSessionVault();
    return vaultSingleton;
  }
}

export async function isUnlockSessionVaultAvailable(): Promise<boolean> {
  const v = await getVault();
  return v.isAvailable();
}

export async function hasUnlockSessionVault(): Promise<boolean> {
  const v = await getVault();
  return v.hasVault(APP_ID);
}

export async function listUnlockVaultIdentities(): Promise<UnlockIdentityListing[]> {
  const v = await getVault();
  return v.listUnlockIndex();
}

export async function hasUnlockVaultIdentity(identityId: string): Promise<boolean> {
  const v = await getVault();
  return v.hasUnlockIdentity(identityId);
}

export async function enrollUnlockSessionVault(payload: UnlockKeysPayload): Promise<void> {
  if (
    !payload.pnName?.trim() ||
    !payload.passcode?.trim() ||
    !payload.encryptedIdentityJson?.trim()
  ) {
    throw new Error('Vault enroll requires identity file, Key 1, and Key 2');
  }
  const v = await getVault();
  await v.enrollAfterUnlock(APP_ID, payload);
}

/** Biometric once → all enrolled unlock_keys entries (empty array if none). */
export async function unlockSessionVaultEntries(): Promise<UnlockKeysPayload[]> {
  const v = await getVault();
  const payload = await v.unlockWithBiometric(APP_ID);
  if (!payload) return [];
  if (payload.kind === 'unlock_multi') return payload.entries;
  if (payload.kind === 'unlock_keys') return [payload];
  return [];
}

export async function clearUnlockSessionVault(): Promise<void> {
  const v = await getVault();
  await v.clearVault(APP_ID);
}

export { unlockIdentityLabel };
export type { UnlockIdentityListing, UnlockKeysPayload };
