import type { CredentialStore, SealedEnvelope } from '../types.js';

const KEY_PREFIX = 'pn_device_cloud_creds_v1:';

/**
 * Web sealed store — localStorage by default. Pair with grace TTL on seal.
 */
export class WebSealedStore implements CredentialStore {
  constructor(private readonly storage: Storage = globalThis.localStorage) {}

  async get(identityId: string): Promise<SealedEnvelope | null> {
    const raw = this.storage.getItem(KEY_PREFIX + identityId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SealedEnvelope;
      if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
        await this.clear(identityId);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async set(identityId: string, envelope: SealedEnvelope): Promise<void> {
    this.storage.setItem(KEY_PREFIX + identityId, JSON.stringify(envelope));
  }

  async clear(identityId: string): Promise<void> {
    this.storage.removeItem(KEY_PREFIX + identityId);
  }
}
