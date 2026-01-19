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

export class ThirdPartyPermissionsSheetsService {
  private static readonly THIRD_PARTY_PERMISSIONS_FILE_NAME = 'third-party-permissions.xlsx';

  /**
   * Get or create third-party permissions sheet
   */
  static async getOrCreateThirdPartyPermissionsSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing third-party permissions sheet in metadata folder
    const fileQuery = `name='${this.THIRD_PARTY_PERMISSIONS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Also check if file exists elsewhere (might have been created in wrong location)
    const broadQuery = `name='${this.THIRD_PARTY_PERMISSIONS_FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const broadSearchResponse = await drive.files.list({
      q: broadQuery,
      fields: 'files(id,name,parents)',
      pageSize: 5
    });

    // If found elsewhere, move it to metadata folder
    if (broadSearchResponse.data.files && broadSearchResponse.data.files.length > 0) {
      const existingFile = broadSearchResponse.data.files[0];
      const existingFileId = existingFile.id!;
      const existingParents = existingFile.parents || [];
      
      // Move to metadata folder
      await drive.files.update({
        fileId: existingFileId,
        removeParents: existingParents.join(','),
        addParents: metadataFolderId,
        fields: 'id, parents'
      });
      
      return existingFileId;
    }

    // Create new third-party permissions sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.THIRD_PARTY_PERMISSIONS_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Permissions',
              gridProperties: {
                rowCount: 10000,
                columnCount: 12
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create third-party permissions sheet: no ID returned');
    }

    // Get current parents and move to metadata folder (removing root folder)
    const fileInfo = await drive.files.get({
      fileId: spreadsheetId,
      fields: 'parents'
    });
    
    const currentParents = fileInfo.data.parents || [];
    // Remove all current parents and set only metadata folder as parent
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    // Set up headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Permissions!A1:L1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Tool ID', 'Tool Name', 'Tool Description', 'Permissions (JSON)', 'Data Points (JSON)', 'Required Data Points (JSON)', 'Optional Data Points (JSON)', 'Granted At', 'Expires At', 'Status', 'Created At', 'Updated At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Add or update permission
   */
  static async addPermission(
    accessToken: string,
    spreadsheetId: string,
    permission: ThirdPartyPermission
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if permission already exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Permissions!A2:L'
    });

    const rows = response.data.values || [];
    const existingRowIndex = rows.findIndex((row: any[]) => row[0] === permission.toolId);

    const now = new Date().toISOString();
    const rowData = [
      permission.toolId,
      permission.toolName,
      permission.toolDescription,
      JSON.stringify(permission.permissions),
      JSON.stringify(permission.dataPoints),
      JSON.stringify(permission.requiredDataPoints),
      JSON.stringify(permission.optionalDataPoints),
      permission.grantedAt,
      permission.expiresAt || '',
      permission.status,
      now, // Created At (use existing if updating)
      now  // Updated At
    ];

    if (existingRowIndex >= 0) {
      // Update existing row (add 2 because row 1 is header, and array is 0-indexed)
      const rowNumber = existingRowIndex + 2;
      const existingRow = rows[existingRowIndex];
      // Preserve original Created At
      rowData[10] = existingRow[10] || now;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Permissions!A${rowNumber}:L${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Permissions!A:L',
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
    }
  }

  /**
   * Get all permissions
   */
  static async getPermissions(
    accessToken: string,
    spreadsheetId: string
  ): Promise<Record<string, ThirdPartyPermission>> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Permissions!A2:L'
    });

    const rows = response.data.values || [];
    const permissions: Record<string, ThirdPartyPermission> = {};

    for (const row of rows) {
      if (!row[0]) continue; // Skip empty rows

      let permissionsArray: string[] = [];
      let dataPointsArray: string[] = [];
      let requiredDataPointsArray: string[] = [];
      let optionalDataPointsArray: string[] = [];

      try {
        if (row[3]) permissionsArray = JSON.parse(row[3] as string);
        if (row[4]) dataPointsArray = JSON.parse(row[4] as string);
        if (row[5]) requiredDataPointsArray = JSON.parse(row[5] as string);
        if (row[6]) optionalDataPointsArray = JSON.parse(row[6] as string);
      } catch (e) {
        // If JSON parsing fails, use empty arrays
        console.warn('[ThirdPartyPermissionsSheetsService] Failed to parse JSON arrays:', e);
      }

      const permission: ThirdPartyPermission = {
        toolId: row[0] as string,
        toolName: row[1] as string,
        toolDescription: row[2] as string,
        permissions: permissionsArray,
        dataPoints: dataPointsArray,
        requiredDataPoints: requiredDataPointsArray,
        optionalDataPoints: optionalDataPointsArray,
        grantedAt: row[7] as string,
        expiresAt: row[8] ? (row[8] as string) : undefined,
        status: row[9] as ThirdPartyPermission['status']
      };

      permissions[permission.toolId] = permission;
    }

    return permissions;
  }

  /**
   * Get a specific permission by tool ID
   */
  static async getPermission(
    accessToken: string,
    spreadsheetId: string,
    toolId: string
  ): Promise<ThirdPartyPermission | null> {
    const allPermissions = await this.getPermissions(accessToken, spreadsheetId);
    return allPermissions[toolId] || null;
  }

  /**
   * Revoke permission (delete from sheet)
   */
  static async revokePermission(
    accessToken: string,
    spreadsheetId: string,
    toolId: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row with this tool ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Permissions!A2:L'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any[]) => row[0] === toolId);

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
}
