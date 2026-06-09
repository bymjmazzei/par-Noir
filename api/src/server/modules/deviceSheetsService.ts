/**
 * Device registry on Google Drive (_metadata/devices.xlsx + device-policy.json).
 */

import { google } from 'googleapis';
import { defaultDevicePolicy, normalizeDevicePolicy, type DevicePolicy, type DeviceRow } from '@par-noir/device-auth';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

const DEVICE_HEADERS = [
  'deviceId',
  'devicePublicKey',
  'label',
  'deviceType',
  'keyType',
  'status',
  'isPrimary',
  'createdAt',
  'lastSeenAt',
];

const POLICY_FILE = 'device-policy.json';

export class DeviceSheetsService {
  private static readonly FILE_NAME = 'devices.xlsx';

  static async getOrCreateSpreadsheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const q = `name='${this.FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const existing = await drive.files.list({ q, fields: 'files(id)' });
    if (existing.data.files?.[0]?.id) {
      return existing.data.files[0].id;
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.FILE_NAME },
        sheets: [
          { properties: { title: 'Devices', gridProperties: { rowCount: 50, columnCount: 10 } } },
        ],
      },
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create devices spreadsheet');

    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Devices!A1:I1',
      valueInputOption: 'RAW',
      requestBody: { values: [DEVICE_HEADERS] },
    });

    return spreadsheetId;
  }

  private static parseRow(r: string[]): DeviceRow {
    return {
      deviceId: r[0] || '',
      devicePublicKey: r[1] || '',
      label: r[2] || '',
      deviceType: (r[3] || 'other') as DeviceRow['deviceType'],
      keyType: (r[4] || 'software') as DeviceRow['keyType'],
      status: (r[5] === 'revoked' ? 'revoked' : 'active') as DeviceRow['status'],
      isPrimary: r[6] === 'true',
      createdAt: r[7] || '',
      lastSeenAt: r[8] || '',
    };
  }

  private static rowToValues(row: DeviceRow): string[] {
    return [
      row.deviceId,
      row.devicePublicKey,
      row.label,
      row.deviceType,
      row.keyType,
      row.status,
      row.isPrimary ? 'true' : 'false',
      row.createdAt,
      row.lastSeenAt,
    ];
  }

  static async listDevices(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    includeRevoked = false
  ): Promise<DeviceRow[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Devices!A2:I',
    });
    return (res.data.values || [])
      .map((r) => this.parseRow(r))
      .filter((d) => d.deviceId && (includeRevoked || d.status === 'active'));
  }

  static async getDeviceById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    deviceId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<DeviceRow | null> {
    const devices = await this.listDevices(token, spreadsheetId, userPnIdentifier, accountId, true);
    return devices.find((d) => d.deviceId === deviceId) || null;
  }

  static async upsertDevice(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: DeviceRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Devices!A2:I',
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((r) => r[0] === row.deviceId);
    const values = [this.rowToValues(row)];
    if (idx >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Devices!A${idx + 2}:I${idx + 2}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Devices!A:I',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
    }
  }

  static async updateLastSeen(
    token: GoogleDriveToken,
    spreadsheetId: string,
    deviceId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const row = await this.getDeviceById(token, spreadsheetId, deviceId, userPnIdentifier, accountId);
    if (!row || row.status !== 'active') return;
    await this.upsertDevice(
      token,
      spreadsheetId,
      { ...row, lastSeenAt: new Date().toISOString() },
      userPnIdentifier,
      accountId
    );
  }

  static async getPolicyFileId(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const q = `name='${POLICY_FILE}' and '${metadataFolderId}' in parents and trashed=false`;
    const res = await drive.files.list({ q, fields: 'files(id)' });
    return res.data.files?.[0]?.id || null;
  }

  static async readPolicy(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<DevicePolicy> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const fileId = await this.getPolicyFileId(token, metadataFolderId, userPnIdentifier, accountId);
    if (!fileId) return defaultDevicePolicy();
    try {
      const res = await drive.files.get({ fileId, alt: 'media' });
      const raw = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      return normalizeDevicePolicy(raw);
    } catch {
      return defaultDevicePolicy();
    }
  }

  static async writePolicy(
    token: GoogleDriveToken,
    metadataFolderId: string,
    policy: DevicePolicy,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const content = JSON.stringify(policy, null, 2);
    const fileId = await this.getPolicyFileId(token, metadataFolderId, userPnIdentifier, accountId);
    if (fileId) {
      await drive.files.update({
        fileId,
        media: { mimeType: 'application/json', body: content },
      });
      return;
    }
    await drive.files.create({
      requestBody: {
        name: POLICY_FILE,
        parents: [metadataFolderId],
        mimeType: 'application/json',
      },
      media: { mimeType: 'application/json', body: content },
    });
  }
}
