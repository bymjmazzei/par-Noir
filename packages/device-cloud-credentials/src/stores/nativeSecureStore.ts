import type { CredentialStore, SealedEnvelope } from '../types.js';

/**
 * Native secure store adapter.
 * Inject Capacitor Preferences / Secure Storage or Electron keychain bridge.
 */
export type NativeKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const KEY_PREFIX = 'pn_device_cloud_creds_v1:';

export class NativeSecureStore implements CredentialStore {
  constructor(private readonly kv: NativeKv) {}

  async get(identityId: string): Promise<SealedEnvelope | null> {
    const raw = await this.kv.get(KEY_PREFIX + identityId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SealedEnvelope;
    } catch {
      return null;
    }
  }

  async set(identityId: string, envelope: SealedEnvelope): Promise<void> {
    // Native: persist across sessions — clear expiresAt
    const persistent: SealedEnvelope = { ...envelope, expiresAt: null };
    await this.kv.set(KEY_PREFIX + identityId, JSON.stringify(persistent));
  }

  async clear(identityId: string): Promise<void> {
    await this.kv.remove(KEY_PREFIX + identityId);
  }
}

/** Electron keytar-style bridge: getPassword / setPassword / deletePassword */
export function keychainKv(opts: {
  service: string;
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
}): NativeKv {
  return {
    get: (key) => opts.getPassword(opts.service, key),
    set: (key, value) => opts.setPassword(opts.service, key, value),
    remove: async (key) => {
      await opts.deletePassword(opts.service, key);
    }
  };
}
