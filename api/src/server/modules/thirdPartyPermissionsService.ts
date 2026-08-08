/**
 * Third Party Permissions Service
 * Stores permissions via UserOwnedTableStore (Google Sheets or portable SQLite).
 */

import type { DataPointLevels } from '@par-noir/standard-data-points';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableStorageProvider } from './storage/storageProviderUtils';
import {
  portableTableAppend,
  portableTableDelete,
  portableTableScan
} from './storage/portableTableService';
import { THIRD_PARTY_PERMISSIONS_SCHEMA } from './storage/tableSchemas';
import { setCachedGrant, invalidateCachedGrant } from './oauthPermissionCache';

export interface ThirdPartyPermission {
  toolId: string;
  toolName: string;
  toolDescription: string;
  permissions: string[];
  dataPoints: string[];
  requiredDataPoints: string[];
  optionalDataPoints: string[];
  /** Min verification level per data point id. Omitted id ⇒ attested. */
  dataPointLevels?: DataPointLevels;
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
    accountId?: string,
    spreadsheetId?: string
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
      const resolvedSpreadsheetId =
        spreadsheetId ||
        (await ThirdPartyPermissionsSheetsService.getThirdPartyPermissionsSheet(
          token,
          metadataFolderId,
          normalized,
          accountId
        ));

      const permissions = await ThirdPartyPermissionsSheetsService.getPermissions(
        token,
        resolvedSpreadsheetId,
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
    accountId?: string,
    spreadsheetId?: string
  ): Promise<Record<string, ThirdPartyPermission>> {
    const permissions = await this.getPermissionsFile(
      accessToken,
      metadataFolderId,
      userPnIdentifier,
      accountId,
      spreadsheetId
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
        await this.syncGrantHints(normalized, permissions);
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

      const existing = await ThirdPartyPermissionsSheetsService.getPermissions(
        token,
        spreadsheetId,
        normalized,
        accountId
      );
      const merged = { ...existing, ...permissions };
      await ThirdPartyPermissionsSheetsService.setAllPermissions(
        token,
        spreadsheetId,
        Object.values(merged),
        normalized,
        accountId
      );
      await this.syncGrantHints(normalized, permissions);
    } catch (error) {
      console.error('Error storing third-party permissions:', error);
      throw error;
    }
  }

  /**
   * Keep consent-skip hints in step with what was just written. A revoked grant
   * must drop its hint, or the next unlock would skip consent on a grant the
   * user just withdrew.
   */
  private static async syncGrantHints(
    normalizedPn: string,
    permissions: Record<string, ThirdPartyPermission>
  ): Promise<void> {
    for (const [toolId, permission] of Object.entries(permissions)) {
      if (permission.status === 'active') {
        await setCachedGrant(toolId, normalizedPn, {
          dataPoints: permission.dataPoints || [],
          consideredDataPoints: [
            ...new Set([
              ...(permission.requiredDataPoints || []),
              ...(permission.optionalDataPoints || []),
            ]),
          ],
        });
      } else {
        await invalidateCachedGrant(toolId, normalizedPn);
      }
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
      await invalidateCachedGrant(toolId, normalized);
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
    await invalidateCachedGrant(toolId, normalized);
  }
}
