/**
 * Group messaging sheets — owner metadata + per-member wrapped chatKey.
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export type GroupAccessRole = 'readWrite' | 'readOnly';

export interface GroupMemberInput {
  memberPnIdentifier: string;
  accessRole: GroupAccessRole;
  wrappedChatKey: string;
  conversationSpreadsheetId?: string;
}

export interface GroupRecord {
  groupId: string;
  ownerPnIdentifier: string;
  title: string;
  createdAt: string;
  memberPnIdentifier: string;
  accessRole: GroupAccessRole;
  wrappedChatKey: string;
  conversationSpreadsheetId?: string;
}

export class GroupSheetsService {
  private static readonly GROUPS_FILE_NAME = 'groups.xlsx';

  static async getOrCreateGroupsSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });
    const query = `name='${this.GROUPS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
    const list = await drive.files.list({ q: query, fields: 'files(id)', pageSize: 1 });
    if (list.data.files?.[0]?.id) {
      return list.data.files[0].id;
    }
    const sheets = google.sheets({ version: 'v4', auth });
    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: this.GROUPS_FILE_NAME },
        sheets: [
          {
            properties: {
              title: 'Groups',
              gridProperties: { rowCount: 10000, columnCount: 8 }
            }
          }
        ]
      }
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create groups sheet');
    await drive.files.update({
      fileId: spreadsheetId,
      addParents: metadataFolderId,
      fields: 'id'
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Groups!A1:H1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'groupId',
          'ownerPnIdentifier',
          'title',
          'createdAt',
          'memberPnIdentifier',
          'accessRole',
          'wrappedChatKey',
          'conversationSpreadsheetId'
        ]]
      }
    });
    return spreadsheetId;
  }

  static async appendGroupMembers(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    ownerPnIdentifier: string,
    title: string,
    createdAt: string,
    members: GroupMemberInput[],
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const rows = members.map((m) => [
      groupId,
      ownerPnIdentifier,
      title,
      createdAt,
      m.memberPnIdentifier,
      m.accessRole,
      m.wrappedChatKey,
      m.conversationSpreadsheetId || ''
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Groups!A:H',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });
  }

  static async listGroupsForUser(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<GroupRecord[]> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    return rows
      .filter((row) => row[4] === userPnIdentifier || row[1] === userPnIdentifier)
      .map((row) => ({
        groupId: row[0] || '',
        ownerPnIdentifier: row[1] || '',
        title: row[2] || '',
        createdAt: row[3] || '',
        memberPnIdentifier: row[4] || '',
        accessRole: (row[5] === 'readOnly' ? 'readOnly' : 'readWrite') as GroupAccessRole,
        wrappedChatKey: row[6] || '',
        conversationSpreadsheetId: row[7] || undefined
      }));
  }

  static async updateMemberAccessRole(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    memberPnIdentifier: string,
    accessRole: GroupAccessRole,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((row) => row[0] === groupId && row[4] === memberPnIdentifier);
    if (idx === -1) return false;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Groups!F${idx + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[accessRole]] }
    });
    return true;
  }

  /** Unique members for a group from owner's groups sheet. */
  static async getGroupMembers(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<GroupMemberInput[]> {
    const rows = await this.listGroupsForUser(token, spreadsheetId, userPnIdentifier, accountId);
    const byMember = new Map<string, GroupMemberInput>();
    for (const row of rows) {
      if (row.groupId !== groupId) continue;
      byMember.set(row.memberPnIdentifier, {
        memberPnIdentifier: row.memberPnIdentifier,
        accessRole: row.accessRole,
        wrappedChatKey: row.wrappedChatKey,
        conversationSpreadsheetId: row.conversationSpreadsheetId
      });
    }
    return Array.from(byMember.values());
  }

  static async getMemberRow(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    memberPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<GroupRecord | null> {
    const rows = await this.listGroupsForUser(token, spreadsheetId, userPnIdentifier, accountId);
    return rows.find((r) => r.groupId === groupId && r.memberPnIdentifier === memberPnIdentifier) || null;
  }

  static async updateConversationSpreadsheetId(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    memberPnIdentifier: string,
    conversationSpreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    const idx = rows.findIndex((row) => row[0] === groupId && row[4] === memberPnIdentifier);
    if (idx === -1) return false;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Groups!H${idx + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[conversationSpreadsheetId]] }
    });
    return true;
  }

  static async updateGroupTitle(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    title: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === groupId) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Groups!C${i + 2}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[title]] }
        });
      }
    }
  }

  static async appendSingleMember(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    ownerPnIdentifier: string,
    title: string,
    createdAt: string,
    member: GroupMemberInput,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    await this.appendGroupMembers(
      token,
      spreadsheetId,
      groupId,
      ownerPnIdentifier,
      title,
      createdAt,
      [member],
      userPnIdentifier,
      accountId
    );
  }

  static async removeGroupMember(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    memberPnIdentifier: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    const kept = rows.filter((row) => !(row[0] === groupId && row[4] === memberPnIdentifier));
    if (kept.length === rows.length) return false;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    if (kept.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Groups!A2:H${kept.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: kept }
      });
    }
    return true;
  }

  /** Replace wrapped keys for remaining members after key rotation. */
  static async rotateGroupMemberKeys(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    removedMemberPn: string,
    keyRotation: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: GroupAccessRole }>,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    const rows = res.data.values || [];
    const otherGroups = rows.filter((row) => row[0] !== groupId);
    const groupRows = rows.filter((row) => row[0] === groupId);
    const template = groupRows[0];
    if (!template) return false;

    const removed = groupRows.some((row) => row[4] === removedMemberPn);
    if (!removed) return false;

    const rotatedRows = keyRotation.map((m) => {
      const existing = groupRows.find((row) => row[4] === m.memberPnIdentifier);
      return [
        groupId,
        template[1],
        template[2],
        template[3],
        m.memberPnIdentifier,
        m.accessRole,
        m.wrappedChatKey,
        existing?.[7] || ''
      ];
    });

    const kept = [...otherGroups, ...rotatedRows];
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Groups!A2:H'
    });
    if (kept.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Groups!A2:H${kept.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: kept }
      });
    }
    return true;
  }

  /** Replace wrapped keys for all members during identity re-key (no member removal). */
  static async rewrapGroupKeysForMigration(
    token: GoogleDriveToken,
    spreadsheetId: string,
    groupId: string,
    successorOwnerPnIdentifier: string,
    keyRotation: Array<{ memberPnIdentifier: string; wrappedChatKey: string; accessRole: GroupAccessRole }>,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<boolean> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Groups!A2:H',
    });
    const rows = res.data.values || [];
    const otherGroups = rows.filter((row) => row[0] !== groupId);
    const groupRows = rows.filter((row) => row[0] === groupId);
    const template = groupRows[0];
    if (!template) return false;

    const rotatedRows = keyRotation.map((m) => {
      const existing = groupRows.find((row) => row[4] === m.memberPnIdentifier);
      return [
        groupId,
        successorOwnerPnIdentifier,
        template[2],
        template[3],
        m.memberPnIdentifier,
        m.accessRole,
        m.wrappedChatKey,
        existing?.[7] || '',
      ];
    });

    const kept = [...otherGroups, ...rotatedRows];
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Groups!A2:H',
    });
    if (kept.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Groups!A2:H${kept.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: kept },
      });
    }
    return true;
  }
}
