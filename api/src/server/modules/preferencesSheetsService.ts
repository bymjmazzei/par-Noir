/**
 * Preferences Sheets Service
 * Manages preference interaction logging in Google Sheets table
 * Logs all preference interactions while preferences.json maintains current state
 * Stored in Google Drive (decentralized) - users own their data
 */

import { google } from 'googleapis';

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
  user_did: string;
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
   * Get or create preferences sheet
   */
  static async getOrCreatePreferencesSheet(
    accessToken: string,
    metadataFolderId: string
  ): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Search for existing preferences sheet in metadata folder
    const fileQuery = `name='${this.PREFERENCES_FILE_NAME}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const searchResponse = await drive.files.list({
      q: fileQuery,
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id!;
    }

    // Also check if file exists elsewhere (might have been created in wrong location)
    const broadQuery = `name='${this.PREFERENCES_FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
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

    // Create new preferences sheet
    const spreadsheet = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: this.PREFERENCES_FILE_NAME.replace('.xlsx', '')
        },
        sheets: [
          {
            properties: {
              title: 'Interactions',
              gridProperties: {
                rowCount: 100000,
                columnCount: 11
              }
            }
          }
        ]
      }
    });

    const spreadsheetId = spreadsheet.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error('Failed to create preferences sheet: no ID returned');
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
      range: 'Interactions!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [['Interaction ID', 'User DID', 'Preference Type', 'Action Type', 'Previous Value (JSON)', 'New Value (JSON)', 'Tag ID', 'Source File ID', 'Question ID', 'Metadata (JSON)', 'Created At']]
      }
    });

    return spreadsheetId;
  }

  /**
   * Append preference interaction to sheet
   */
  static async appendPreferenceInteraction(
    accessToken: string,
    spreadsheetId: string,
    interaction: PreferenceInteraction
  ): Promise<void> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
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
    accessToken: string,
    spreadsheetId: string,
    options?: {
      limit?: number;
      offset?: number;
      preferenceType?: PreferenceType;
      userDid?: string;
    }
  ): Promise<{ interactions: PreferenceInteraction[]; total: number }> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
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
    if (options?.userDid) {
      interactions = interactions.filter(i => i.user_did === options.userDid);
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
}
