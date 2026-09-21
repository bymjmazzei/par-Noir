/**
 * Electron safeStorage-backed session vault for Unlock desktop.
 */

import {
  createDeviceSessionVault,
  UnsupportedSessionVault,
  type DeviceSessionVault,
  type UnlockKeysPayload,
  type SessionVaultPayload,
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

export async function enrollUnlockSessionVault(payload: UnlockKeysPayload): Promise<void> {
  const v = await getVault();
  await v.enrollAfterUnlock(APP_ID, payload);
}

export async function unlockSessionVault(): Promise<SessionVaultPayload | null> {
  const v = await getVault();
  return v.unlockWithBiometric(APP_ID);
}

export async function clearUnlockSessionVault(): Promise<void> {
  const v = await getVault();
  await v.clearVault(APP_ID);
}
