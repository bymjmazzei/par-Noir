/**
 * Sole Google Drive discovery path: find/create folders and sheets, return complete PnDriveIndex.
 */

import type { GoogleDriveToken } from './googleOAuth2Helper';
import { normalizePnIdentifier, pnFolderDisplayName } from './integratorStoragePaths';
import {
  findFolderByNameUnderParent,
  findOrCreateFolderUnderParent,
  findPnRootFolderId,
  initializeIntegratorsRoot,
} from './pnDriveLayout';
import {
  PN_DRIVE_INDEX_SCHEMA_VERSION,
  PN_DRIVE_SHEET_KEYS,
  type PnDriveIndex,
} from './pnDriveIndex';
import {
  DRIVE_INIT_SHEET_CONCURRENCY,
  fetchGoogleDriveWithRetry,
  mapWithConcurrency,
  withGoogleRetry,
} from './googleApiRetry';
import { setDriveInitProgress } from './driveInitProgress';

export interface DriveInitHooks {
  initializeContentClassFolders?(
    token: GoogleDriveToken,
    metadataFolderId: string,
    pnIdentifier: string,
    accountId?: string
  ): Promise<void>;
  initializeProfileAndMetadataFiles?(
    token: GoogleDriveToken,
    metadataFolderId: string,
    pnIdentifier: string,
    accountId?: string
  ): Promise<void>;
}

