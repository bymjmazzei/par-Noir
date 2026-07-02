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
import { fetchGoogleDriveWithRetry, INIT_SHEET_STEP_DELAY_MS, sleep, withGoogleRetry } from './googleApiRetry';
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

let metadataSheetStep = 0;

async function pauseBetweenMetadataSheets(): Promise<void> {
  if (metadataSheetStep > 0) {
    await sleep(INIT_SHEET_STEP_DELAY_MS);
  }
  metadataSheetStep += 1;
}

async function ensureMetadataSheet(
  label: string,
  getFn: () => Promise<string>,
  createFn: () => Promise<string>
): Promise<string> {
  await pauseBetweenMetadataSheets();
  return ensureSheet(label, getFn, createFn);
}

async function runMetadataSheetStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await pauseBetweenMetadataSheets();
  return withGoogleRetry(label, fn);
}

async function ensureIndexSheets(
  token: GoogleDriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId: string | undefined
): Promise<{ publicFileIndex: string; ownerFileIndex: string }> {
  const { IndexSheetsService } = await import('./indexSheetsService');
  const publicFileIndex = await ensureSheet(
    'rootPublicFileIndex',
    () => IndexSheetsService.getIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId),
    () => IndexSheetsService.createIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId)
  );
  const ownerFileIndex = await ensureSheet(
    'rootOwnerFileIndex',
    () => IndexSheetsService.getIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId),
    () => IndexSheetsService.createIndexSheet(token, metadataFolderId, 'owner', pnIdentifier, accountId)
  );
  return { publicFileIndex, ownerFileIndex };
}

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
  metadataSheetStep = 0;
  let metadataPercent = 44;
  const bumpMetadataProgress = (label: string) => {
    metadataPercent = Math.min(76, metadataPercent + 2);
    setDriveInitProgress(normalized, 'metadataSheets', label, metadataPercent);
  };
  const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
  const connections = await ensureMetadataSheet(
    'connections',
    () => ConnectionsSheetsService.getConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Connections sheet');
  const followers = await ensureMetadataSheet(
    'followers',
    () => ConnectionsSheetsService.getFollowersSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createFollowersSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Followers sheet');
  const following = await ensureMetadataSheet(
    'following',
    () => ConnectionsSheetsService.getFollowingSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createFollowingSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Following sheet');

  const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
  const thirdPartyPermissions = await ensureMetadataSheet(
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
  );
  bumpMetadataProgress('Third-party permissions sheet');

  const { DeviceSheetsService } = await import('./deviceSheetsService');
  const devices = await runMetadataSheetStep('devicesSheet', () =>
    DeviceSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Devices sheet');

  const { GroupSheetsService } = await import('./groupSheetsService');
  const groups = await runMetadataSheetStep('groupsSheet', () =>
    GroupSheetsService.getOrCreateGroupsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Groups sheet');

  const { NotificationsSheetsService } = await import('./notificationsSheetsService');
  const notifications = await ensureMetadataSheet(
    'notifications',
    () => NotificationsSheetsService.getNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => NotificationsSheetsService.createNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Notifications sheet');

  const { ActivityLedgerSheetsService } = await import('./activityLedgerSheetsService');
  const activityLedger = await ensureMetadataSheet(
    'activityLedger',
    () =>
      ActivityLedgerSheetsService.getActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () =>
      ActivityLedgerSheetsService.createActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Activity ledger sheet');

  const { MessagingLedgerSheetsService } = await import('./messagingLedgerSheetsService');
  const messagingLedger = await ensureMetadataSheet(
    'messagingLedger',
    () =>
      MessagingLedgerSheetsService.getMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () =>
      MessagingLedgerSheetsService.createMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Messaging ledger sheet');

  const { MessageRequestSheetsService } = await import('./messageRequestSheetsService');
  const messageRequests = await runMetadataSheetStep('messageRequestsSheet', () =>
    MessageRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Message requests sheet');

  const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
  const dataPointRequests = await runMetadataSheetStep('dataPointRequestsSheet', () =>
    DataPointRequestSheetsService.getOrCreateSpreadsheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Data point requests sheet');

  const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
  const zkpDataPoints = await ensureMetadataSheet(
    'zkpDataPoints',
    () => ZKPDataPointsSheetsService.getZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ZKPDataPointsSheetsService.createZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('ZKP data points sheet');

  const { PreferencesSheetsService } = await import('./preferencesSheetsService');
  const preferences = await ensureMetadataSheet(
    'preferences',
    () => PreferencesSheetsService.getPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => PreferencesSheetsService.createPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Preferences sheet');

  const { EngagementSheetsService } = await import('./engagementSheetsService');
  const engagement = await ensureMetadataSheet(
    'engagement',
    () => EngagementSheetsService.getEngagementSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => EngagementSheetsService.createEngagementSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Engagement sheet');

  const { PrismLedgerSheetsService } = await import('./prismLedgerSheetsService');
  const prismLedger = await ensureMetadataSheet(
    'prismLedger',
    () => PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => PrismLedgerSheetsService.createPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('Prism ledger sheet');

  const { publicFileIndex, ownerFileIndex } = await withGoogleRetry('rootIndexSheets', () =>
    ensureIndexSheets(token, metadataFolderId, pnIdentifier, accountId)
  );
  bumpMetadataProgress('File index sheets');

  if (hooks.initializeProfileAndMetadataFiles) {
    console.log(`[pnDriveInit] profile.json + preferences.json for ${normalized}`);
    setDriveInitProgress(normalized, 'profile', 'Creating profile.json and preferences.json…', 80);
    await withGoogleRetry('profileAndPreferences', () =>
      hooks.initializeProfileAndMetadataFiles!(token, metadataFolderId, pnIdentifier, accountId)
    );
    setDriveInitProgress(normalized, 'profile', 'Profile and preferences ready', 84);
  }

  console.log(`[pnDriveInit] Complete layout for ${normalized}`);
  return {
    schemaVersion: PN_DRIVE_INDEX_SCHEMA_VERSION,
    pnFolderId,
    metadataFolderId,
    integratorsRootId,
    messagesFolderId,
    inboxSheetId,
    conversationSheets: {},
    sheetIds: {
      [PN_DRIVE_SHEET_KEYS.CONNECTIONS]: connections,
      [PN_DRIVE_SHEET_KEYS.THIRD_PARTY_PERMISSIONS]: thirdPartyPermissions,
      [PN_DRIVE_SHEET_KEYS.DEVICES]: devices,
      [PN_DRIVE_SHEET_KEYS.GROUPS]: groups,
      [PN_DRIVE_SHEET_KEYS.NOTIFICATIONS]: notifications,
      [PN_DRIVE_SHEET_KEYS.ACTIVITY_LEDGER]: activityLedger,
      [PN_DRIVE_SHEET_KEYS.MESSAGING_LEDGER]: messagingLedger,
      [PN_DRIVE_SHEET_KEYS.MESSAGE_REQUESTS]: messageRequests,
      [PN_DRIVE_SHEET_KEYS.DATA_POINT_REQUESTS]: dataPointRequests,
      [PN_DRIVE_SHEET_KEYS.ZKP_DATA_POINTS]: zkpDataPoints,
      [PN_DRIVE_SHEET_KEYS.PREFERENCES]: preferences,
      [PN_DRIVE_SHEET_KEYS.ENGAGEMENT]: engagement,
      [PN_DRIVE_SHEET_KEYS.PRISM_LEDGER]: prismLedger,
      [PN_DRIVE_SHEET_KEYS.PUBLIC_FILE_INDEX]: publicFileIndex,
      [PN_DRIVE_SHEET_KEYS.OWNER_FILE_INDEX]: ownerFileIndex,
      [PN_DRIVE_SHEET_KEYS.FOLLOWERS]: followers,
      [PN_DRIVE_SHEET_KEYS.FOLLOWING]: following,
    },
  };
}
