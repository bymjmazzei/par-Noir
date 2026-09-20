import { sealPayload, unsealPayload } from './seal.js';
import type {
  SealedVaultRecord,
  SessionVaultAppId,
  SessionVaultDeps,
  SessionVaultPayload,
} from './types.js';

const KEY_PREFIX = 'pn_session_vault_v1:';
const DEFAULT_MAX_FAILURES = 5;

export function vaultStorageKey(appId: SessionVaultAppId): string {
  return `${KEY_PREFIX}${appId}`;
}

/**
 * Device session vault: seal post-unlock secrets in Cap Keychain behind biometric.
 * Inject KV + biometric so unit tests stay hermetic.
 */
export class DeviceSessionVault {
  private readonly maxFailures: number;
  /** Apps unlocked or enrolled in this process — allow silent payload refresh. */
  private readonly unlockedThisProcess = new Set<SessionVaultAppId>();

  constructor(private readonly deps: SessionVaultDeps) {
    this.maxFailures = deps.maxFailures ?? DEFAULT_MAX_FAILURES;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Probe KV + biometric; both required for enroll/unlock.
      await this.deps.kv.get('__pn_session_vault_probe__');
      return await this.deps.isBiometricAvailable();
    } catch {
      return false;
    }
  }

  async hasVault(appId: SessionVaultAppId): Promise<boolean> {
    const raw = await this.deps.kv.get(vaultStorageKey(appId));
    return Boolean(raw);
  }

  /**
   * Enroll after a successful unlock in this process.
   * Requires biometric verify first; then writes sealed payload to Keychain.
   */
  async enrollAfterUnlock(
    appId: SessionVaultAppId,
    payload: SessionVaultPayload,
    reason = 'Confirm to stay unlocked on this device'
  ): Promise<void> {
    const ok = await this.deps.verifyBiometric(reason);
    if (!ok) {
      throw new Error('Biometric verification required to enroll session vault');
    }
    const sealed = await sealPayload(payload);
    const record: SealedVaultRecord = {
      v: 1,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      key: sealed.key,
      enrolledAt: new Date().toISOString(),
      failureCount: 0,
    };
    await this.deps.kv.set(vaultStorageKey(appId), JSON.stringify(record));
    this.unlockedThisProcess.add(appId);
  }

  /**
   * Refresh sealed payload without biometric when this process already enrolled or unlocked.
   */
  async updateWhileUnlocked(
    appId: SessionVaultAppId,
    payload: SessionVaultPayload
  ): Promise<void> {
    if (!this.unlockedThisProcess.has(appId)) {
      throw new Error('Session vault not unlocked in this process');
    }
    if (!(await this.hasVault(appId))) {
      throw new Error('No session vault to update');
    }
    const sealed = await sealPayload(payload);
    const record: SealedVaultRecord = {
      v: 1,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      key: sealed.key,
      enrolledAt: new Date().toISOString(),
      failureCount: 0,
    };
    await this.deps.kv.set(vaultStorageKey(appId), JSON.stringify(record));
  }

  /**
   * Cold-start unlock: biometric then unseal.
   * Returns null if no vault. Clears vault after max biometric failures.
   */
  async unlockWithBiometric(
    appId: SessionVaultAppId,
    reason = 'Unlock your par Noir session'
  ): Promise<SessionVaultPayload | null> {
    const key = vaultStorageKey(appId);
    const raw = await this.deps.kv.get(key);
    if (!raw) return null;

    let record: SealedVaultRecord;
    try {
      record = JSON.parse(raw) as SealedVaultRecord;
    } catch {
      await this.deps.kv.remove(key);
      return null;
    }

    const ok = await this.deps.verifyBiometric(reason);
    if (!ok) {
      const next = (record.failureCount ?? 0) + 1;
      if (next >= this.maxFailures) {
        await this.deps.kv.remove(key);
        throw new Error('Too many failed biometric attempts; session vault cleared');
      }
      record.failureCount = next;
      await this.deps.kv.set(key, JSON.stringify(record));
      throw new Error('Biometric verification failed');
    }

    try {
      const payload = await unsealPayload<SessionVaultPayload>({
        ciphertext: record.ciphertext,
        iv: record.iv,
        key: record.key,
      });
      // Reset failure count on success
      if (record.failureCount) {
        record.failureCount = 0;
        await this.deps.kv.set(key, JSON.stringify(record));
      }
      this.unlockedThisProcess.add(appId);
      return payload;
    } catch {
      await this.deps.kv.remove(key);
      throw new Error('Session vault corrupt; cleared');
    }
  }

  /**
   * Read sealed record without biometric — FORBIDDEN for production unlock paths.
   * Exposed only so tests can falsify that unlock always requires biometric.
   * @internal
   */
  async _readRawWithoutBiometric(appId: SessionVaultAppId): Promise<SealedVaultRecord | null> {
    const raw = await this.deps.kv.get(vaultStorageKey(appId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SealedVaultRecord;
    } catch {
      return null;
    }
  }

  async clearVault(appId: SessionVaultAppId): Promise<void> {
    this.unlockedThisProcess.delete(appId);
    await this.deps.kv.remove(vaultStorageKey(appId));
  }
}

/** Unsupported / web stub — all vault ops no-op or false. */
export class UnsupportedSessionVault {
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async hasVault(_appId: SessionVaultAppId): Promise<boolean> {
    return false;
  }
  async enrollAfterUnlock(
    _appId: SessionVaultAppId,
    _payload: SessionVaultPayload
  ): Promise<void> {
    throw new Error('Session vault unsupported on this platform');
  }
  async unlockWithBiometric(_appId: SessionVaultAppId): Promise<SessionVaultPayload | null> {
    return null;
  }
  async clearVault(_appId: SessionVaultAppId): Promise<void> {
    /* no-op */
  }
  async updateWhileUnlocked(
    _appId: SessionVaultAppId,
    _payload: SessionVaultPayload
  ): Promise<void> {
    throw new Error('Session vault unsupported on this platform');
  }
}
