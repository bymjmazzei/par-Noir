/** Capacitor / Keychain app ids for session vault namespacing. */
export type SessionVaultAppId = 'dashboard' | 'browse' | 'messaging' | 'prism' | 'unlock';

export type NativeKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

export type VerifyBiometric = (reason: string) => Promise<boolean>;

export type BiometricAvailability = () => Promise<boolean>;

export type DashboardKeysPayload = {
  kind: 'dashboard_keys';
  identityId: string;
  publicKey: string;
  pnName: string;
  passcode: string;
  nickname?: string;
};

/** Unlock broker: sealed factors for biometric re-open of ConsentUnlock. */
export type UnlockKeysPayload = {
  kind: 'unlock_keys';
  identityId: string;
  publicKey: string;
  /** Knowledge key 1 (pn name). */
  pnName: string;
  /** Knowledge key 2 (passcode). */
  passcode: string;
  /** Opaque encrypted identity JSON (.pn file contents) for re-mint without re-upload. */
  encryptedIdentityJson: string;
  /** Optional display nickname (never Key 1). */
  nickname?: string;
};

/**
 * Multi-pN unlock vault: one biometric gate, then pick among entries.
 * Stored under app id `unlock` (replaces a lone `unlock_keys` seal).
 */
export type UnlockMultiPayload = {
  kind: 'unlock_multi';
  entries: UnlockKeysPayload[];
};

/** Non-secret listing for enroll checks / picker labels (no Key 1 / Key 2 / file). */
export type UnlockIdentityListing = {
  identityId: string;
  publicKey: string;
  nickname?: string;
};

export type BrowseOauthPayload = {
  kind: 'browse_oauth';
  /** Serialized OAuth session JSON (opaque to the vault). */
  oauthSessionJson: string;
};

export type MessagingSessionPayload = {
  kind: 'messaging_session';
  oauthSessionJson: string;
  /** Serialized DM crypto session JSON, if present. */
  dmSessionJson?: string | null;
};

export type PrismSessionPayload = {
  kind: 'prism_session';
  sessionJson: string;
};

export type SessionVaultPayload =
  | DashboardKeysPayload
  | UnlockKeysPayload
  | UnlockMultiPayload
  | BrowseOauthPayload
  | MessagingSessionPayload
  | PrismSessionPayload;

export type SessionVaultDeps = {
  kv: NativeKv;
  verifyBiometric: VerifyBiometric;
  isBiometricAvailable: BiometricAvailability;
  /** Max failed biometric attempts before vault is cleared. Default 5. */
  maxFailures?: number;
};

export type SealedVaultRecord = {
  v: 1;
  /** Base64 AES-GCM ciphertext of JSON payload. */
  ciphertext: string;
  iv: string;
  /** Base64 raw AES-256 key — stored only in Cap secure storage (OS Keychain). */
  key: string;
  enrolledAt: string;
  failureCount: number;
};

/** Safe picker label — never Key 1 / passcode. */
export function unlockIdentityLabel(id: UnlockIdentityListing): string {
  const nick = id.nickname?.trim();
  if (nick) return nick;
  const pk = (id.publicKey || id.identityId || '').trim();
  if (!pk) return 'Saved pN';
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
}
