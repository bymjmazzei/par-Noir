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
} as const;

export type DeviceCapabilityId = (typeof DEVICE_CAPABILITIES)[keyof typeof DEVICE_CAPABILITIES];

/** Blocked from unkeyed sessions once first device is keyed — not editable in UI. */
export const IMMUTABLE_UNKEYED_DENY: ReadonlySet<string> = new Set([
  DEVICE_CAPABILITIES.recoveryVaultWrite,
  DEVICE_CAPABILITIES.recoveryCustodianManage,
  DEVICE_CAPABILITIES.identityMigrate,
  DEVICE_CAPABILITIES.identityExport,
  DEVICE_CAPABILITIES.identityRotate,
  DEVICE_CAPABILITIES.deviceManage,
  DEVICE_CAPABILITIES.oauthWrite,
]);

/** Default allows for unkeyed devices after first device is keyed. */
export const DEFAULT_UNKEYED_ALLOWS: readonly string[] = [
  DEVICE_CAPABILITIES.recoveryInitiate,
  DEVICE_CAPABILITIES.recoveryRead,
  DEVICE_CAPABILITIES.custodianAccept,
  DEVICE_CAPABILITIES.custodianApprove,
  DEVICE_CAPABILITIES.profileRead,
  DEVICE_CAPABILITIES.custodiansRead,
];

/** Human-readable labels for policy UI toggles (configurable allows only). */
export const CONFIGURABLE_CAPABILITY_LABELS: Record<string, string> = {
  [DEVICE_CAPABILITIES.profileRead]: 'View profile',
  [DEVICE_CAPABILITIES.profileWrite]: 'Edit profile',
  [DEVICE_CAPABILITIES.driveRead]: 'Browse Drive files',
  [DEVICE_CAPABILITIES.driveUpload]: 'Upload to Drive',
  [DEVICE_CAPABILITIES.messagesRead]: 'Read messages',
  [DEVICE_CAPABILITIES.messagesSend]: 'Send messages',
  [DEVICE_CAPABILITIES.custodiansRead]: 'View recovery custodians',
};

export const CONFIGURABLE_CAPABILITIES = Object.keys(CONFIGURABLE_CAPABILITY_LABELS);
