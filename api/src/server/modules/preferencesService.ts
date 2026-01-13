/**
 * Preferences Service
 * Manages user preferences stored on Google Drive
 * Each user stores their preferences in preferences.json in their _metadata folder
 * Also logs all preference interactions to preferences.xlsx sheet for history
 */

import crypto from 'crypto';

export interface UserTagPreference {
  tagId: string;
  preference: 'like' | 'dislike' | 'block' | 'subscribe';
  action: 'swipe_like' | 'swipe_dislike' | 'preference_tile_yes' | 'preference_tile_no' | 'explicit_setting';
  confidence: number;
  sourceFileId?: string;
  metadata?: {
    questionId?: string;
    fileType?: string;
    category?: string;
    subject?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CuratedFeedPreferences {
  sortOrder: 'time' | 'recommended'; // Default: 'recommended'
  connectionFilter: 'all' | 'connections' | 'not_connections'; // Default: 'all'
}

export interface UserPreferences {
  identifier: string;
  updatedAt: string;
  maxRating?: string;
  ageVerified?: boolean;
  verifiedAge?: number;
  subscribedCategories?: string[];
  subscribedFeedIds?: string[];
  displayName?: string;
  profileImageFileId?: string;
  userDisplayNames?: Record<string, string>;
  tagPreferences?: UserTagPreference[];
  curatedFeedPreferences?: CuratedFeedPreferences;
  mePageSortOrder?: 'time' | 'recommended' | 'most_viewed'; // Default: 'recommended'
}

export class PreferencesService {
  private static readonly PREFERENCES_FILE_NAME = 'preferences.json';

  /**
   * Get preferences file from user's Google Drive
   */
  static async getPreferencesFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserPreferences | null> {
    try {
      // Search for preferences.json in metadata folder
      const searchQuery = `name='${this.PREFERENCES_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!searchResponse.ok || searchResponse.status === 404) {
        return null;
      }

      const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
      
      if (!searchData.files || searchData.files.length === 0) {
        return null;
      }

      // Download preferences file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as UserPreferences;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting preferences file:', error);
      return null;
    }
  }

  /**
   * Create or update preferences file
   * Also logs preference interactions to preferences.xlsx sheet
   */
  static async updatePreferencesFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    preferences: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    // Get existing preferences or create new
    let existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId);
    
    const now = new Date().toISOString();
    const updatedPreferences: UserPreferences = {
      identifier,
      ...existingPreferences,
      ...preferences,
      updatedAt: now
    };

    const preferencesContent = JSON.stringify(updatedPreferences, null, 2);

    try {
      // Search for existing preferences.json
      const searchQuery = `name='${this.PREFERENCES_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: preferencesContent
          });
          
          // Log preference interactions to sheet
          await this.logPreferenceInteractions(
            accessToken,
            metadataFolderId,
            identifier,
            existingPreferences,
            updatedPreferences,
            preferences
          );
          
          return updatedPreferences;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.PREFERENCES_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="preferences.json"',
        'Content-Type: application/json',
        '',
        preferencesContent,
        `--${boundary}--`
      ].join('\r\n');

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
      
      // Log preference interactions to sheet (for new file)
      await this.logPreferenceInteractions(
        accessToken,
        metadataFolderId,
        identifier,
        existingPreferences,
        updatedPreferences,
        preferences
      );
      
      return updatedPreferences;
    } catch (error) {
      console.error('Error updating preferences file:', error);
      throw error;
    }
  }

  /**
   * Helper method to log preference interactions to preferences sheet
   */
  private static async logPreferenceInteractions(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    existingPreferences: UserPreferences | null,
    updatedPreferences: UserPreferences,
    changedPreferences: Partial<UserPreferences>
  ): Promise<void> {
    try {
      const { PreferencesSheetsService } = await import('./preferencesSheetsService');
      const spreadsheetId = await PreferencesSheetsService.getOrCreatePreferencesSheet(
        accessToken,
        metadataFolderId
      );

      const now = new Date().toISOString();

      // Log each changed field as a separate interaction
      if (changedPreferences.displayName !== undefined) {
        const interactionId = crypto.randomUUID();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'display_name',
          action_type: existingPreferences?.displayName ? 'update' : 'add',
          previous_value: existingPreferences?.displayName ? JSON.stringify(existingPreferences.displayName) : undefined,
          new_value: JSON.stringify(updatedPreferences.displayName),
          created_at: now
        });
      }

      if (changedPreferences.profileImageFileId !== undefined) {
        const interactionId = crypto.randomUUID();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'profile_image',
          action_type: existingPreferences?.profileImageFileId ? 'update' : 'add',
          previous_value: existingPreferences?.profileImageFileId ? JSON.stringify(existingPreferences.profileImageFileId) : undefined,
          new_value: JSON.stringify(updatedPreferences.profileImageFileId),
          created_at: now
        });
      }

      if (changedPreferences.curatedFeedPreferences !== undefined) {
        const interactionId = crypto.randomUUID();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'curated_feed_preferences',
          action_type: existingPreferences?.curatedFeedPreferences ? 'update' : 'add',
          previous_value: existingPreferences?.curatedFeedPreferences ? JSON.stringify(existingPreferences.curatedFeedPreferences) : undefined,
          new_value: JSON.stringify(updatedPreferences.curatedFeedPreferences),
          created_at: now
        });
      }

      if (changedPreferences.subscribedFeedIds !== undefined) {
        const interactionId = crypto.randomUUID();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'subscribed_feed_ids',
          action_type: 'update',
          previous_value: existingPreferences?.subscribedFeedIds ? JSON.stringify(existingPreferences.subscribedFeedIds) : undefined,
          new_value: JSON.stringify(updatedPreferences.subscribedFeedIds),
          created_at: now
        });
      }

      // Note: blockedCategories, subscribedSubjects, blockedSubjects are not in UserPreferences interface
      // They may be added in the future - these checks are included for forward compatibility

      if (changedPreferences.mePageSortOrder !== undefined) {
        const interactionId = crypto.randomUUID();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'me_page_sort_order',
          action_type: existingPreferences?.mePageSortOrder ? 'update' : 'add',
          previous_value: existingPreferences?.mePageSortOrder ? JSON.stringify(existingPreferences.mePageSortOrder) : undefined,
          new_value: JSON.stringify(updatedPreferences.mePageSortOrder),
          created_at: now
        });
      }

      // Note: tagPreferences are logged separately in addTagPreference and removeTagPreference
    } catch (error) {
      // Log error but don't fail the preference update
      console.warn('[PreferencesService] Failed to log preference interaction:', error);
    }
  }

  /**
   * Add or update a tag preference
   * Also logs tag preference interaction to preferences.xlsx sheet
   */
  static async addTagPreference(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    tagId: string,
    preference: 'like' | 'dislike' | 'block' | 'subscribe',
    action: UserTagPreference['action'],
    options?: {
      sourceFileId?: string;
      confidence?: number;
      metadata?: UserTagPreference['metadata'];
    }
  ): Promise<void> {
    const existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId);
    const tagPreferences = existingPreferences?.tagPreferences || [];
    
    const now = new Date().toISOString();
    const normalizedTagId = tagId.toLowerCase();
    
    // Find existing preference for this tag
    const existingIndex = tagPreferences.findIndex(tp => tp.tagId === normalizedTagId);
    const existingTagPreference = existingIndex >= 0 ? tagPreferences[existingIndex] : null;
    
    const newPreference: UserTagPreference = {
      tagId: normalizedTagId,
      preference,
      action,
      confidence: options?.confidence ?? 0.8,
      sourceFileId: options?.sourceFileId,
      metadata: options?.metadata,
      createdAt: existingTagPreference?.createdAt || now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      // Update existing preference
      tagPreferences[existingIndex] = newPreference;
    } else {
      // Add new preference
      tagPreferences.push(newPreference);
    }

    // Log tag preference interaction to sheet
    try {
      const { PreferencesSheetsService } = await import('./preferencesSheetsService');
      const spreadsheetId = await PreferencesSheetsService.getOrCreatePreferencesSheet(
        accessToken,
        metadataFolderId
      );

      const interactionId = crypto.randomUUID();
      await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
        interaction_id: interactionId,
        user_did: userDid,
        preference_type: 'tag_preference',
        action_type: action, // Use the action directly (swipe_like, swipe_dislike, etc.)
        previous_value: existingTagPreference ? JSON.stringify(existingTagPreference) : undefined,
        new_value: JSON.stringify(newPreference),
        tag_id: normalizedTagId,
        source_file_id: options?.sourceFileId,
        question_id: options?.metadata?.questionId, // For curation cards
        metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
        created_at: now
      });
    } catch (error) {
      // Log error but don't fail the preference update
      console.warn('[PreferencesService] Failed to log tag preference interaction:', error);
    }

    await this.updatePreferencesFile(accessToken, metadataFolderId, userDid, {
      tagPreferences
    });
  }

  /**
   * Remove a tag preference
   * Also logs tag preference removal to preferences.xlsx sheet
   */
  static async removeTagPreference(
    accessToken: string,
    metadataFolderId: string,
    userDid: string,
    tagId: string
  ): Promise<void> {
    const existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId);
    if (!existingPreferences?.tagPreferences) {
      return;
    }

    const normalizedTagId = tagId.toLowerCase();
    const existingTagPreference = existingPreferences.tagPreferences.find(
      tp => tp.tagId === normalizedTagId
    );
    
    const tagPreferences = existingPreferences.tagPreferences.filter(
      tp => tp.tagId !== normalizedTagId
    );

    // Log tag preference removal to sheet
    if (existingTagPreference) {
      try {
        const { PreferencesSheetsService } = await import('./preferencesSheetsService');
        const spreadsheetId = await PreferencesSheetsService.getOrCreatePreferencesSheet(
          accessToken,
          metadataFolderId
        );

        const interactionId = crypto.randomUUID();
        const now = new Date().toISOString();
        await PreferencesSheetsService.appendPreferenceInteraction(accessToken, spreadsheetId, {
          interaction_id: interactionId,
          user_did: userDid,
          preference_type: 'tag_preference',
          action_type: 'remove',
          previous_value: JSON.stringify(existingTagPreference),
          new_value: undefined,
          tag_id: normalizedTagId,
          source_file_id: existingTagPreference.sourceFileId,
          question_id: existingTagPreference.metadata?.questionId,
          metadata: existingTagPreference.metadata ? JSON.stringify(existingTagPreference.metadata) : undefined,
          created_at: now
        });
      } catch (error) {
        // Log error but don't fail the preference update
        console.warn('[PreferencesService] Failed to log tag preference removal:', error);
      }
    }

    await this.updatePreferencesFile(accessToken, metadataFolderId, userDid, {
      tagPreferences
    });
  }

  /**
   * Get all tag preferences for a user
   */
  static async getTagPreferences(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserTagPreference[]> {
    const preferences = await this.getPreferencesFile(accessToken, metadataFolderId);
    return preferences?.tagPreferences || [];
  }
}

