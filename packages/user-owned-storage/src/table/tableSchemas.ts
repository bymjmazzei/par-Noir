/** Portable table schemas shared by the device and the API. */
import { TABLE_PATHS, messagesPath, metadataPath } from '../pnLayout.js';
import type { TableSchema } from '../types.js';

export const THIRD_PARTY_PERMISSIONS_SCHEMA: TableSchema = {
  id: 'third-party-permissions',
  keyColumn: 'toolId',
  path: TABLE_PATHS.thirdPartyPermissions
};

export const NOTIFICATIONS_SCHEMA: TableSchema = {
  id: 'notifications',
  keyColumn: 'notification_id',
  path: TABLE_PATHS.notifications
};

export const CONNECTIONS_SCHEMA: TableSchema = {
  id: 'connections',
  keyColumn: 'connectionId',
  path: TABLE_PATHS.connections
};

export const DEVICES_SCHEMA: TableSchema = {
  id: 'devices',
  keyColumn: 'deviceId',
  path: TABLE_PATHS.devices
};

export const OWNED_ASSETS_SCHEMA: TableSchema = {
  id: 'owned-assets',
  keyColumn: 'id',
  path: TABLE_PATHS.ownedAssets
};

export const PUBLIC_FILE_INDEX_SCHEMA: TableSchema = {
  id: 'public-file-index',
  keyColumn: 'fileId',
  path: TABLE_PATHS.publicFileIndex
};

export const OWNER_FILE_INDEX_SCHEMA: TableSchema = {
  id: 'owner-file-index',
  keyColumn: 'fileId',
  path: TABLE_PATHS.ownerFileIndex
};

export const FOLLOWERS_SCHEMA: TableSchema = {
  id: 'followers',
  keyColumn: 'followerPnIdentifier',
  path: TABLE_PATHS.followers
};

export const FOLLOWING_SCHEMA: TableSchema = {
  id: 'following',
  keyColumn: 'followingKey',
  path: TABLE_PATHS.following
};

export const GROUPS_SCHEMA: TableSchema = {
  id: 'groups',
  keyColumn: 'memberKey',
  path: TABLE_PATHS.groups
};

export const ACTIVITY_LEDGER_SCHEMA: TableSchema = {
  id: 'activity-ledger',
  keyColumn: 'activity_id',
  path: TABLE_PATHS.activityLedger
};

export const MESSAGING_LEDGER_SCHEMA: TableSchema = {
  id: 'messaging-ledger',
  keyColumn: 'message_activity_id',
  path: TABLE_PATHS.messagingLedger
};

export const MESSAGE_REQUESTS_SCHEMA: TableSchema = {
  id: 'message-requests',
  keyColumn: 'requestId',
  path: TABLE_PATHS.messageRequests
};

export const DATA_POINT_REQUESTS_SCHEMA: TableSchema = {
  id: 'data-point-requests',
  keyColumn: 'requestId',
  path: TABLE_PATHS.dataPointRequests
};

export const INBOX_SCHEMA: TableSchema = {
  id: 'inbox',
  /** DM: peer or peer|channel; group: groupId. Legacy rows keyed by participant alone = platform. */
  keyColumn: 'inboxRowKey',
  path: messagesPath('inbox')
};

export const RECOVERY_CUSTODIANS_SCHEMA: TableSchema = {
  id: 'recovery-custodians',
  keyColumn: 'custodianId',
  path: TABLE_PATHS.recovery
};

export const RECOVERY_PENDING_SCHEMA: TableSchema = {
  id: 'recovery-pending',
  keyColumn: 'shareIndex',
  path: metadataPath('recovery-pending')
};

export const RECOVERY_REQUESTS_SCHEMA: TableSchema = {
  id: 'recovery-requests',
  keyColumn: 'requestId',
  path: metadataPath('recovery-requests')
};

export const PREFERENCES_INTERACTIONS_SCHEMA: TableSchema = {
  id: 'preferences-interactions',
  keyColumn: 'interaction_id',
  path: TABLE_PATHS.preferences
};

export const PRISM_LEDGER_SCHEMA: TableSchema = {
  id: 'prism-ledger',
  keyColumn: 'activity_id',
  path: TABLE_PATHS.prismLedger
};

/** Append-heavy ledgers written as daily segment files. */
export const SEGMENTED_LEDGER_IDS: ReadonlySet<string> = new Set([
  ACTIVITY_LEDGER_SCHEMA.id,
  MESSAGING_LEDGER_SCHEMA.id,
  PRISM_LEDGER_SCHEMA.id
]);

/**
 * Single-file tables a new portable social cloud starts with. Device registry,
 * third-party grants and data-point requests live in Postgres, not the user's cloud.
 */
export const PORTABLE_LAYOUT_TABLES: readonly TableSchema[] = [
  CONNECTIONS_SCHEMA,
  NOTIFICATIONS_SCHEMA,
  PUBLIC_FILE_INDEX_SCHEMA,
  OWNER_FILE_INDEX_SCHEMA,
  OWNED_ASSETS_SCHEMA,
  GROUPS_SCHEMA,
  FOLLOWERS_SCHEMA,
  FOLLOWING_SCHEMA,
  MESSAGE_REQUESTS_SCHEMA,
  INBOX_SCHEMA,
  RECOVERY_CUSTODIANS_SCHEMA,
  RECOVERY_PENDING_SCHEMA,
  RECOVERY_REQUESTS_SCHEMA,
  PREFERENCES_INTERACTIONS_SCHEMA
];
