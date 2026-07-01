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
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: pnFolderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
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
  getFn: () => Promise<string>,
  createFn: () => Promise<string>
): Promise<string> {
  try {
    return await getFn();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found') || msg.toLowerCase().includes('not found')) {
      return createFn();
    }
    throw error;
  }
}

async function ensureIndexSheets(
  token: GoogleDriveToken,
  metadataFolderId: string,
  pnIdentifier: string,
  accountId: string | undefined
): Promise<{ publicFileIndex: string; ownerFileIndex: string }> {
  const { IndexSheetsService } = await import('./indexSheetsService');
  const publicFileIndex = await ensureSheet(
    () => IndexSheetsService.getIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId),
    () => IndexSheetsService.createIndexSheet(token, metadataFolderId, 'public', pnIdentifier, accountId)
  );
  const ownerFileIndex = await ensureSheet(
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
  const accessToken = token.access_token;
  const { pnFolderId, metadataFolderId } = await ensurePnAndMetadataFolders(accessToken, pnIdentifier);
  const integratorsRootId = await initializeIntegratorsRoot(accessToken, pnFolderId);

  if (hooks.initializeContentClassFolders) {
    await hooks.initializeContentClassFolders(token, metadataFolderId, pnIdentifier, accountId);
  }

  const { MessageSheetsService } = await import('./messageSheetsService');
  const messagesFolderId = await MessageSheetsService.getOrCreateMessagesFolder(
    token,
    pnFolderId,
    pnIdentifier,
    accountId
  );
  const inboxSheetId = await MessageSheetsService.getOrCreateInboxSheet(
    token,
    messagesFolderId,
    pnIdentifier,
    accountId
  );

  const { ConnectionsSheetsService } = await import('./connectionsSheetsService');
  const connections = await ensureSheet(
    () => ConnectionsSheetsService.getConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createConnectionsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  const followers = await ensureSheet(
    () => ConnectionsSheetsService.getFollowersSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createFollowersSheet(token, metadataFolderId, pnIdentifier, accountId)
  );
  const following = await ensureSheet(
    () => ConnectionsSheetsService.getFollowingSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ConnectionsSheetsService.createFollowingSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
  const thirdPartyPermissions = await ensureSheet(
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

  const { DeviceSheetsService } = await import('./deviceSheetsService');
  const devices = await DeviceSheetsService.getOrCreateSpreadsheet(
    token,
    metadataFolderId,
    pnIdentifier,
    accountId
  );

  const { GroupSheetsService } = await import('./groupSheetsService');
  const groups = await GroupSheetsService.getOrCreateGroupsSheet(
    token,
    metadataFolderId,
    pnIdentifier,
    accountId
  );

  const { NotificationsSheetsService } = await import('./notificationsSheetsService');
  const notifications = await ensureSheet(
    () => NotificationsSheetsService.getNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => NotificationsSheetsService.createNotificationsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { ActivityLedgerSheetsService } = await import('./activityLedgerSheetsService');
  const activityLedger = await ensureSheet(
    () =>
      ActivityLedgerSheetsService.getActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () =>
      ActivityLedgerSheetsService.createActivityLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { MessagingLedgerSheetsService } = await import('./messagingLedgerSheetsService');
  const messagingLedger = await ensureSheet(
    () =>
      MessagingLedgerSheetsService.getMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () =>
      MessagingLedgerSheetsService.createMessagingLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { MessageRequestSheetsService } = await import('./messageRequestSheetsService');
  const messageRequests = await MessageRequestSheetsService.getOrCreateSpreadsheet(
    token,
    metadataFolderId,
    pnIdentifier,
    accountId
  );

  const { DataPointRequestSheetsService } = await import('./dataPointRequestSheetsService');
  const dataPointRequests = await DataPointRequestSheetsService.getOrCreateSpreadsheet(
    token,
    metadataFolderId,
    pnIdentifier,
    accountId
  );

  const { ZKPDataPointsSheetsService } = await import('./zkpDataPointsSheetsService');
  const zkpDataPoints = await ensureSheet(
    () => ZKPDataPointsSheetsService.getZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => ZKPDataPointsSheetsService.createZKPDataPointsSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { PreferencesSheetsService } = await import('./preferencesSheetsService');
  const preferences = await ensureSheet(
    () => PreferencesSheetsService.getPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => PreferencesSheetsService.createPreferencesSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { EngagementSheetsService } = await import('./engagementSheetsService');
  const engagement = await ensureSheet(
    () => EngagementSheetsService.getEngagementSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => EngagementSheetsService.createEngagementSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { PrismLedgerSheetsService } = await import('./prismLedgerSheetsService');
  const prismLedger = await ensureSheet(
    () => PrismLedgerSheetsService.getPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId),
    () => PrismLedgerSheetsService.createPrismLedgerSheet(token, metadataFolderId, pnIdentifier, accountId)
  );

  const { publicFileIndex, ownerFileIndex } = await ensureIndexSheets(
    token,
    metadataFolderId,
    pnIdentifier,
    accountId
  );

  if (hooks.initializeProfileAndMetadataFiles) {
    await hooks.initializeProfileAndMetadataFiles(token, metadataFolderId, pnIdentifier, accountId);
  }

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
