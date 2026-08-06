/**
 * Third Party Permissions Sheets Service
 * Manages third-party permissions in Google Sheets table
 * Replaces third-party-permissions.json for better scalability
 * Stored in Google Drive (decentralized) - users own their data
 *
 * Data Points (JSON) column: list of data point IDs that REFERENCE zkp-data-points by ID.
 * For ZKP types, "user has generated" comes from ZKPDataPointsService/zkp-data-points; for OAuth scopes
 * (openid, profile, cloud:read) there is no zkp row.
 */

import { google } from 'googleapis';
import { ThirdPartyPermission } from './thirdPartyPermissionsService';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export class ThirdPartyPermissionsSheetsService {
  private static readonly THIRD_PARTY_PERMISSIONS_FILE_NAME = 'third-party-permissions.xlsx';
  private static readonly PERMISSION_COLUMN_COUNT = 14;
  private static readonly PERMISSION_HEADERS = [
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
  ];

  /** Normalize status from sheet cells (trim, lowercase). */
  static normalizePermissionStatus(status: unknown): ThirdPartyPermission['status'] | null {
    if (typeof status !== 'string' || !status.trim()) return null;
    const normalized = status.trim().toLowerCase();
    if (normalized === 'active' || normalized === 'pending' || normalized === 'revoked') {
      return normalized;
    }
    return null;
  }

  /**
   * Parse a sheet row; tolerates legacy misaligned rows where Tool ID is not in column A.
   */
  static parsePermissionRow(row: string[]): ThirdPartyPermission | null {
    if (!row?.length) return null;

    let offset = 0;
    if (!row[0] || !String(row[0]).trim()) {
      const toolIdx = row.findIndex((cell) => {
        if (typeof cell !== 'string' || !cell.trim()) return false;
        const t = cell.trim();
        if (t.startsWith('[') || t.startsWith('{')) return false;
        return /^[\w-]+$/.test(t);
      });
      if (toolIdx < 0) return null;
      offset = toolIdx;
    }

    const cells = row.slice(offset);
    const toolId = cells[0] ? String(cells[0]).trim() : '';
    if (!toolId) return null;

    let permissionsArray: string[] = [];
    let dataPointsArray: string[] = [];
    let requiredDataPointsArray: string[] = [];
    let optionalDataPointsArray: string[] = [];
    let dataPointLevels: ThirdPartyPermission['dataPointLevels'];

    try {
      if (cells[3]) permissionsArray = JSON.parse(cells[3] as string);
      if (cells[4]) dataPointsArray = JSON.parse(cells[4] as string);
      if (cells[5]) requiredDataPointsArray = JSON.parse(cells[5] as string);
      if (cells[6]) optionalDataPointsArray = JSON.parse(cells[6] as string);
      if (cells[13]) {
        const parsed = JSON.parse(cells[13] as string);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          dataPointLevels = parsed as ThirdPartyPermission['dataPointLevels'];
        }
      }
    } catch {
      /* use empty arrays */
    }

    const status = this.normalizePermissionStatus(cells[9]) ?? 'pending';
    const integratorFolderId =
      cells[12] && String(cells[12]).trim() ? String(cells[12]).trim() : undefined;

    return {
      toolId,
      toolName: (cells[1] as string) || toolId,
      toolDescription: (cells[2] as string) || '',
      permissions: permissionsArray,
      dataPoints: dataPointsArray,
      requiredDataPoints: requiredDataPointsArray,
      optionalDataPoints: optionalDataPointsArray,
      dataPointLevels,
      grantedAt: (cells[7] as string) || new Date().toISOString(),
      expiresAt: cells[8] ? (cells[8] as string) : undefined,
      status,
      integratorFolderId,
    };
  }

  private static shouldPreferPermission(
    candidate: ThirdPartyPermission,
    incumbent: ThirdPartyPermission
  ): boolean {
    const candStatus = this.normalizePermissionStatus(candidate.status);
    const incStatus = this.normalizePermissionStatus(incumbent.status);
    if (candStatus === 'active' && incStatus !== 'active') return true;
    if (incStatus === 'active' && candStatus !== 'active') return false;
    return (candidate.grantedAt || '') >= (incumbent.grantedAt || '');
  }

  /**
   * Create third-party permissions sheet in _metadata. Used only at Drive connection init.
   */
  static async createThirdPartyPermissionsSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.THIRD_PARTY_PERMISSIONS_FILE_NAME },
        sheets: [{
          properties: {
            title: 'Permissions',
            gridProperties: { rowCount: 10000, columnCount: this.PERMISSION_COLUMN_COUNT },
          },
        }],
      },
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create third-party permissions sheet: no ID returned');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Permissions!A1:N1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [this.PERMISSION_HEADERS],
      },
    });

    return spreadsheetId;
  }

  /**
   * Get third-party permissions sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getThirdPartyPermissionsSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.THIRD_PARTY_PERMISSIONS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error('Sheet not found. Your Google Drive may be corrupted. Please re-initialize Google Drive in the dashboard (Storage settings).');
  }

  /**
   * Return permissions sheet id, creating third-party-permissions.xlsx when missing.
   * OAuth token exchange may persist grants before dashboard re-init runs.
   */
  static async ensureThirdPartyPermissionsSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    try {
      return await this.getThirdPartyPermissionsSheet(token, metadataFolderId, userPnIdentifier, accountId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('Sheet not found') && !msg.toLowerCase().includes('not found')) {
        throw error;
      }
      return await this.createThirdPartyPermissionsSheet(token, metadataFolderId, userPnIdentifier, accountId);
    }
  }

  /**
   * Upsert one permission and rewrite the sheet (dedupes misaligned duplicate rows).
   */
  static async addPermission(
    token: GoogleDriveToken,
    spreadsheetId: string,
    permission: ThirdPartyPermission,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const existing = await this.getPermissions(token, spreadsheetId, userPnIdentifier, accountId);
    const prev = existing[permission.toolId];
    const merged: ThirdPartyPermission = {
      ...permission,
      grantedAt: prev?.grantedAt || permission.grantedAt,
      status: permission.status,
    };
    await this.setAllPermissions(
      token,
      spreadsheetId,
      Object.values({ ...existing, [permission.toolId]: merged }),
      userPnIdentifier,
      accountId
    );
  }

  /**
   * Get all permissions
   */
  static async getPermissions(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<Record<string, ThirdPartyPermission>> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Permissions!A2:N'
    });

    const rows = response.data.values || [];
    const permissions: Record<string, ThirdPartyPermission> = {};

    for (const row of rows) {
      const permission = this.parsePermissionRow(row);
      if (!permission) continue;
      const incumbent = permissions[permission.toolId];
      if (!incumbent || this.shouldPreferPermission(permission, incumbent)) {
        permissions[permission.toolId] = permission;
      }
    }

    return permissions;
  }

  /**
   * Get a specific permission by tool ID
   */
  static async getPermission(
    token: GoogleDriveToken,
    spreadsheetId: string,
    toolId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<ThirdPartyPermission | null> {
    const allPermissions = await this.getPermissions(token, spreadsheetId, userPnIdentifier, accountId);
    return allPermissions[toolId] || null;
  }

  /**
   * Revoke permission (delete from sheet)
   */
  static async revokePermission(
    token: GoogleDriveToken,
    spreadsheetId: string,
    toolId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row with this tool ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Permissions!A2:N'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: string[]) => {
      const parsed = this.parsePermissionRow(row);
      return parsed?.toolId === toolId;
    });

    if (rowIndex < 0) {
      return; // Permission not found
    }

    // Delete the row (add 2 because row 1 is header, and array is 0-indexed)
    const rowNumber = rowIndex + 2;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // First sheet
                dimension: 'ROWS',
                startIndex: rowNumber - 1, // 0-indexed
                endIndex: rowNumber
              }
            }
          }
        ]
      }
    });
  }

  static async setAllPermissions(
    token: GoogleDriveToken,
    spreadsheetId: string,
    permissions: ThirdPartyPermission[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: 'Permissions!A2:N' });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Permissions!A1:N1',
      valueInputOption: 'RAW',
      requestBody: { values: [this.PERMISSION_HEADERS] },
    });
    if (permissions.length === 0) return;
    const now = new Date().toISOString();
    const rows = permissions.map((p) => [
      p.toolId,
      p.toolName,
      p.toolDescription,
      JSON.stringify(p.permissions),
      JSON.stringify(p.dataPoints),
      JSON.stringify(p.requiredDataPoints),
      JSON.stringify(p.optionalDataPoints),
      p.grantedAt,
      p.expiresAt ?? '',
      p.status,
      p.grantedAt,
      now,
      p.integratorFolderId ?? '',
      JSON.stringify(p.dataPointLevels ?? {}),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Permissions!A2:N${permissions.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }
}
