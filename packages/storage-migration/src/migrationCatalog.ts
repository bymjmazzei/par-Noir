import {
  CONTENT_CLASSES,
  JSON_BLOB_PATHS,
  METADATA_DIR,
  TABLE_PATHS,
  contentClassIndexPath,
  messagesPath,
  metadataPath,
  type TableSchema
} from '@par-noir/user-owned-storage';

export type MigrationArtifactKind = 'bridge_table' | 'json_blob' | 'transformer';

export interface MigrationArtifact {
  id: string;
  kind: MigrationArtifactKind;
  path: string;
  critical: boolean;
  schema?: TableSchema;
  transformerId?: string;
}

/** Single-tab tables migrated via sheetsTableBridge scan/replaceAll. */
const BRIDGE_TABLES: MigrationArtifact[] = [
  { id: 'third-party-permissions', kind: 'bridge_table', path: TABLE_PATHS.thirdPartyPermissions, critical: false, schema: { id: 'third-party-permissions', keyColumn: 'toolId', path: TABLE_PATHS.thirdPartyPermissions } },
  { id: 'notifications', kind: 'bridge_table', path: TABLE_PATHS.notifications, critical: false, schema: { id: 'notifications', keyColumn: 'notification_id', path: TABLE_PATHS.notifications } },
  { id: 'zkp-data-points', kind: 'bridge_table', path: TABLE_PATHS.zkpDataPoints, critical: false, schema: { id: 'zkp-data-points', keyColumn: 'dataPointId', path: TABLE_PATHS.zkpDataPoints } },
  { id: 'devices', kind: 'bridge_table', path: TABLE_PATHS.devices, critical: true, schema: { id: 'devices', keyColumn: 'deviceId', path: TABLE_PATHS.devices } },
  { id: 'groups', kind: 'bridge_table', path: TABLE_PATHS.groups, critical: false, schema: { id: 'groups', keyColumn: 'memberKey', path: TABLE_PATHS.groups } },
  { id: 'followers', kind: 'bridge_table', path: TABLE_PATHS.followers, critical: false, schema: { id: 'followers', keyColumn: 'followerPnIdentifier', path: TABLE_PATHS.followers } },
  { id: 'following', kind: 'bridge_table', path: TABLE_PATHS.following, critical: false, schema: { id: 'following', keyColumn: 'followingKey', path: TABLE_PATHS.following } },
  { id: 'activity-ledger', kind: 'bridge_table', path: TABLE_PATHS.activityLedger, critical: false, schema: { id: 'activity-ledger', keyColumn: 'activity_id', path: TABLE_PATHS.activityLedger } },
  { id: 'messaging-ledger', kind: 'bridge_table', path: TABLE_PATHS.messagingLedger, critical: false, schema: { id: 'messaging-ledger', keyColumn: 'message_activity_id', path: TABLE_PATHS.messagingLedger } },
  { id: 'message-requests', kind: 'bridge_table', path: TABLE_PATHS.messageRequests, critical: false, schema: { id: 'message-requests', keyColumn: 'requestId', path: TABLE_PATHS.messageRequests } },
  { id: 'data-point-requests', kind: 'bridge_table', path: TABLE_PATHS.dataPointRequests, critical: false, schema: { id: 'data-point-requests', keyColumn: 'requestId', path: TABLE_PATHS.dataPointRequests } },
  { id: 'inbox', kind: 'bridge_table', path: messagesPath('inbox'), critical: true, schema: { id: 'inbox', keyColumn: 'participantPnIdentifier', path: messagesPath('inbox') } },
  { id: 'prism-ledger', kind: 'bridge_table', path: TABLE_PATHS.prismLedger, critical: false, schema: { id: 'prism-ledger', keyColumn: 'activity_id', path: TABLE_PATHS.prismLedger } },
  { id: 'public-file-index', kind: 'bridge_table', path: TABLE_PATHS.publicFileIndex, critical: true, schema: { id: 'public-file-index', keyColumn: 'fileId', path: TABLE_PATHS.publicFileIndex } },
  { id: 'owner-file-index', kind: 'bridge_table', path: TABLE_PATHS.ownerFileIndex, critical: true, schema: { id: 'owner-file-index', keyColumn: 'fileId', path: TABLE_PATHS.ownerFileIndex } }
];

