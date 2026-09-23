/**
 * Electron safeStorage-backed session vault for Unlock desktop.
 */

import {
  createDeviceSessionVault,
  UnsupportedSessionVault,
  unlockIdentityLabel,
  type DeviceSessionVault,
  type UnlockKeysPayload,
  type UnlockIdentityListing,
  type NativeKv,
} from '@par-noir/device-session-vault';
import type { UnlockDesktopApi } from '../../preload/preload';

const APP_ID = 'unlock' as const;

function desktopApi(): UnlockDesktopApi | null {
  const w = window as Window & { pnUnlockDesktop?: UnlockDesktopApi };
  return w.pnUnlockDesktop ?? null;
}

function desktopKv(api: UnlockDesktopApi): NativeKv {
  return {
    get: (key) => api.vaultGet(key),
    set: (key, value) => api.vaultSet(key, value),
    remove: (key) => api.vaultRemove(key),
  };
}

let vaultSingleton: DeviceSessionVault | UnsupportedSessionVault | null = null;

async function getVault(): Promise<DeviceSessionVault | UnsupportedSessionVault> {
  if (vaultSingleton) return vaultSingleton;
  const api = desktopApi();
  if (!api || !(await api.vaultAvailable())) {
    vaultSingleton = new UnsupportedSessionVault();
    return vaultSingleton;
  }
  vaultSingleton = createDeviceSessionVault({
    kv: desktopKv(api),
    verifyBiometric: async (reason) => api.confirmBiometric(reason),
    isBiometricAvailable: async () => api.vaultAvailable(),
  });
  return vaultSingleton;
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
