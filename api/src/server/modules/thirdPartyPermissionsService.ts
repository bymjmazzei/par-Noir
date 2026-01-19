/**
 * Third Party Permissions Service
 * Manages third-party tool permissions for users
 * Stores permissions in Google Sheets (replaces third-party-permissions.json for better scalability)
 * Stored in Google Drive (decentralized) - users own their data
 *
 * Connection to zkp-data-points (Master):
 * - dataPoints are data point IDs that REFERENCE zkp-data-points by ID. For ZKP types (e.g. age_attestation),
 *   "user has generated" is determined by ZKPDataPointsService / the Data Points sheet. For OAuth scopes
 *   (openid, profile, cloud:read) there is no zkp row; access is determined only by dataPoints/permissions.
 * - To serve a ZKP proof for X: (X in tool's dataPoints) AND (zkp-data-points has a row for X via ZKPDataPointsService).
 */

export interface ThirdPartyPermission {
  toolId: string;
  toolName: string;
  toolDescription: string;
  permissions: string[];
  /** Data point IDs the user has granted to this tool. For ZKP types these reference zkp-data-points by ID; for OAuth scopes (openid, profile, cloud:read) they are not in zkp-data-points. */
  dataPoints: string[];
  requiredDataPoints: string[]; // Data points marked as required by the tool
  optionalDataPoints: string[]; // Data points marked as optional by the tool
  grantedAt: string;
  expiresAt?: string;
  status: 'active' | 'pending' | 'revoked';
}

export interface ThirdPartyPermissionsFile {
  identifier: string;
  updatedAt: string;
  permissions: Record<string, ThirdPartyPermission>;
}

export class ThirdPartyPermissionsService {
  /**
   * Get third-party permissions from Google Sheets
   * Returns all permissions as a Record (backward compatibility method name)
   */
  static async getPermissionsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ThirdPartyPermission> | null> {
    try {
      const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
      const spreadsheetId = await ThirdPartyPermissionsSheetsService.getOrCreateThirdPartyPermissionsSheet(
        accessToken,
        metadataFolderId
      );
      
      const permissions = await ThirdPartyPermissionsSheetsService.getPermissions(
        accessToken,
        spreadsheetId
      );
      
      return Object.keys(permissions).length > 0 ? permissions : null;
    } catch (error) {
      console.error('Error getting third-party permissions from sheets:', error);
      return null;
    }
  }

  /**
   * Get all third-party permissions for a user
   */
  static async getPermissions(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ThirdPartyPermission>> {
    const permissions = await this.getPermissionsFile(accessToken, metadataFolderId);
    return permissions || {};
  }

  /**
   * Store or update third-party permissions
   */
  static async storePermissions(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    permissions: Record<string, ThirdPartyPermission>
  ): Promise<void> {
    try {
      const { ThirdPartyPermissionsSheetsService } = await import('./thirdPartyPermissionsSheetsService');
      const spreadsheetId = await ThirdPartyPermissionsSheetsService.getOrCreateThirdPartyPermissionsSheet(
        accessToken,
        metadataFolderId
      );
      
      // Store each permission
      for (const permission of Object.values(permissions)) {
        await ThirdPartyPermissionsSheetsService.addPermission(
          accessToken,
          spreadsheetId,
          permission
        );
      }
      
      console.log('Successfully stored third-party permissions in sheets');
    } catch (error) {
      console.error('Error storing third-party permissions in sheets:', error);
      throw error;
    }
  }
}

