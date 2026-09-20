import { DeviceSessionVault } from './vault.js';
import type { NativeKv, SessionVaultDeps, VerifyBiometric, BiometricAvailability } from './types.js';

/**
 * Build a Cap SecureStoragePlugin-backed NativeKv.
 * Pass the plugin object from `capacitor-secure-storage-plugin`.
 */
export function capacitorSecureStorageKv(plugin: {
  get: (opts: { key: string }) => Promise<{ value: string }>;
  set: (opts: { key: string; value: string }) => Promise<unknown>;
  remove: (opts: { key: string }) => Promise<unknown>;
}): NativeKv {
  return {
    get: async (key) => {
      try {
        const r = await plugin.get({ key });
        return r?.value ?? null;
      } catch {
        return null;
      }
    },
    set: async (key, value) => {
      await plugin.set({ key, value });
    },
    remove: async (key) => {
      try {
        await plugin.remove({ key });
      } catch {
        /* ignore */
      }
    },
  };
}

/** In-memory KV for tests. */
export function memoryKv(): NativeKv {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    remove: async (key) => {
      map.delete(key);
    },
  };
}

export function createDeviceSessionVault(deps: SessionVaultDeps): DeviceSessionVault {
  return new DeviceSessionVault(deps);
}

export type { VerifyBiometric, BiometricAvailability };
