/**
 * Preferences Sheets Service
 * Manages preference interaction logging in Google Sheets table
 * Logs all preference interactions while preferences.json maintains current state
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';
import { GoogleOAuth2Helper, GoogleDriveToken } from './googleOAuth2Helper';

export type PreferenceType = 
  | 'tag_preference'
  | 'curated_feed_preferences'
  | 'display_name'
  | 'profile_image'
  | 'subscribed_feed_ids'
  | 'blocked_categories'
  | 'subscribed_subjects'
  | 'blocked_subjects'
  | 'me_page_sort_order'
  | 'curation_card_interaction';

export type PreferenceActionType = 
  | 'add'
  | 'update'
  | 'remove'
  | 'swipe_like'
  | 'swipe_dislike'
  | 'preference_tile_yes'
  | 'preference_tile_no'
  | 'explicit_setting';

export interface PreferenceInteraction {
  interaction_id: string;
  user_did?: string; // Legacy field for backward compatibility
  user_pn_identifier?: string; // New standard field
  preference_type: PreferenceType;
  action_type: PreferenceActionType;
  previous_value?: string; // JSON string
  new_value?: string; // JSON string
  tag_id?: string;
  source_file_id?: string;
  question_id?: string; // For curation cards
  metadata?: string; // JSON string
  created_at: string;
}

export class PreferencesSheetsService {
  private static readonly PREFERENCES_FILE_NAME = 'preferences.xlsx';

  /**
   * Create preferences sheet in _metadata with both Interactions and Current. Used only at Drive connection init.
   */
  static async createPreferencesSheet(
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
        properties: { title: this.PREFERENCES_FILE_NAME.replace('.xlsx', '') },
        sheets: [
          { properties: { title: 'Interactions', gridProperties: { rowCount: 100000, columnCount: 11 } } },
          { properties: { title: 'Current', gridProperties: { rowCount: 1000, columnCount: 2 } } }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) throw new Error('Failed to create preferences sheet: no ID returned');

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
      range: 'Interactions!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Interaction ID', 'User DID', 'Preference Type', 'Action Type', 'Previous Value (JSON)', 'New Value (JSON)', 'Tag ID', 'Source File ID', 'Question ID', 'Metadata (JSON)', 'Created At']]
      }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Current!A1:B1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Key', 'Value (JSON)']] }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Current!A2:B2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['preferences', JSON.stringify({ identifier: '', updatedAt: new Date().toISOString(), tagPreferences: [] })]]
      }
    });

    return spreadsheetId;
  }

  /**
   * Get preferences sheet. Scoped search only; throws if not found.
   * Created at Drive connection init; this does not create, move, or delete.
   */
  static async getPreferencesSheet(
    token: GoogleDriveToken,
    metadataFolderId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<string> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const drive = google.drive({ version: 'v3', auth });

    const fileQuery = `name='preferences' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
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
   * Append preference interaction to sheet
   */
  static async appendPreferenceInteraction(
    token: GoogleDriveToken,
    spreadsheetId: string,
    interaction: PreferenceInteraction,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Interactions!A:K',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          interaction.interaction_id,
          interaction.user_did,
          interaction.preference_type,
          interaction.action_type,
          interaction.previous_value || '',
          interaction.new_value || '',
          interaction.tag_id || '',
          interaction.source_file_id || '',
          interaction.question_id || '',
          interaction.metadata ? JSON.stringify(interaction.metadata) : '',
          interaction.created_at
        ]]
      }
    });
  }

  /**
   * Get preference interactions from sheet
   */
  static async getPreferenceInteractions(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined,
    options?: {
      limit?: number;
      offset?: number;
      preferenceType?: PreferenceType;
      userPnIdentifier?: string;
    }
  ): Promise<{ interactions: PreferenceInteraction[]; total: number }> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    // Get all interactions (skip header row)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Interactions!A2:K'
    });

    const rows = response.data.values || [];
    let interactions: PreferenceInteraction[] = rows.map(row => {
      let metadata: any = undefined;
      try {
        if (row[9]) {
          metadata = JSON.parse(row[9]);
        }
      } catch (e) {
        // If metadata is not valid JSON, leave as undefined
      }

      return {
        interaction_id: row[0] || '',
        user_did: row[1] || '',
        preference_type: row[2] as PreferenceType,
        action_type: row[3] as PreferenceActionType,
        previous_value: row[4] || undefined,
        new_value: row[5] || undefined,
        tag_id: row[6] || undefined,
        source_file_id: row[7] || undefined,
        question_id: row[8] || undefined,
        metadata,
        created_at: row[10] || new Date().toISOString()
      };
    });

    // Filter by preference type if specified
    if (options?.preferenceType) {
      interactions = interactions.filter(i => i.preference_type === options.preferenceType);
    }

    // Filter by user DID if specified
    if (options?.userPnIdentifier) {
      interactions = interactions.filter(i => i.user_did === options.userPnIdentifier);
    }

    // Sort by created_at descending (most recent first)
    interactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = interactions.length;

    // Apply pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const paginatedInteractions = interactions.slice(offset, offset + limit);

    return {
      interactions: paginatedInteractions,
      total
    };
  }

  /**
   * Get current preferences from "Current" sheet
   */
  static async getCurrentPreferences(
    token: GoogleDriveToken,
    spreadsheetId: string,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<any | null> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Read the Current sheet
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Current!A2:B' // Skip header row
      });

      const rows = response.data.values || [];
      
      // Find the "preferences" row
      const preferencesRow = rows.find(row => row[0] === 'preferences');
      if (!preferencesRow || !preferencesRow[1]) {
        return null;
      }

      // Parse JSON value
      try {
        return JSON.parse(preferencesRow[1]);
      } catch (e) {
        console.error('Failed to parse current preferences JSON:', e);
        return null;
      }
    } catch (error) {
      console.error('Error reading current preferences from sheet:', error);
      return null;
    }
  }

  /**
   * Update current preferences in "Current" sheet
   */
  static async updateCurrentPreferences(
    token: GoogleDriveToken,
    spreadsheetId: string,
    preferences: any,
    userPnIdentifier: string,
    accountId: string | undefined
  ): Promise<void> {
    const auth = GoogleOAuth2Helper.createClient(token, userPnIdentifier, accountId);
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // First, check if "preferences" row exists
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Current!A2:B'
      });

      const rows = response.data.values || [];
      const preferencesRowIndex = rows.findIndex(row => row[0] === 'preferences');
      
      const preferencesJson = JSON.stringify(preferences);
      
      if (preferencesRowIndex >= 0) {
        // Update existing row (row index is 0-based, but we skip header, so add 2)
        const rowNumber = preferencesRowIndex + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Current!B${rowNumber}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[preferencesJson]]
          }
        });
      } else {
        // Append new row
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Current!A:B',
          valueInputOption: 'RAW',
          requestBody: {
            values: [['preferences', preferencesJson]]
          }
        });
      }
    } catch (error) {
      console.error('Error updating current preferences in sheet:', error);
      throw error;
    }
  }
}
