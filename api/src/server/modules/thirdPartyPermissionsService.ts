/**
 * Third Party Permissions Service
 * Stores permissions via UserOwnedTableStore (Google Sheets or portable SQLite).
 */

import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableScan
} from './storage/portableTableService';
import { THIRD_PARTY_PERMISSIONS_SCHEMA } from './storage/tableSchemas';

export interface ThirdPartyPermission {
  toolId: string;
  toolName: string;
  toolDescription: string;
  permissions: string[];
  dataPoints: string[];
  requiredDataPoints: string[];
  optionalDataPoints: string[];
  grantedAt: string;
  expiresAt?: string;
  status: 'active' | 'pending' | 'revoked';
  integratorFolderId?: string;
}

export interface ThirdPartyPermissionsFile {
  identifier: string;
  updatedAt: string;
  permissions: Record<string, ThirdPartyPermission>;
}

export class ThirdPartyPermissionsService {
  static async getPermissionsFile(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Record<string, ThirdPartyPermission> | null> {
    try {
      const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

      if (await isPortableStorageProvider(normalized)) {
        const rows = await portableTableScan<ThirdPartyPermission>(
          normalized,
          THIRD_PARTY_PERMISSIONS_SCHEMA,
          accountId
        );
        if (rows.length === 0) return null;
        const permissions: Record<string, ThirdPartyPermission> = {};
        for (const row of rows) {
          permissions[row.toolId] = row;
        }
        return permissions;
      }

      const token: GoogleDriveToken = { access_token: accessToken };
      const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
      const spreadsheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
        token,
        metadataFolderId,
        normalized,
        accountId
      );

      const permissions = await ThirdPartyPermissionsSheetsService.getPermissions(
        token,
        spreadsheetId,
        normalized,
        accountId
      );

      return Object.keys(permissions).length > 0 ? permissions : null;
    } catch (error) {
      console.error('Error getting third-party permissions:', error);
      return null;
    }
  }

  static async getPermissions(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<Record<string, ThirdPartyPermission>> {
    const permissions = await this.getPermissionsFile(
      accessToken,
      metadataFolderId,
      userPnIdentifier,
      accountId
    );
    return permissions || {};
  }

  static async storePermissions(
    accessToken: string,
    metadataFolderId: string,
    _identifier: string,
    permissions: Record<string, ThirdPartyPermission>,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    try {
      const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

      if (await isPortableStorageProvider(normalized)) {
        for (const permission of Object.values(permissions)) {
          await portableTableAppend(
            normalized,
            THIRD_PARTY_PERMISSIONS_SCHEMA,
            permission as unknown as Record<string, unknown>,
            accountId
          );
        }
        return;
      }

      const token: GoogleDriveToken = { access_token: accessToken };
      const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
      const spreadsheetId = await ThirdPartyPermissionsSheetsService.ensureThirdPartyPermissionsSheet(
        token,
        metadataFolderId,
        normalized,
        accountId
      );

      for (const permission of Object.values(permissions)) {
        await ThirdPartyPermissionsSheetsService.addPermission(
          token,
          spreadsheetId,
          permission,
          normalized,
          accountId
        );
      }
    } catch (error) {
      console.error('Error storing third-party permissions:', error);
      throw error;
    }
  }

  static async revokePermission(
    userPnIdentifier: string,
    toolId: string,
    accessToken: string,
    metadataFolderId: string,
    accountId?: string
  ): Promise<void> {
    const normalized = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

    if (await isPortableStorageProvider(normalized)) {
      await portableTableDelete(normalized, THIRD_PARTY_PERMISSIONS_SCHEMA, toolId, accountId);
      return;
    }

    const token: GoogleDriveToken = { access_token: accessToken };
    const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
    const spreadsheetId = await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
      token,
      metadataFolderId,
      normalized,
      accountId
    );
    await ThirdPartyPermissionsSheetsService.revokePermission(
      token,
      spreadsheetId,
      toolId,
      normalized,
      accountId
    );
  }
}
