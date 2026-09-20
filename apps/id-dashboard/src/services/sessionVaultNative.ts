/**
 * Capacitor Keychain session vault for id-dashboard.
 */

import { Capacitor } from '@capacitor/core';
import {
  createDeviceSessionVault,
  capacitorSecureStorageKv,
  UnsupportedSessionVault,
  type DeviceSessionVault,
  type DashboardKeysPayload,
  type SessionVaultPayload,
} from '@par-noir/device-session-vault';

const APP_ID = 'dashboard' as const;

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
            title: 'par Noir',
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

export async function isDashboardSessionVaultAvailable(): Promise<boolean> {
  const v = await getVault();
  return v.isAvailable();
}

export async function hasDashboardSessionVault(): Promise<boolean> {
  const v = await getVault();
  return v.hasVault(APP_ID);
}

export async function enrollDashboardSessionVault(payload: DashboardKeysPayload): Promise<void> {
  const v = await getVault();
  await v.enrollAfterUnlock(APP_ID, payload);
}

export async function unlockDashboardSessionVault(): Promise<SessionVaultPayload | null> {
  const v = await getVault();
  return v.unlockWithBiometric(APP_ID);
}

export async function clearDashboardSessionVault(): Promise<void> {
  const v = await getVault();
  await v.clearVault(APP_ID);
}
