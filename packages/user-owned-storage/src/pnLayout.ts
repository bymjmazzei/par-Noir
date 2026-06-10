/**
 * Canonical logical paths for user-owned pN storage (provider-agnostic).
 * Mirrors GOOGLE_DRIVE_STRUCTURE.md layout.
 */

export const METADATA_DIR = '_metadata';
export const INTEGRATORS_DIR = 'integrators';
export const MESSAGES_DIR = 'par-noir-messages';
export const ATTACHMENTS_DIR = 'attachments';

export const CONTENT_CLASSES = ['media', 'thoughts', 'collections'] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

/** Root folder name: `par-noir-{pnIdentifier}` */
export function pnRootFolderName(pnIdentifier: string): string {
  const id = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return `par-noir-${id}`;
}

/** Legacy Google Drive display name (for backward compatibility during migration) */
export function pnDriveDisplayName(pnIdentifier: string): string {
  const id = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return `par Noir - ${id}`;
}

export function metadataPath(...segments: string[]): string {
  return [METADATA_DIR, ...segments].join('/');
}

export function integratorPath(clientId: string, ...segments: string[]): string {
  return [INTEGRATORS_DIR, clientId, ...segments].join('/');
}

export function messagesPath(...segments: string[]): string {
  return [MESSAGES_DIR, ...segments].join('/');
}

/** Portable SQLite table file path */
export function portableTablePath(logicalPath: string): string {
  return `${logicalPath}.db`;
}

/** Portable JSON snapshot path */
export function portableSnapshotPath(logicalPath: string): string {
  return `${logicalPath}.json`;
}

/** Per-conversation message log */
export function conversationLogPath(otherPn: string): string {
  const id = otherPn.startsWith('pn-') ? otherPn : `pn-${otherPn}`;
  return messagesPath(`conversation-${id}.jsonl`);
}

/** Known metadata table logical paths */
export const TABLE_PATHS = {
  connections: metadataPath('connections'),
  followers: metadataPath('followers'),
  following: metadataPath('following'),
  notifications: metadataPath('notifications'),
  activityLedger: metadataPath('activity_ledger'),
  engagement: metadataPath('engagement'),
  messagingLedger: metadataPath('messaging_ledger'),
  prismLedger: metadataPath('prism_ledger'),
  preferences: metadataPath('preferences'),
  zkpDataPoints: metadataPath('zkp-data-points'),
  thirdPartyPermissions: metadataPath('third-party-permissions'),
  publicFileIndex: metadataPath('public-file-index'),
  ownerFileIndex: metadataPath('owner-file-index'),
  groups: metadataPath('groups'),
  devices: metadataPath('devices'),
  recovery: metadataPath('recovery'),
  messageRequests: metadataPath('message_requests'),
  dataPointRequests: metadataPath('data-point-requests')
} as const;

export const JSON_BLOB_PATHS = {
  profile: metadataPath('profile.json'),
  preferences: metadataPath('preferences.json'),
  devicePolicy: metadataPath('device-policy.json'),
  migrationManifest: integratorPath('_pn_migration_manifest.json')
} as const;

export function contentClassIndexPath(
  contentClass: ContentClass,
  indexType: 'public' | 'owner'
): string {
  return metadataPath(contentClass, `${contentClass}-${indexType}-index`);
}

/** Encrypted media blob path under content class folder */
export function encryptedMediaPath(contentClass: ContentClass, fileId: string): string {
  return metadataPath(contentClass, `${fileId}.encrypted`);
}

/** Companion metadata JSON beside encrypted blob */
export function companionMetadataPath(contentClass: ContentClass, fileId: string): string {
  return metadataPath(contentClass, `${fileId}.metadata.json`);
}

export interface FileStorageRef {
  backend: string;
  backendFileId: string;
  backendAccountId?: string;
  contentClass?: ContentClass;
}

export function fileRef(
  backend: string,
  backendFileId: string,
  opts?: { backendAccountId?: string; contentClass?: ContentClass }
): FileStorageRef {
  return {
    backend,
    backendFileId,
    backendAccountId: opts?.backendAccountId,
    contentClass: opts?.contentClass
  };
}
