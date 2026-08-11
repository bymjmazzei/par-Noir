/** Owner capability identifiers for device policy gates. */
export const DEVICE_CAPABILITIES = {
  recoveryVaultWrite: 'recovery.vault.write',
  recoveryCustodianManage: 'recovery.custodian.manage',
  recoveryInitiate: 'recovery.initiate',
  recoveryRead: 'recovery.read',
  custodianAccept: 'custodian.accept',
  custodianApprove: 'custodian.approve',
  custodiansRead: 'custodians.read',
  identityMigrate: 'identity.migrate',
  identityExport: 'identity.export',
  identityRotate: 'identity.rotate',
  deviceManage: 'device.manage',
  oauthWrite: 'oauth.write',
  profileRead: 'profile.read',
  profileWrite: 'profile.write',
  driveRead: 'drive.read',
  driveUpload: 'drive.upload',
  messagesRead: 'messages.read',
  messagesSend: 'messages.send',
  socialRead: 'social.read',
  socialWrite: 'social.write',
} as const;

export type DeviceCapabilityId = (typeof DEVICE_CAPABILITIES)[keyof typeof DEVICE_CAPABILITIES];

/**
 * Blocked from unkeyed sessions — not editable in UI.
 * `drive.upload` is also listed here so restricted unkeyed cannot opt it back in;
 * Case A (`unkeyed_legacy`) may still allow it via LEGACY_BOOTSTRAP_ALLOWS.
 */
export const IMMUTABLE_UNKEYED_DENY: ReadonlySet<string> = new Set([
  DEVICE_CAPABILITIES.recoveryVaultWrite,
  DEVICE_CAPABILITIES.recoveryCustodianManage,
  DEVICE_CAPABILITIES.identityMigrate,
  DEVICE_CAPABILITIES.identityExport,
  DEVICE_CAPABILITIES.identityRotate,
  DEVICE_CAPABILITIES.deviceManage,
  DEVICE_CAPABILITIES.oauthWrite,
  DEVICE_CAPABILITIES.driveUpload,
  DEVICE_CAPABILITIES.messagesRead,
  DEVICE_CAPABILITIES.messagesSend,
  DEVICE_CAPABILITIES.socialRead,
  DEVICE_CAPABILITIES.socialWrite,
]);

/** Recovery / custodian flows that remain available without a keyed device. */
export const RECOVERY_ALWAYS_UNKEYED: readonly string[] = [
  DEVICE_CAPABILITIES.recoveryInitiate,
  DEVICE_CAPABILITIES.recoveryRead,
  DEVICE_CAPABILITIES.custodianAccept,
  DEVICE_CAPABILITIES.custodianApprove,
];

/**
 * Explicit Case A bootstrap when no device has been keyed yet (`unkeyed_legacy`).
 * Not allow-all: mailbox drain and other high-risk caps are excluded.
 */
export const LEGACY_BOOTSTRAP_ALLOWS: readonly string[] = [
  ...RECOVERY_ALWAYS_UNKEYED,
  DEVICE_CAPABILITIES.profileRead,
  DEVICE_CAPABILITIES.custodiansRead,
  DEVICE_CAPABILITIES.driveRead,
  DEVICE_CAPABILITIES.driveUpload,
];

/**
 * Default allows for unkeyed devices after first device is keyed.
 * Browse/reconnect only — no Drive mutate, mailbox drain, or social write.
 */
export const DEFAULT_UNKEYED_ALLOWS: readonly string[] = [
  ...RECOVERY_ALWAYS_UNKEYED,
  DEVICE_CAPABILITIES.profileRead,
  DEVICE_CAPABILITIES.custodiansRead,
  DEVICE_CAPABILITIES.driveRead,
];

/** Human-readable labels for policy UI toggles (configurable allows only). */
export const CONFIGURABLE_CAPABILITY_LABELS: Record<string, string> = {
  [DEVICE_CAPABILITIES.profileRead]: 'View profile',
  [DEVICE_CAPABILITIES.profileWrite]: 'Edit profile',
  [DEVICE_CAPABILITIES.driveRead]: 'Browse Drive files',
  [DEVICE_CAPABILITIES.custodiansRead]: 'View recovery custodians',
};

export const CONFIGURABLE_CAPABILITIES = Object.keys(CONFIGURABLE_CAPABILITY_LABELS);

/** Caps that must never appear in stored `unkeyedAllows` (immutable or non-configurable). */
export function isAllowedInUnkeyedPolicyList(capability: string): boolean {
  if (IMMUTABLE_UNKEYED_DENY.has(capability)) return false;
  return (CONFIGURABLE_CAPABILITIES as string[]).includes(capability);
}
