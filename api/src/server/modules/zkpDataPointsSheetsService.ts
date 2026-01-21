/**
 * ZKP Data Points Sheets Service
 * Manages ZKP data points in Google Sheets table
 * Replaces zkp-data-points.json for better scalability
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import { ZKPDataPoint } from './zkpDataPointsService';

export class ZKPDataPointsSheetsService {
  private static readonly ZKP_DATA_POINTS_FILE_NAME = 'zkp-data-points.xlsx';

  /**
   * Create ZKP data points sheet in _metadata. Used only at Drive connection init.
   */
  static async createZKPDataPointsSheet(accessToken: string, metadataFolderId: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.ZKP_DATA_POINTS_FILE_NAME },
        sheets: [{ properties: { title: 'Data Points', gridProperties: { rowCount: 10000, columnCount: 12 } } }]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create ZKP data points sheet: no ID returned');

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
      range: 'Data Points!A1:L1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Data Point ID', 'Proof Type', 'ZKP Proof', 'Signature', 'Verified At', 'Expires At', 'Verification Level', 'Provider', 'Fraud Prevention Score', 'Encrypted User Data', 'Created At', 'Updated At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get ZKP data points sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getOrCreateZKPDataPointsSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='${this.ZKP_DATA_POINTS_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    throw new Error(`${this.ZKP_DATA_POINTS_FILE_NAME} not found in _metadata. Ensure Drive is initialized (connect and initialize in dashboard).`);
  }

  /**
   * Add or update ZKP data point
   */
  static async addZKPDataPoint(
    accessToken: string,
    spreadsheetId: string,
    dataPoint: ZKPDataPoint
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Check if data point already exists
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Data Points!A2:L'
    });

    const rows = response.data.values || [];
    const existingRowIndex = rows.findIndex((row: any[]) => row[0] === dataPoint.dataPointId);

    const now = new Date().toISOString();
    const rowData = [
      dataPoint.dataPointId,
      dataPoint.proofType,
      dataPoint.zkpProof,
      dataPoint.signature,
      dataPoint.verifiedAt,
      dataPoint.expiresAt || '',
      dataPoint.verificationLevel,
      dataPoint.metadata.provider,
      dataPoint.metadata.fraudPreventionScore?.toString() || '',
      dataPoint.encryptedUserData || '',
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
        range: `Data Points!A${rowNumber}:L${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Data Points!A:L',
        valueInputOption: 'RAW',
        requestBody: {
          values: [rowData]
        }
      });
    }
  }

  /**
   * Get all ZKP data points
   */
  static async getZKPDataPoints(
    accessToken: string,
    spreadsheetId: string
  ): Promise<Record<string, ZKPDataPoint>> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Data Points!A2:L'
    });

    const rows = response.data.values || [];
    const dataPoints: Record<string, ZKPDataPoint> = {};

    for (const row of rows) {
      if (!row[0]) continue; // Skip empty rows

      const fraudPreventionScore = row[8] ? parseFloat(row[8] as string) : undefined;

      const dataPoint: ZKPDataPoint = {
        dataPointId: row[0] as string,
        proofType: row[1] as ZKPDataPoint['proofType'],
        zkpProof: row[2] as string,
        signature: row[3] as string,
        verifiedAt: row[4] as string,
        expiresAt: row[5] ? (row[5] as string) : undefined,
        verificationLevel: row[6] as ZKPDataPoint['verificationLevel'],
        metadata: {
          provider: row[7] as string,
          fraudPreventionScore
        },
        encryptedUserData: row[9] ? (row[9] as string) : undefined
      };

      dataPoints[dataPoint.dataPointId] = dataPoint;
    }

    return dataPoints;
  }

  /**
   * Get a specific ZKP data point by ID
   */
  static async getZKPDataPoint(
    accessToken: string,
    spreadsheetId: string,
    dataPointId: string
  ): Promise<ZKPDataPoint | null> {
    const allDataPoints = await this.getZKPDataPoints(accessToken, spreadsheetId);
    return allDataPoints[dataPointId] || null;
  }

  /**
   * Delete a ZKP data point
   */
  static async deleteZKPDataPoint(
    accessToken: string,
    spreadsheetId: string,
    dataPointId: string
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });

    // Find the row with this data point ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Data Points!A2:L'
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex((row: any[]) => row[0] === dataPointId);

    if (rowIndex < 0) {
      return; // Data point not found
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