const CONTENT_CLASS_INDEX_ARTIFACTS: MigrationArtifact[] = CONTENT_CLASSES.flatMap((cc) => [
  {
    id: `${cc}-public-index`,
    kind: 'bridge_table' as const,
    path: contentClassIndexPath(cc, 'public'),
    critical: true,
    schema: { id: `${cc}-public-index`, keyColumn: 'fileId', path: contentClassIndexPath(cc, 'public') }
  },
  {
    id: `${cc}-owner-index`,
    kind: 'bridge_table' as const,
    path: contentClassIndexPath(cc, 'owner'),
    critical: true,
    schema: { id: `${cc}-owner-index`, keyColumn: 'fileId', path: contentClassIndexPath(cc, 'owner') }
  }
]);

const JSON_BLOB_ARTIFACTS: MigrationArtifact[] = [
  { id: 'profile', kind: 'json_blob', path: JSON_BLOB_PATHS.profile, critical: true },
  { id: 'preferences-json', kind: 'json_blob', path: JSON_BLOB_PATHS.preferences, critical: true },
  { id: 'device-policy', kind: 'json_blob', path: JSON_BLOB_PATHS.devicePolicy, critical: true },
  { id: 'connections-meta', kind: 'json_blob', path: metadataPath('connections-meta.json'), critical: true },
  { id: 'public-index-meta', kind: 'json_blob', path: metadataPath('public-file-index-meta.json'), critical: false },
  { id: 'owner-index-meta', kind: 'json_blob', path: metadataPath('owner-file-index-meta.json'), critical: false },
  ...CONTENT_CLASSES.flatMap((cc) => [
    { id: `${cc}-public-index-meta`, kind: 'json_blob' as const, path: `${METADATA_DIR}/${cc}/${cc}-public-index-meta.json`, critical: false },
    { id: `${cc}-owner-index-meta`, kind: 'json_blob' as const, path: `${METADATA_DIR}/${cc}/${cc}-owner-index-meta.json`, critical: false }
  ])
];

const TRANSFORMER_ARTIFACTS: MigrationArtifact[] = [
  { id: 'connections', kind: 'transformer', path: TABLE_PATHS.connections, critical: true, transformerId: 'connections' },
  { id: 'recovery', kind: 'transformer', path: TABLE_PATHS.recovery, critical: true, transformerId: 'recovery' },
  { id: 'preferences', kind: 'transformer', path: TABLE_PATHS.preferences, critical: true, transformerId: 'preferences' },
  { id: 'engagement', kind: 'transformer', path: metadataPath('engagement.json'), critical: false, transformerId: 'engagement' },
  { id: 'messaging-conversations', kind: 'transformer', path: messagesPath('conversations'), critical: true, transformerId: 'messaging' },
  { id: 'companion-metadata', kind: 'transformer', path: `${METADATA_DIR}/companion`, critical: false, transformerId: 'companion' },
  { id: 'feed-subscribers', kind: 'transformer', path: `${METADATA_DIR}/feeds`, critical: false, transformerId: 'feed-subscribers' },
  { id: 'integrators', kind: 'transformer', path: 'integrators', critical: false, transformerId: 'integrators' }
];

export const MIGRATION_CATALOG: MigrationArtifact[] = [
  ...BRIDGE_TABLES,
  ...CONTENT_CLASS_INDEX_ARTIFACTS,
  ...JSON_BLOB_ARTIFACTS,
  ...TRANSFORMER_ARTIFACTS
];

export function getCriticalArtifacts(): MigrationArtifact[] {
  return MIGRATION_CATALOG.filter((a) => a.critical);
}
