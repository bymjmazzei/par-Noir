/**
 * Platform registry on operator pN Google Drive (_metadata/platform-registry.xlsx).
 * Source of truth for OAuth approvals and commercial licenses.
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';
import {
  normalizePermissionManifest,
  type IntegratorPermissionManifest
} from '@par-noir/standard-data-points';
import type {
  ApplicationStatus,
  CommercialLicenseStatus,
  LicenseTier,
  LicenseType,
  OAuthClientRegistryStatus,
  PlatformApplication,
  PlatformCommercialLicense,
  PlatformOAuthClientRow
} from './platformRegistryTypes';

const FILE_NAME = 'platform-registry.xlsx';

const TAB_APPLICATIONS = 'Applications';
const TAB_OAUTH_CLIENTS = 'OAuthClients';
const TAB_COMMERCIAL_LICENSES = 'CommercialLicenses';

function parseJsonArray(raw: unknown): string[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(raw: unknown, fallback: T): T {
  if (!raw || !String(raw).trim()) return fallback;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
}

export class PlatformRegistrySheetsService {
  static async createPlatformRegistrySheet(
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
        properties: { title: FILE_NAME },
        sheets: [
          { properties: { title: TAB_APPLICATIONS, gridProperties: { rowCount: 5000, columnCount: 13 } } },
          { properties: { title: TAB_OAUTH_CLIENTS, gridProperties: { rowCount: 5000, columnCount: 13 } } },
          { properties: { title: TAB_COMMERCIAL_LICENSES, gridProperties: { rowCount: 5000, columnCount: 13 } } }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create platform-registry sheet');

    const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
    const currentParents = fileInfo.data.parents || [];
    await drive.files.update({
      fileId: spreadsheetId,
      removeParents: currentParents.join(','),
      addParents: metadataFolderId,
      fields: 'id, parents'
    });

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${TAB_APPLICATIONS}!A1:M1`,
            values: [[
              'Application ID', 'Client ID', 'Name', 'Description', 'Redirect URIs (JSON)', 'Scopes (JSON)',
              'Owner PN ID', 'Status', 'Submitted At', 'Reviewed At', 'Reviewed By PN', 'Notes',
              'Permission Manifest (JSON)'
            ]]
          },
          {
            range: `${TAB_OAUTH_CLIENTS}!A1:M1`,
            values: [[
              'Client ID', 'Name', 'Description', 'Redirect URIs (JSON)', 'Scopes (JSON)', 'Owner PN ID',
              'Status', 'Verified', 'Commercial License ID', 'Approved At', 'Updated At', 'Notes',
              'Permission Manifest (JSON)'
            ]]
          },
          {
            range: `${TAB_COMMERCIAL_LICENSES}!A1:L1`,
            values: [[
              'License ID', 'Grantee PN ID', 'Grantee Client ID', 'Tier', 'Type', 'Scopes (JSON)',
              'Rate Limits (JSON)', 'Status', 'Issued At', 'Expires At', 'Notes', 'Updated At'
            ]]
          }
        ]
      }
    });

    return spreadsheetId;
  }

  static async getSpreadsheetId(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const fileQuery = `name='${FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });
    if (searchResponse.data.files?.length) {
      return searchResponse.data.files[0].id!;
    }
    throw new Error('platform-registry.xlsx not found. Initialize the platform registry from the developer portal.');
  }

  static async listApplications(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    filter?: { status?: ApplicationStatus; ownerPnId?: string }
  ): Promise<PlatformApplication[]> {
    const rows = await this.getRows(token, spreadsheetId, TAB_APPLICATIONS, userPnIdentifier, accountId);
    const out: PlatformApplication[] = [];
    for (const row of rows) {
      if (!row[0]) continue;
      const app: PlatformApplication = {
        applicationId: String(row[0]),
        clientId: String(row[1] || ''),
        name: String(row[2] || ''),
        description: row[3] ? String(row[3]) : undefined,
        redirectUris: parseJsonArray(row[4]),
        scopes: parseJsonArray(row[5]),
        ownerPnId: String(row[6] || ''),
        status: (String(row[7] || 'pending') as ApplicationStatus),
        submittedAt: String(row[8] || ''),
        reviewedAt: row[9] ? String(row[9]) : undefined,
        reviewedByPn: row[10] ? String(row[10]) : undefined,
        notes: row[11] ? String(row[11]) : undefined,
        permissionManifest: normalizePermissionManifest(parseJsonObject(row[12], null), parseJsonArray(row[5]))
      };
      if (filter?.status && app.status !== filter.status) continue;
      if (filter?.ownerPnId && app.ownerPnId !== filter.ownerPnId) continue;
      out.push(app);
    }
    return out;
  }

  static async getApplicationById(
    token: GoogleDriveToken,
    spreadsheetId: string,
    applicationId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<PlatformApplication | null> {
    const apps = await this.listApplications(token, spreadsheetId, userPnIdentifier, accountId);
    return apps.find((a) => a.applicationId === applicationId) ?? null;
  }

  static async appendApplication(
    token: GoogleDriveToken,
    spreadsheetId: string,
    application: PlatformApplication,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${TAB_APPLICATIONS}!A:M`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          application.applicationId,
          application.clientId,
          application.name,
          application.description || '',
          JSON.stringify(application.redirectUris),
          JSON.stringify(application.scopes),
          application.ownerPnId,
          application.status,
          application.submittedAt,
          application.reviewedAt || '',
          application.reviewedByPn || '',
          application.notes || '',
          JSON.stringify(application.permissionManifest || normalizePermissionManifest(null, application.scopes))
        ]]
      }
    });
  }

  static async updateApplication(
    token: GoogleDriveToken,
    spreadsheetId: string,
    application: PlatformApplication,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    await this.upsertRowByKey(
      token,
      spreadsheetId,
      TAB_APPLICATIONS,
      application.applicationId,
      [
        application.applicationId,
        application.clientId,
        application.name,
        application.description || '',
        JSON.stringify(application.redirectUris),
        JSON.stringify(application.scopes),
        application.ownerPnId,
        application.status,
        application.submittedAt,
        application.reviewedAt || '',
        application.reviewedByPn || '',
        application.notes || '',
        JSON.stringify(application.permissionManifest || normalizePermissionManifest(null, application.scopes))
      ],
      userPnIdentifier,
      accountId
    );
  }

  static async listOAuthClients(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<PlatformOAuthClientRow[]> {
    const rows = await this.getRows(token, spreadsheetId, TAB_OAUTH_CLIENTS, userPnIdentifier, accountId);
    const out: PlatformOAuthClientRow[] = [];
    for (const row of rows) {
      if (!row[0]) continue;
      out.push({
        clientId: String(row[0]),
        name: String(row[1] || ''),
        description: row[2] ? String(row[2]) : undefined,
        redirectUris: parseJsonArray(row[3]),
        scopes: parseJsonArray(row[4]),
        ownerPnId: String(row[5] || ''),
        status: (String(row[6] || 'active') as OAuthClientRegistryStatus),
        verified: String(row[7]).toLowerCase() === 'true',
        commercialLicenseId: row[8] ? String(row[8]) : undefined,
        approvedAt: row[9] ? String(row[9]) : undefined,
        updatedAt: String(row[10] || ''),
        notes: row[11] ? String(row[11]) : undefined,
        permissionManifest: normalizePermissionManifest(parseJsonObject(row[12], null), parseJsonArray(row[4]))
      });
    }
    return out;
  }

  static async upsertOAuthClient(
    token: GoogleDriveToken,
    spreadsheetId: string,
    row: PlatformOAuthClientRow,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    await this.upsertRowByKey(
      token,
      spreadsheetId,
      TAB_OAUTH_CLIENTS,
      row.clientId,
      [
        row.clientId,
        row.name,
        row.description || '',
        JSON.stringify(row.redirectUris),
        JSON.stringify(row.scopes),
        row.ownerPnId,
        row.status,
        row.verified ? 'true' : 'false',
        row.commercialLicenseId || '',
        row.approvedAt || '',
        row.updatedAt,
        row.notes || '',
        JSON.stringify(row.permissionManifest || normalizePermissionManifest(null, row.scopes))
      ],
      userPnIdentifier,
      accountId
    );
  }

  static async listCommercialLicenses(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    filter?: { granteePnId?: string; granteeClientId?: string }
  ): Promise<PlatformCommercialLicense[]> {
    const rows = await this.getRows(token, spreadsheetId, TAB_COMMERCIAL_LICENSES, userPnIdentifier, accountId);
    const out: PlatformCommercialLicense[] = [];
    for (const row of rows) {
      if (!row[0]) continue;
      const license: PlatformCommercialLicense = {
        licenseId: String(row[0]),
        granteePnId: String(row[1] || ''),
        granteeClientId: row[2] ? String(row[2]) : undefined,
        tier: (String(row[3] || 'commercial') as LicenseTier),
        type: (String(row[4] || 'annual') as LicenseType),
        scopes: parseJsonArray(row[5]),
        rateLimits: parseJsonObject(row[6], { requestsPerMinute: 60, requestsPerDay: 10000 }),
        status: (String(row[7] || 'active') as CommercialLicenseStatus),
        issuedAt: String(row[8] || ''),
        expiresAt: row[9] ? String(row[9]) : undefined,
        notes: row[10] ? String(row[10]) : undefined,
        updatedAt: String(row[11] || '')
      };
      if (filter?.granteePnId && license.granteePnId !== filter.granteePnId) continue;
      if (filter?.granteeClientId && license.granteeClientId !== filter.granteeClientId) continue;
      out.push(license);
    }
    return out;
  }

  static async upsertCommercialLicense(
    token: GoogleDriveToken,
    spreadsheetId: string,
    license: PlatformCommercialLicense,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    await this.upsertRowByKey(
      token,
      spreadsheetId,
      TAB_COMMERCIAL_LICENSES,
      license.licenseId,
      [
        license.licenseId,
        license.granteePnId,
        license.granteeClientId || '',
        license.tier,
        license.type,
        JSON.stringify(license.scopes),
        JSON.stringify(license.rateLimits),
        license.status,
        license.issuedAt,
        license.expiresAt || '',
        license.notes || '',
        license.updatedAt
      ],
      userPnIdentifier,
      accountId
    );
  }

  static async clientIdTaken(
    token: GoogleDriveToken,
    spreadsheetId: string,
    clientId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const apps = await this.listApplications(token, spreadsheetId, userPnIdentifier, accountId);
    if (apps.some((a) => a.clientId === clientId && a.status !== 'rejected')) return true;
    const clients = await this.listOAuthClients(token, spreadsheetId, userPnIdentifier, accountId);
    return clients.some((c) => c.clientId === clientId && c.status !== 'revoked');
  }

  private static async getRows(
    token: GoogleDriveToken,
    spreadsheetId: string,
    tab: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string[][]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A2:Z`
    });
    return (response.data.values as string[][]) || [];
  }

  private static async upsertRowByKey(
    token: GoogleDriveToken,
    spreadsheetId: string,
    tab: string,
    key: string,
    rowData: string[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A2:Z`
    });
    const rows = (response.data.values as string[][]) || [];
    const existingRowIndex = rows.findIndex((row) => row[0] === key);
    if (existingRowIndex >= 0) {
      const rowNumber = existingRowIndex + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tab}!A${rowNumber}:Z${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: { values: [rowData] }
      });
    }
  }
}
