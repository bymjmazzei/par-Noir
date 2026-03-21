/**
 * Secure storage adapter for sensitive data (tokens, session).
 * Uses Keychain/Keystore on native (capacitor-secure-storage-plugin), localStorage on web.
 */

import { Capacitor } from '@capacitor/core';

const MIGRATION_KEY = '_secure_storage_migrated';

async function getNativeStorage(): Promise<{
  get: (opts: { key: string }) => Promise<{ value: string }>;
  set: (opts: { key: string; value: string }) => Promise<{ value: boolean }>;
  remove: (opts: { key: string }) => Promise<{ value: boolean }>;
}> {
  const mod = await import('capacitor-secure-storage-plugin');
  return (mod.SecureStoragePlugin || mod.default || mod) as any;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const storage = await getNativeStorage();
        const result = await storage.get({ key });
        return result?.value ?? null;
      } catch {
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const storage = await getNativeStorage();
        await storage.set({ key, value });
      } catch (e) {
        console.warn('[SecureStorage] setItem failed:', e);
      }
    } else {
      localStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const storage = await getNativeStorage();
        await storage.remove({ key });
      } catch {
        // Ignore
      }
    } else {
      localStorage.removeItem(key);
    }
  },

  async migrateFromLocalStorage(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const migrated = localStorage.getItem(`${MIGRATION_KEY}_${key}`);
    if (migrated) return; // Already migrated
    const value = localStorage.getItem(key);
    if (value) {
      try {
        await this.setItem(key, value);
        localStorage.removeItem(key);
        localStorage.setItem(`${MIGRATION_KEY}_${key}`, '1');
      } catch (e) {
        console.warn('[SecureStorage] Migration failed for', key, e);
      }
    }
  }
};
