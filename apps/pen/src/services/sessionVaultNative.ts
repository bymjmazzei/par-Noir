/**
 * Cap / Electron session vault for Pen (OAuth session + durable docKeys).
 */

import {
  createDeviceSessionVault,
  capacitorSecureStorageKv,
  UnsupportedSessionVault,
  type DeviceSessionVault,
  type PenSessionPayload,
  type SessionVaultPayload,
  type NativeKv
} from '@par-noir/device-session-vault';
import { isCapacitorNative, isPenDesktop } from './penPlatform';
import { loadDocKey, saveDocKey } from './penDocCrypto';

const APP_ID = 'pen' as const;

let vaultSingleton: DeviceSessionVault | UnsupportedSessionVault | null = null;

type PenDesktopApi = {
  vaultAvailable: () => Promise<boolean>;
  vaultGet: (key: string) => Promise<string | null>;
  vaultSet: (key: string, value: string) => Promise<void>;
  vaultRemove: (key: string) => Promise<void>;
  confirmBiometric: (reason: string) => Promise<boolean>;
};

function desktopApi(): PenDesktopApi | null {
  return (window as Window & { penDesktop?: PenDesktopApi }).penDesktop ?? null;
}

function desktopKv(api: PenDesktopApi): NativeKv {
  return {
    get: (key) => api.vaultGet(key),
    set: (key, value) => api.vaultSet(key, value),
    remove: (key) => api.vaultRemove(key)
  };
}

async function getVault(): Promise<DeviceSessionVault | UnsupportedSessionVault> {
  if (vaultSingleton) return vaultSingleton;
  try {
    if (isPenDesktop()) {
      const api = desktopApi();
      if (!api || !(await api.vaultAvailable())) {
        vaultSingleton = new UnsupportedSessionVault();
        return vaultSingleton;
      }
      vaultSingleton = createDeviceSessionVault({
        kv: desktopKv(api),
        verifyBiometric: (reason) => api.confirmBiometric(reason),
        isBiometricAvailable: () => api.vaultAvailable()
      });
      return vaultSingleton;
    }
    if (!isCapacitorNative()) {
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
            title: 'par Noir Pen'
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
      }
    });
    return vaultSingleton;
  } catch {
    vaultSingleton = new UnsupportedSessionVault();
    return vaultSingleton;
  }
}

export async function isPenSessionVaultAvailable(): Promise<boolean> {
  const v = await getVault();
  return v.isAvailable();
}

export async function hasPenSessionVault(): Promise<boolean> {
  const v = await getVault();
  return v.hasVault(APP_ID);
}

export async function enrollPenSessionVault(
  oauthSessionJson: string,
  docKeys?: Record<string, string>
): Promise<void> {
  const v = await getVault();
  const payload: PenSessionPayload = {
    kind: 'pen_session',
    oauthSessionJson,
    ...(docKeys && Object.keys(docKeys).length ? { docKeys } : {})
  };
  await v.enrollAfterUnlock(APP_ID, payload);
}

export async function updatePenSessionVault(
  oauthSessionJson: string,
  docKeys?: Record<string, string>
): Promise<void> {
  const v = await getVault();
  if (!(await v.hasVault(APP_ID))) {
    await enrollPenSessionVault(oauthSessionJson, docKeys);
    return;
  }
  const payload: PenSessionPayload = {
    kind: 'pen_session',
    oauthSessionJson,
    ...(docKeys && Object.keys(docKeys).length ? { docKeys } : {})
  };
  await v.updateWhileUnlocked(APP_ID, payload);
}

export async function unlockPenSessionVault(): Promise<SessionVaultPayload | null> {
  const v = await getVault();
  return v.unlockWithBiometric(APP_ID);
}

export async function clearPenSessionVault(): Promise<void> {
  const v = await getVault();
  await v.clearVault(APP_ID);
}

/** Merge sessionStorage docKeys into vault payload after unlock/enroll. */
export function collectSessionDocKeys(docIds: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of docIds) {
    const k = loadDocKey(id);
    if (k) out[id] = k;
  }
  return out;
}

export function restoreDocKeysFromVault(docKeys?: Record<string, string>): void {
  if (!docKeys) return;
  for (const [docId, key] of Object.entries(docKeys)) {
    if (docId && key) saveDocKey(docId, key);
  }
}