async function ensurePnAndMetadataFolders(
  accessToken: string,
  pnIdentifier: string
): Promise<{ pnFolderId: string; metadataFolderId: string }> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  let pnFolderId = await findPnRootFolderId(accessToken, normalized);
  if (!pnFolderId) {
    const pnFolderName = pnFolderDisplayName(normalized);
    const res = await fetchGoogleDriveWithRetry(
      'https://www.googleapis.com/drive/v3/files',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: pnFolderName,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      },
      `create pN folder ${normalized}`
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to create pN folder: ${res.status} ${text.slice(0, 200)}`);
    }
    const created = (await res.json()) as { id: string };
    pnFolderId = created.id;
  }

  let metadataFolderId = await findFolderByNameUnderParent(accessToken, '_metadata', pnFolderId);
  if (!metadataFolderId) {
    metadataFolderId = await findOrCreateFolderUnderParent(accessToken, '_metadata', pnFolderId);
  }

  return { pnFolderId, metadataFolderId };
}

async function ensureSheet(
  label: string,
  getFn: () => Promise<string>,
  createFn: () => Promise<string>
): Promise<string> {
  try {
    return await withGoogleRetry(`${label}:get`, getFn);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found') || msg.toLowerCase().includes('not found')) {
      return withGoogleRetry(`${label}:create`, createFn);
    }
    throw error;
  }
}

type MetadataSheetTask = {
  key: string;
  label: string;
  run: () => Promise<string>;
};

/**
 * Find/create full Drive layout and all metadata sheets; returns complete PnDriveIndex.
 */
export async function initializeGoogleDriveIndex(
  token: GoogleDriveToken,
  pnIdentifier: string,
  accountId?: string,
  hooks: DriveInitHooks = {}
): Promise<PnDriveIndex> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  console.log(`[pnDriveInit] Begin full layout for ${normalized}`);
  const accessToken = token.access_token;
  const { pnFolderId, metadataFolderId } = await withGoogleRetry(
    'ensurePnAndMetadataFolders',
    () => ensurePnAndMetadataFolders(accessToken, pnIdentifier)
  );
  setDriveInitProgress(normalized, 'folders', 'Created pN folder and _metadata', 8);
  console.log(`[pnDriveInit] pN folder + _metadata ready for ${normalized}`);
  const integratorsRootId = await withGoogleRetry('integratorsRoot', () =>
    initializeIntegratorsRoot(accessToken, pnFolderId)
  );
  setDriveInitProgress(normalized, 'folders', 'Created integrators folder', 12);

  if (hooks.initializeContentClassFolders) {
    console.log(`[pnDriveInit] Content-class folders for ${normalized}`);
    setDriveInitProgress(normalized, 'contentClass', 'Building media, thoughts, and collections…', 15);
    await withGoogleRetry('contentClassFolders', () =>
      hooks.initializeContentClassFolders!(token, metadataFolderId, pnIdentifier, accountId)
    );
    setDriveInitProgress(normalized, 'contentClass', 'Content-class folders and indexes ready', 38);
  }

  const { MessageSheetsService } = await import('./messageSheetsService');
  console.log(`[pnDriveInit] Messages folder + inbox for ${normalized}`);
  setDriveInitProgress(normalized, 'messages', 'Creating messages folder and inbox…', 40);
  const messagesFolderId = await withGoogleRetry('messagesFolder', () =>
    MessageSheetsService.getOrCreateMessagesFolder(token, pnFolderId, pnIdentifier, accountId)
  );
  const inboxSheetId = await withGoogleRetry('inboxSheet', () =>
    MessageSheetsService.getOrCreateInboxSheet(token, messagesFolderId, pnIdentifier, accountId)
  );
  setDriveInitProgress(normalized, 'messages', 'Messages folder and inbox ready', 42);

  console.log(`[pnDriveInit] Metadata sheets (connections → prism) for ${normalized}`);
  setDriveInitProgress(normalized, 'metadataSheets', 'Creating metadata sheets…', 44);

  const [
    { ConnectionsSheetsService },
    { ThirdPartyPermissionsSheetsService },
    { DeviceSheetsService },
    { OwnedAssetsSheetsService },
    { GroupSheetsService },
    { NotificationsSheetsService },
    { ActivityLedgerSheetsService },
    { MessagingLedgerSheetsService },
    { MessageRequestSheetsService },
    { DataPointRequestSheetsService },
    { ZKPDataPointsSheetsService },
    { PreferencesSheetsService },
    { EngagementSheetsService },
    { PrismLedgerSheetsService },
    { IndexSheetsService },
  ] = await Promise.all([
    import('./connectionsSheetsService'),
    import('./thirdPartyPermissionsSheetsService'),
    import('./deviceSheetsService'),
    import('./ownedAssetsSheetsService'),
    import('./groupSheetsService'),
    import('./notificationsSheetsService'),
    import('./activityLedgerSheetsService'),
    import('./messagingLedgerSheetsService'),
    import('./messageRequestSheetsService'),
    import('./dataPointRequestSheetsService'),
    import('./zkpDataPointsSheetsService'),
    import('./preferencesSheetsService'),
    import('./engagementSheetsService'),
    import('./prismLedgerSheetsService'),
    import('./indexSheetsService'),
  ]);

  const metadataSheetTasks: MetadataSheetTask[] = [
    {
      key: PN_DRIVE_SHEET_KEYS.CONNECTIONS,
      label: 'connections',
      run: () =>
        ensureSheet(
          'connections',
          () => ConnectionsSheetsService.getConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => ConnectionsSheetsService.createConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.FOLLOWERS,
      label: 'followers',
      run: () =>
        ensureSheet(
          'followers',
          () => ConnectionsSheetsService.getFollowersSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => ConnectionsSheetsService.createFollowersSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.FOLLOWING,
      label: 'following',
      run: () =>
        ensureSheet(
          'following',
          () => ConnectionsSheetsService.getFollowingSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => ConnectionsSheetsService.createFollowingSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.THIRD_PARTY_PERMISSIONS,
      label: 'thirdPartyPermissions',
      run: () =>
        ensureSheet(
          'thirdPartyPermissions',
          () =>
            ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
              token,
              metadataFolderId,
              pnIdentifier,
              accountId
            ),
          () =>
            ThirdPartyPermissionsSheetsService.createThirdPartyPermissionsSheet(
              token,
              metadataFolderId,
              pnIdentifier,
              accountId
            )
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.DEVICES,
      label: 'devices',
      run: () =>
        withGoogleRetry('devicesSheet', () =>
          DeviceSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.OWNED_ASSETS,
      label: 'ownedAssets',
      run: () =>
        withGoogleRetry('ownedAssetsSheet', () =>
          OwnedAssetsSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.GROUPS,
      label: 'groups',
      run: () =>
        withGoogleRetry('groupsSheet', () =>
          GroupSheetsService.getOrCreateGroupsSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.NOTIFICATIONS,
      label: 'notifications',
      run: () =>
        ensureSheet(
          'notifications',
          () =>
            NotificationsSheetsService.getNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId),
          () =>
            NotificationsSheetsService.createNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.ACTIVITY_LEDGER,
      label: 'activityLedger',
      run: () =>
        ensureSheet(
          'activityLedger',
          () =>
            ActivityLedgerSheetsService.getActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
          () =>
            ActivityLedgerSheetsService.createActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.MESSAGING_LEDGER,
      label: 'messagingLedger',
      run: () =>
        ensureSheet(
          'messagingLedger',
          () =>
            MessagingLedgerSheetsService.getMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
          () =>
            MessagingLedgerSheetsService.createMessagingLedgerSheet(
              token,
              metadataFolderId,
              pnIdentifier,
              accountId
            )
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.MESSAGE_REQUESTS,
      label: 'messageRequests',
      run: () =>
        withGoogleRetry('messageRequestsSheet', () =>
          MessageRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.DATA_POINT_REQUESTS,
      label: 'dataPointRequests',
      run: () =>
        withGoogleRetry('dataPointRequestsSheet', () =>
          DataPointRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.ZKP_DATA_POINTS,
      label: 'zkpDataPoints',
      run: () =>
        ensureSheet(
          'zkpDataPoints',
          () => ZKPDataPointsSheetsService.getZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId),
          () =>
            ZKPDataPointsSheetsService.createZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.PREFERENCES,
      label: 'preferences',
      run: () =>
        ensureSheet(
          'preferences',
          () => PreferencesSheetsService.getPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => PreferencesSheetsService.createPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.ENGAGEMENT,
      label: 'engagement',
      run: () =>
        ensureSheet(
          'engagement',
          () => EngagementSheetsService.getEngagementSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => EngagementSheetsService.createEngagementSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.PRISM_LEDGER,
      label: 'prismLedger',
      run: () =>
        ensureSheet(
          'prismLedger',
          () => PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
          () => PrismLedgerSheetsService.createPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.PUBLIC_FILE_INDEX,
      label: 'publicFileIndex',
      run: () =>
        ensureSheet(
          'rootPublicFileIndex',
          () => IndexSheetsService.getIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId),
          () => IndexSheetsService.createIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId)
        ),
    },
    {
      key: PN_DRIVE_SHEET_KEYS.OWNER_FILE_INDEX,
      label: 'ownerFileIndex',
      run: () =>
        ensureSheet(
          'rootOwnerFileIndex',
          () => IndexSheetsService.getIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId),
          () => IndexSheetsService.createIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId)
        ),
    },
  ];

  const totalSheets = metadataSheetTasks.length;
  let completedSheets = 0;
  const sheetIdsByKey: Record<string, string> = {};
  const sheetIdList = await mapWithConcurrency(
    metadataSheetTasks,
    DRIVE_INIT_SHEET_CONCURRENCY,
    async (task) => {
      console.log(`[pnDriveInit] Ensuring ${task.label}`);
      const id = await task.run();
      completedSheets += 1;
      const percent = 44 + Math.floor((completedSheets / totalSheets) * 32);
      setDriveInitProgress(
        normalized,
        'metadataSheets',
        `Creating metadata sheets (${completedSheets}/${totalSheets})…`,
        Math.min(76, percent)
      );
      return id;
    }
  );
  for (let i = 0; i < metadataSheetTasks.length; i++) {
    sheetIdsByKey[metadataSheetTasks[i].key] = sheetIdList[i];
  }
  setDriveInitProgress(normalized, 'metadataSheets', 'Metadata sheets ready', 76);

  if (hooks.initializeProfileAndMetadataFiles) {
    console.log(`[pnDriveInit] profile.json + preferences.json for ${normalized}`);
    setDriveInitProgress(normalized, 'profile', 'Creating profile.json and preferences.json…', 80);
    await withGoogleRetry('profileAndPreferences', () =>
      hooks.initializeProfileAndMetadataFiles!(token, metadataFolderId, pnIdentifier, accountId)
    );
    setDriveInitProgress(normalized, 'profile', 'Profile and preferences ready', 84);
  }

  console.log(`[pnDriveInit] Complete layout for ${normalized}`);

  let zkpDocsFolderId: string | undefined;
  try {
    const { findOrCreateFolderUnderParent } = await import('./pnDriveLayout');
    zkpDocsFolderId = await withGoogleRetry('zkpDocsFolder', () =>
      findOrCreateFolderUnderParent(accessToken, 'zkp-docs', metadataFolderId)
    );
  } catch (e) {
    console.warn('[pnDriveInit] zkp-docs folder deferred:', (e as Error)?.message);
  }

  return {
    schemaVersion: PN_DRIVE_INDEX_SCHEMA_VERSION,
    pnFolderId,
    metadataFolderId,
    integratorsRootId,
    messagesFolderId,
    inboxSheetId,
    ...(zkpDocsFolderId ? { zkpDocsFolderId } : {}),
    conversationSheets: {},
    sheetIds: {
      [PN_DRIVE_SHEET_KEYS.CONNECTIONS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.CONNECTIONS],
      [PN_DRIVE_SHEET_KEYS.THIRD_PARTY_PERMISSIONS]:
        sheetIdsByKey[PN_DRIVE_SHEET_KEYS.THIRD_PARTY_PERMISSIONS],
      [PN_DRIVE_SHEET_KEYS.DEVICES]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.DEVICES],
      [PN_DRIVE_SHEET_KEYS.OWNED_ASSETS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.OWNED_ASSETS],
      [PN_DRIVE_SHEET_KEYS.GROUPS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.GROUPS],
      [PN_DRIVE_SHEET_KEYS.NOTIFICATIONS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.NOTIFICATIONS],
      [PN_DRIVE_SHEET_KEYS.ACTIVITY_LEDGER]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.ACTIVITY_LEDGER],
      [PN_DRIVE_SHEET_KEYS.MESSAGING_LEDGER]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.MESSAGING_LEDGER],
      [PN_DRIVE_SHEET_KEYS.MESSAGE_REQUESTS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.MESSAGE_REQUESTS],
      [PN_DRIVE_SHEET_KEYS.DATA_POINT_REQUESTS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.DATA_POINT_REQUESTS],
      [PN_DRIVE_SHEET_KEYS.ZKP_DATA_POINTS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.ZKP_DATA_POINTS],
      [PN_DRIVE_SHEET_KEYS.PREFERENCES]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.PREFERENCES],
      [PN_DRIVE_SHEET_KEYS.ENGAGEMENT]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.ENGAGEMENT],
      [PN_DRIVE_SHEET_KEYS.PRISM_LEDGER]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.PRISM_LEDGER],
      [PN_DRIVE_SHEET_KEYS.PUBLIC_FILE_INDEX]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.PUBLIC_FILE_INDEX],
      [PN_DRIVE_SHEET_KEYS.OWNER_FILE_INDEX]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.OWNER_FILE_INDEX],
      [PN_DRIVE_SHEET_KEYS.FOLLOWERS]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.FOLLOWERS],
      [PN_DRIVE_SHEET_KEYS.FOLLOWING]: sheetIdsByKey[PN_DRIVE_SHEET_KEYS.FOLLOWING],
    },
  };
}
