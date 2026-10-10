/**
 * Device metadata workbook scaffolds — tab names and headers match api *SheetsService create paths.
 */

import {
  createSpreadsheetInFolder,
  ensureSpreadsheetInFolder,
  type HeaderWrite,
  type SpreadsheetSpec,
} from './deviceSpreadsheetInit.js';

const FILE_INDEX_HEADER: HeaderWrite = {
  range: 'Files!A1:E1',
  values: [
    ['File ID', 'Google Drive File ID', 'Visibility', 'Uploaded At', 'Entry Data (JSON)'],
  ],
};

function indexFilesSpec(driveFileName: string): SpreadsheetSpec {
  return {
    driveFileName,
    propertiesTitle: driveFileName,
    sheets: [{ title: 'Files', rowCount: 100_000, columnCount: 6 }],
    headers: [FILE_INDEX_HEADER],
  };
}

const METADATA_SPECS: Record<string, SpreadsheetSpec> = {
  connections: {
    driveFileName: 'connections.xlsx',
    propertiesTitle: 'connections.xlsx',
    sheets: [
      { title: 'Connections', rowCount: 100_000, columnCount: 6 },
      { title: 'Blocked', rowCount: 10_000, columnCount: 1 },
      { title: 'Metadata', rowCount: 10, columnCount: 2 },
    ],
    headers: [
      {
        range: 'Connections!A1:G1',
        values: [
          [
            'Connection ID',
            'User DID',
            'Status',
            'Created At',
            'Accepted At',
            'Peer ML-KEM Public Key',
            'KEM Ciphertext',
          ],
        ],
      },
      { range: 'Blocked!A1:A1', values: [['Blocked DID']] },
      { range: 'Metadata!A1:B2', values: [['Identifier', ''], ['UpdatedAt', '']] },
    ],
  },
  followers: {
    driveFileName: 'followers.xlsx',
    propertiesTitle: 'followers.xlsx',
    sheets: [{ title: 'Followers', rowCount: 100_000, columnCount: 3 }],
    headers: [
      { range: 'Followers!A1:C1', values: [['Follower DID', 'Followed At', 'Feed ID']] },
    ],
  },
  following: {
    driveFileName: 'following.xlsx',
    propertiesTitle: 'following.xlsx',
    sheets: [{ title: 'Following', rowCount: 100_000, columnCount: 3 }],
    headers: [
      { range: 'Following!A1:C1', values: [['Target Type', 'Target ID', 'Followed At']] },
    ],
  },
  'third-party-permissions': {
    driveFileName: 'third-party-permissions.xlsx',
    propertiesTitle: 'third-party-permissions.xlsx',
    sheets: [{ title: 'Permissions', rowCount: 10_000, columnCount: 15 }],
    headers: [
      {
        range: 'Permissions!A1:O1',
        values: [
          [
            'Tool ID',
            'Tool Name',
            'Tool Description',
            'Permissions (JSON)',
            'Data Points (JSON)',
            'Required Data Points (JSON)',
            'Optional Data Points (JSON)',
            'Granted At',
            'Expires At',
            'Status',
            'Created At',
            'Updated At',
            'Integrator Folder ID',
            'Data Point Levels (JSON)',
            'Permission Manifest (JSON)',
          ],
        ],
      },
    ],
  },
  devices: {
    driveFileName: 'devices.xlsx',
    propertiesTitle: 'devices.xlsx',
    sheets: [{ title: 'Devices', rowCount: 50, columnCount: 11 }],
    headers: [
      {
        range: 'Devices!A1:J1',
        values: [
          [
            'deviceId',
            'devicePublicKey',
            'label',
            'deviceType',
            'keyType',
            'status',
            'isPrimary',
            'createdAt',
            'lastSeenAt',
            'privateDisplay',
          ],
        ],
      },
    ],
  },
  groups: {
    driveFileName: 'groups.xlsx',
    propertiesTitle: 'groups.xlsx',
    sheets: [{ title: 'Groups', rowCount: 10_000, columnCount: 8 }],
    headers: [
      {
        range: 'Groups!A1:H1',
        values: [
          [
            'groupId',
            'ownerPnIdentifier',
            'title',
            'createdAt',
            'memberPnIdentifier',
            'accessRole',
            'wrappedChatKey',
            'conversationSpreadsheetId',
          ],
        ],
      },
    ],
  },
  notifications: {
    driveFileName: 'notifications.xlsx',
    propertiesTitle: 'notifications.xlsx',
    sheets: [{ title: 'Notifications', rowCount: 100_000, columnCount: 8 }],
    headers: [
      {
        range: 'Notifications!A1:H1',
        values: [
          ['Notification ID', 'User DID', 'Type', 'Title', 'Message', 'Data', 'Read Status', 'Created At'],
        ],
      },
    ],
  },
  activity_ledger: {
    driveFileName: 'activity_ledger.xlsx',
    propertiesTitle: 'activity_ledger.xlsx',
    sheets: [{ title: 'Activities', rowCount: 100_000, columnCount: 8 }],
    headers: [
      {
        range: 'Activities!A1:H1',
        values: [
          [
            'Activity ID',
            'User DID',
            'Activity Type',
            'Target Type',
            'Target ID',
            'Actor DID',
            'Metadata',
            'Created At',
          ],
        ],
      },
    ],
  },
  messaging_ledger: {
    driveFileName: 'messaging_ledger.xlsx',
    propertiesTitle: 'messaging_ledger.xlsx',
    sheets: [{ title: 'Activities', rowCount: 100_000, columnCount: 9 }],
    headers: [
      {
        range: 'Activities!A1:I1',
        values: [
          [
            'Activity ID',
            'User DID',
            'Activity Type',
            'From DID',
            'To DID',
            'Message ID',
            'Thread ID',
            'Metadata (JSON)',
            'Created At',
          ],
        ],
      },
    ],
  },
  message_requests: {
    driveFileName: 'message_requests.xlsx',
    propertiesTitle: 'message_requests.xlsx',
    sheets: [{ title: 'Requests', rowCount: 10_000, columnCount: 8 }],
    headers: [
      {
        range: 'Requests!A1:H1',
        values: [
          [
            'Request ID',
            'From pN',
            'To pN',
            'Content',
            'Status',
            'Created At',
            'KEM Ciphertext',
            'Crypto Version',
          ],
        ],
      },
    ],
  },
  'data-point-requests': {
    driveFileName: 'data-point-requests.xlsx',
    propertiesTitle: 'data-point-requests.xlsx',
    sheets: [{ title: 'Requests', rowCount: 10_000, columnCount: 8 }],
    headers: [
      {
        range: 'Requests!A1:H1',
        values: [
          [
            'Request ID',
            'Client ID',
            'Tool Name',
            'Data Points',
            'Reason',
            'Status',
            'Created At',
            'Responded At',
          ],
        ],
      },
    ],
  },
  'zkp-data-points': {
    driveFileName: 'zkp-data-points.xlsx',
    propertiesTitle: 'zkp-data-points.xlsx',
    sheets: [{ title: 'Data Points', rowCount: 10_000, columnCount: 12 }],
    headers: [
      {
        range: 'Data Points!A1:L1',
        values: [
          [
            'Data Point ID',
            'Proof Type',
            'ZKP Proof',
            'Signature',
            'Verified At',
            'Expires At',
            'Verification Level',
            'Provider',
            'Fraud Prevention Score',
            'Encrypted User Data',
            'Created At',
            'Updated At',
          ],
        ],
      },
    ],
  },
  preferences: {
    driveFileName: 'preferences',
    propertiesTitle: 'preferences',
    sheets: [
      { title: 'Interactions', rowCount: 100_000, columnCount: 11 },
      { title: 'Current', rowCount: 1000, columnCount: 2 },
    ],
    headers: [
      {
        range: 'Interactions!A1:K1',
        values: [
          [
            'Interaction ID',
            'User DID',
            'Preference Type',
            'Action Type',
            'Previous Value (JSON)',
            'New Value (JSON)',
            'Tag ID',
            'Source File ID',
            'Question ID',
            'Metadata (JSON)',
            'Created At',
          ],
        ],
      },
      { range: 'Current!A1:B1', values: [['Key', 'Value (JSON)']] },
      {
        range: 'Current!A2:B2',
        values: [
          [
            'preferences',
            JSON.stringify({
              identifier: '',
              updatedAt: new Date().toISOString(),
              tagPreferences: [],
            }),
          ],
        ],
      },
    ],
  },
  engagement: {
    driveFileName: 'engagement.xlsx',
    propertiesTitle: 'engagement.xlsx',
    sheets: [
      { title: 'Likes', rowCount: 100_000, columnCount: 2 },
      { title: 'Dislikes', rowCount: 100_000, columnCount: 2 },
      { title: 'Comments', rowCount: 100_000, columnCount: 8 },
      { title: 'Shares', rowCount: 100_000, columnCount: 2 },
      { title: 'Saves', rowCount: 100_000, columnCount: 2 },
    ],
    headers: [
      { range: 'Likes!A1:B1', values: [['File ID', 'Timestamp']] },
      { range: 'Dislikes!A1:B1', values: [['File ID', 'Timestamp']] },
      {
        range: 'Comments!A1:H1',
        values: [
          [
            'Comment ID',
            'File ID',
            'Content',
            'Author Name',
            'Timestamp',
            'Parent Comment ID',
            'Likes (JSON)',
            'Post Reply (JSON)',
          ],
        ],
      },
      { range: 'Shares!A1:B1', values: [['File ID', 'Timestamp']] },
      { range: 'Saves!A1:B1', values: [['File ID', 'Timestamp']] },
    ],
  },
  prism_ledger: {
    driveFileName: 'prism_ledger.xlsx',
    propertiesTitle: 'prism_ledger.xlsx',
    sheets: [{ title: 'Activities', rowCount: 100_000, columnCount: 8 }],
    headers: [
      {
        range: 'Activities!A1:H1',
        values: [
          [
            'Activity ID',
            'User DID',
            'Activity Type',
            'Target File ID',
            'Target Owner DID',
            'Vote',
            'Metadata (JSON)',
            'Created At',
          ],
        ],
      },
    ],
  },
  'public-file-index': indexFilesSpec('public-file-index.xlsx'),
  'owner-file-index': indexFilesSpec('owner-file-index.xlsx'),
};

