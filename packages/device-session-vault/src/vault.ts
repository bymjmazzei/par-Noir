import { sealPayload, unsealPayload } from './seal.js';
import type {
  SealedVaultRecord,
  SessionVaultAppId,
  SessionVaultDeps,
  SessionVaultPayload,
  UnlockIdentityListing,
  UnlockKeysPayload,
  UnlockMultiPayload,
} from './types.js';

const KEY_PREFIX = 'pn_session_vault_v1:';
const DEFAULT_MAX_FAILURES = 5;

export function vaultStorageKey(appId: SessionVaultAppId): string {
  return `${KEY_PREFIX}${appId}`;
}

/** Plaintext index for unlock multi-pN (no secrets). */
export function unlockVaultIndexKey(): string {
  return `${KEY_PREFIX}unlock:index`;
}

type UnlockVaultIndex = {
  v: 1;
  identities: UnlockIdentityListing[];
};

function listingFromEntry(entry: UnlockKeysPayload): UnlockIdentityListing {
  return {
    identityId: entry.identityId,
    publicKey: entry.publicKey,
    ...(entry.nickname?.trim() ? { nickname: entry.nickname.trim() } : {}),
  };
}

function syncIndexFromEntries(entries: UnlockKeysPayload[]): UnlockVaultIndex {
  return {
    v: 1,
    identities: entries.map(listingFromEntry),
  };
}

function normalizeUnlockEntries(payload: SessionVaultPayload): UnlockKeysPayload[] | null {
  if (payload.kind === 'unlock_multi') {
    return Array.isArray(payload.entries) ? payload.entries : [];
  }
  if (payload.kind === 'unlock_keys') {
    return [payload];
  }
  return null;
}

/**
 * Device session vault: seal post-unlock secrets in Cap Keychain behind biometric.
 * Inject KV + biometric so unit tests stay hermetic.
 *
 * App `unlock` stores an `unlock_multi` seal (one or more pNs) plus a plaintext index.
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
      await this.deps.kv.get('__pn_session_vault_probe__');
      return await this.deps.isBiometricAvailable();
    } catch {
      return false;
    }
  }

  async hasVault(appId: SessionVaultAppId): Promise<boolean> {
    const raw = await this.deps.kv.get(vaultStorageKey(appId));
    if (raw) return true;
    if (appId === 'unlock') {
      const index = await this.listUnlockIndex();
      return index.length > 0;
    }
    return false;
  }

  /** Non-secret enrolled unlock identities (no biometric). */
  async listUnlockIndex(): Promise<UnlockIdentityListing[]> {
    try {
      const raw = await this.deps.kv.get(unlockVaultIndexKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw) as UnlockVaultIndex;
      if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.identities)) return [];
      return parsed.identities.filter((i) => i && typeof i.identityId === 'string');
    } catch {
      return [];
    }
  }

  async hasUnlockIdentity(identityId: string): Promise<boolean> {
    if (!identityId) return false;
    const index = await this.listUnlockIndex();
    return index.some((i) => i.identityId === identityId);
  }

  /**
   * Enroll after a successful unlock in this process.
   * Requires biometric verify first; then writes sealed payload to Keychain.
   * For `unlock` + `unlock_keys`, merges into `unlock_multi` by identityId.
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

    if (appId === 'unlock' && payload.kind === 'unlock_keys') {
      await this.writeUnlockMultiMerged(payload);
      this.unlockedThisProcess.add(appId);
      return;
    }
    if (appId === 'unlock' && payload.kind === 'unlock_multi') {
      await this.writeSealed(appId, payload);
      await this.writeUnlockIndex(syncIndexFromEntries(payload.entries));
      this.unlockedThisProcess.add(appId);
      return;
    }

    await this.writeSealed(appId, payload);
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
    if (appId === 'unlock' && payload.kind === 'unlock_keys') {
      await this.writeUnlockMultiMerged(payload);
      return;
    }
    if (appId === 'unlock' && payload.kind === 'unlock_multi') {
      await this.writeSealed(appId, payload);
      await this.writeUnlockIndex(syncIndexFromEntries(payload.entries));
      return;
    }
    await this.writeSealed(appId, payload);
  }

  /**
   * Cold-start unlock: biometric then unseal.
   * For `unlock`, always returns `unlock_multi` (migrates legacy single `unlock_keys`).
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
      if (appId === 'unlock') await this.deps.kv.remove(unlockVaultIndexKey());
      return null;
    }

    const ok = await this.deps.verifyBiometric(reason);
    if (!ok) {
      const next = (record.failureCount ?? 0) + 1;
      if (next >= this.maxFailures) {
        await this.clearVault(appId);
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
      if (record.failureCount) {
        record.failureCount = 0;
        await this.deps.kv.set(key, JSON.stringify(record));
      }
      this.unlockedThisProcess.add(appId);

      if (appId === 'unlock') {
        const entries = normalizeUnlockEntries(payload);
        if (!entries || entries.length === 0) {
          await this.clearVault(appId);
          return null;
        }
        const multi: UnlockMultiPayload = { kind: 'unlock_multi', entries };
        // Migrate legacy single unlock_keys seal + refresh plaintext index.
        if (payload.kind === 'unlock_keys') {
          await this.writeSealed(appId, multi);
        }
        await this.writeUnlockIndex(syncIndexFromEntries(entries));
        return multi;
      }

      return payload;
    } catch {
      await this.clearVault(appId);
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
    if (appId === 'unlock') {
      await this.deps.kv.remove(unlockVaultIndexKey());
    }
  }

  private async writeUnlockIndex(index: UnlockVaultIndex): Promise<void> {
    await this.deps.kv.set(unlockVaultIndexKey(), JSON.stringify(index));
  }

  private async writeSealed(appId: SessionVaultAppId, payload: SessionVaultPayload): Promise<void> {
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

  /** After biometric already verified: merge unlock_keys into unlock_multi seal + index. */
  private async writeUnlockMultiMerged(entry: UnlockKeysPayload): Promise<void> {
    if (
      !entry.pnName?.trim() ||
      !entry.passcode?.trim() ||
      !entry.encryptedIdentityJson?.trim()
    ) {
      throw new Error('Vault enroll requires identity file, Key 1, and Key 2');
    }

    let entries: UnlockKeysPayload[] = [];
    const key = vaultStorageKey('unlock');
    const raw = await this.deps.kv.get(key);
    if (raw) {
      try {
        const record = JSON.parse(raw) as SealedVaultRecord;
        const existing = await unsealPayload<SessionVaultPayload>({
          ciphertext: record.ciphertext,
          iv: record.iv,
          key: record.key,
        });
        entries = normalizeUnlockEntries(existing) ?? [];
      } catch {
        entries = [];
      }
    }

    const next = { ...entry, kind: 'unlock_keys' as const };
    const idx = entries.findIndex(
      (e) => e.identityId === next.identityId || e.publicKey === next.publicKey
    );
    if (idx >= 0) entries[idx] = next;
    else entries.push(next);

    const multi: UnlockMultiPayload = { kind: 'unlock_multi', entries };
    await this.writeSealed('unlock', multi);
    await this.writeUnlockIndex(syncIndexFromEntries(entries));
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
  async listUnlockIndex(): Promise<UnlockIdentityListing[]> {
    return [];
  }
  async hasUnlockIdentity(_identityId: string): Promise<boolean> {
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