export type DeviceMetadataSheetKey = keyof typeof METADATA_SPECS;

const INBOX_HEADERS = [
  'participantPnIdentifier',
  'spreadsheetId',
  'connectionId',
  'lastMessageAt',
  'lastMessagePreview',
  'kemCiphertext',
  'threadType',
  'wrappedMessageRootKey',
  'channelClientId',
];

const INBOX_SPEC: SpreadsheetSpec = {
  driveFileName: 'Inbox',
  propertiesTitle: 'Inbox',
  sheets: [{ title: 'Inbox', rowCount: 10_000, columnCount: 9 }],
  headers: [{ range: 'Inbox!A1:I1', values: [INBOX_HEADERS] }],
};

export async function ensureDeviceMetadataSheet(
  accessToken: string,
  key: DeviceMetadataSheetKey,
  metadataFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const spec = METADATA_SPECS[key];
  if (!spec) throw new Error(`Unknown metadata sheet key: ${key}`);
  return ensureSpreadsheetInFolder(accessToken, metadataFolderId, spec, fetchImpl);
}

export async function ensureDeviceInboxSheet(
  accessToken: string,
  messagesFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  return ensureSpreadsheetInFolder(accessToken, messagesFolderId, INBOX_SPEC, fetchImpl);
}

export type ContentClassName = 'media' | 'notes' | 'collections';
export type IndexSheetKind = 'public' | 'owner';

export function contentClassIndexFileName(
  contentClass: ContentClassName,
  indexType: IndexSheetKind
): string {
  return `${contentClass}-${indexType}-index.xlsx`;
}

export async function ensureDeviceIndexSheet(
  accessToken: string,
  folderId: string,
  indexType: IndexSheetKind,
  contentClass?: ContentClassName,
  fetchImpl?: typeof fetch
): Promise<string> {
  const driveFileName =
    contentClass != null
      ? contentClassIndexFileName(contentClass, indexType)
      : indexType === 'public'
        ? 'public-file-index.xlsx'
        : 'owner-file-index.xlsx';
  const spec = indexFilesSpec(driveFileName);
  return ensureSpreadsheetInFolder(accessToken, folderId, spec, fetchImpl);
}

/** Exported for tests */
export { METADATA_SPECS, INBOX_SPEC, createSpreadsheetInFolder };
