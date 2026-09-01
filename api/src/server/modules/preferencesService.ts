/**
 * Preferences Service
 * Manages user preferences stored on Google Drive
 * Current preferences are stored in preferences.json (for fast filtering)
 * All preference interactions are logged to preferences.xlsx "Interactions" sheet for history
 */

import crypto from 'crypto';
import { JSON_BLOB_PATHS } from '@par-noir/user-owned-storage';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { isPortableSocialCloud } from './storage/storageProviderUtils';
import { readPortableJsonBlob, writePortableJsonBlob } from './storage/portableJsonBlob';
import * as PrefsPortable from './storage/preferencesPortableService';
import type { PreferenceInteraction, PreferenceType, PreferenceActionType } from './preferencesSheetsService';

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
  /** L5 community apps (OAuth client ids) the user subscribed to in the browser feed rail */
  subscribedCommunityIds?: string[];
  displayName?: string;
  profileImageFileId?: string;
  userDisplayNames?: Record<string, string>;
  tagPreferences?: UserTagPreference[];
  curatedFeedPreferences?: CuratedFeedPreferences;
  mePageSortOrder?: 'time' | 'recommended' | 'most_viewed'; // Default: 'recommended'
}

export class PreferencesService {
  private static readonly PREFERENCES_FILE_NAME = 'preferences.json';
  
  // In-memory cache: Map<pnIdentifier, { preferences: UserPreferences, lastUpdated: string }>
  private static preferencesCache = new Map<string, { preferences: UserPreferences; lastUpdated: string }>();

  /**
   * Get preferences file from user's Google Drive (JSON file for fast reads)
   * Uses in-memory cache - loads once per session, refreshes only on updates
   */
  static async getPreferencesFile(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier?: string
  ): Promise<UserPreferences | null> {
    // If we have a cached version, return it immediately (fast path)
    if (pnIdentifier) {
      const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
      const cached = this.preferencesCache.get(normalizedPnIdentifier);
      if (cached) {
        return cached.preferences;
      }
    }
    try {
      if (pnIdentifier) {
        const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
        if (await isPortableSocialCloud(normalizedPnIdentifier)) {
          const preferences = await readPortableJsonBlob<UserPreferences>(
            normalizedPnIdentifier,
            JSON_BLOB_PATHS.preferences
          );
          if (preferences) {
            this.preferencesCache.set(normalizedPnIdentifier, {
              preferences,
              lastUpdated: new Date().toISOString()
            });
            return preferences;
          }
          return null;
        }
      }

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
        const preferences = await getResponse.json() as UserPreferences;
        
        // Cache the preferences if we have a pnIdentifier
        if (pnIdentifier) {
          const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
          this.preferencesCache.set(normalizedPnIdentifier, {
            preferences,
            lastUpdated: new Date().toISOString()
          });
        }
        
        return preferences;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting preferences file:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a specific user (called when preferences are updated)
   */
  private static invalidateCache(pnIdentifier: string): void {
    const normalizedPnIdentifier = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
    this.preferencesCache.delete(normalizedPnIdentifier);
  }

  /**
   * Refresh cache for a specific user (loads fresh from Google Drive)
   */
  private static async refreshCache(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier: string
  ): Promise<UserPreferences | null> {
    this.invalidateCache(pnIdentifier);
    return await this.getPreferencesFile(accessToken, metadataFolderId, pnIdentifier);
  }

  /**
   * Create or update preferences file (JSON for fast reads)
   * Also logs preference interactions to preferences.xlsx "Interactions" sheet
   * Refreshes cache after update so new preferences apply to future content
   */
  static async updatePreferencesFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    preferences: Partial<UserPreferences>,
    userPnIdentifier: string,
    accountId?: string
  ): Promise<UserPreferences> {
    // Get existing preferences or create new (may use cache)
    let existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId, identifier);
    
    const now = new Date().toISOString();
    const updatedPreferences: UserPreferences = {
      identifier,
      ...existingPreferences,
      ...preferences,
      updatedAt: now
    };

    const preferencesContent = JSON.stringify(updatedPreferences, null, 2);
    const normalizedUserPn = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

    if (await isPortableSocialCloud(normalizedUserPn)) {
      await writePortableJsonBlob(normalizedUserPn, JSON_BLOB_PATHS.preferences, updatedPreferences);
      await this.logPreferenceInteractions(
        '',
        metadataFolderId,
        identifier,
        existingPreferences,
        updatedPreferences,
        preferences,
        userPnIdentifier,
        accountId
      );
      this.preferencesCache.set(normalizedUserPn, {
        preferences: updatedPreferences,
        lastUpdated: now
      });
      return updatedPreferences;
    }

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
            preferences,
            userPnIdentifier,
            accountId
          );
          
          // Update "Current" sheet in preferences.xlsx with current preferences state
          try {
            const token: GoogleDriveToken = { access_token: accessToken };
            const { PreferencesSheetsService } = await import('./preferencesSheetsService');
            const spreadsheetId = await PreferencesSheetsService.getPreferencesSheet(
              token,
              metadataFolderId,
              userPnIdentifier,
              accountId
            );
            await PreferencesSheetsService.updateCurrentPreferences(
              token,
              spreadsheetId,
              updatedPreferences,
              userPnIdentifier,
              accountId
            );
          } catch (sheetError) {
            // Log error but don't fail the preference update
            console.warn('[PreferencesService] Failed to update Current sheet in preferences.xlsx:', sheetError);
          }
          
          // Refresh cache with updated preferences (so future requests use new preferences)
          const normalizedPnIdentifier = identifier.startsWith('pn-') ? identifier : `pn-${identifier}`;
          this.preferencesCache.set(normalizedPnIdentifier, {
            preferences: updatedPreferences,
            lastUpdated: now
          });
          
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
        preferences,
        userPnIdentifier,
        accountId
      );
      
      // Update "Current" sheet in preferences.xlsx with current preferences state
      try {
        const token: GoogleDriveToken = { access_token: accessToken };
        const { PreferencesSheetsService } = await import('./preferencesSheetsService');
        const spreadsheetId = await PreferencesSheetsService.getPreferencesSheet(
          token,
          metadataFolderId,
          userPnIdentifier,
          accountId
        );
        await PreferencesSheetsService.updateCurrentPreferences(
          token,
          spreadsheetId,
          updatedPreferences,
          userPnIdentifier,
          accountId
        );
      } catch (sheetError) {
        // Log error but don't fail the preference update
        console.warn('[PreferencesService] Failed to update Current sheet in preferences.xlsx:', sheetError);
      }
      
      // Cache the new preferences
      const normalizedPnIdentifier = identifier.startsWith('pn-') ? identifier : `pn-${identifier}`;
      this.preferencesCache.set(normalizedPnIdentifier, {
        preferences: updatedPreferences,
        lastUpdated: now
      });
      
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
    userPnIdentifier: string,
    existingPreferences: UserPreferences | null,
    updatedPreferences: UserPreferences,
    changedPreferences: Partial<UserPreferences>,
    normalizedUserPnIdentifier: string,
    accountId?: string
  ): Promise<void> {
    try {
      const normalized = normalizedUserPnIdentifier.startsWith('pn-')
        ? normalizedUserPnIdentifier
        : `pn-${normalizedUserPnIdentifier}`;

      const appendInteraction = async (interaction: PreferenceInteraction) => {
        if (await isPortableSocialCloud(normalized)) {
          await PrefsPortable.appendPreferenceInteractionPortable(normalized, interaction, accountId);
          return;
        }
        const token: GoogleDriveToken = { access_token: accessToken };
        const { PreferencesSheetsService } = await import('./preferencesSheetsService');
        const spreadsheetId = await PreferencesSheetsService.getPreferencesSheet(
          token,
          metadataFolderId,
          normalizedUserPnIdentifier,
          accountId
        );
        await PreferencesSheetsService.appendPreferenceInteraction(
          token,
          spreadsheetId,
          interaction,
          normalizedUserPnIdentifier,
          accountId
        );
      };

      const now = new Date().toISOString();

      if (changedPreferences.displayName !== undefined) {
        await appendInteraction({
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'display_name' as PreferenceType,
          action_type: (existingPreferences?.displayName ? 'update' : 'add') as PreferenceActionType,
          previous_value: existingPreferences?.displayName ? JSON.stringify(existingPreferences.displayName) : undefined,
          new_value: JSON.stringify(updatedPreferences.displayName),
          created_at: now
        });
      }

      if (changedPreferences.profileImageFileId !== undefined) {
        await appendInteraction({
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'profile_image' as PreferenceType,
          action_type: (existingPreferences?.profileImageFileId ? 'update' : 'add') as PreferenceActionType,
          previous_value: existingPreferences?.profileImageFileId ? JSON.stringify(existingPreferences.profileImageFileId) : undefined,
          new_value: JSON.stringify(updatedPreferences.profileImageFileId),
          created_at: now
        });
      }

      if (changedPreferences.curatedFeedPreferences !== undefined) {
        await appendInteraction({
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'curated_feed_preferences' as PreferenceType,
          action_type: (existingPreferences?.curatedFeedPreferences ? 'update' : 'add') as PreferenceActionType,
          previous_value: existingPreferences?.curatedFeedPreferences ? JSON.stringify(existingPreferences.curatedFeedPreferences) : undefined,
          new_value: JSON.stringify(updatedPreferences.curatedFeedPreferences),
          created_at: now
        });
      }

      if (changedPreferences.subscribedFeedIds !== undefined) {
        await appendInteraction({
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'subscribed_feed_ids' as PreferenceType,
          action_type: 'update' as PreferenceActionType,
          previous_value: existingPreferences?.subscribedFeedIds ? JSON.stringify(existingPreferences.subscribedFeedIds) : undefined,
          new_value: JSON.stringify(updatedPreferences.subscribedFeedIds),
          created_at: now
        });
      }

      // Note: blockedCategories, subscribedSubjects, blockedSubjects are not in UserPreferences interface
      // They may be added in the future - these checks are included for forward compatibility

      if (changedPreferences.mePageSortOrder !== undefined) {
        await appendInteraction({
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'me_page_sort_order' as PreferenceType,
          action_type: (existingPreferences?.mePageSortOrder ? 'update' : 'add') as PreferenceActionType,
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
    userPnIdentifier: string, // Actually the pnIdentifier
    tagId: string,
    preference: 'like' | 'dislike' | 'block' | 'subscribe',
    action: UserTagPreference['action'],
    options?: {
      sourceFileId?: string;
      confidence?: number;
      metadata?: UserTagPreference['metadata'];
    },
    accountId?: string
  ): Promise<void> {
    // Use userPnIdentifier for cache lookup
    const existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId, userPnIdentifier);
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

    try {
      const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
      const interaction: PreferenceInteraction = {
        interaction_id: crypto.randomUUID(),
        user_pn_identifier: userPnIdentifier,
        preference_type: 'tag_preference',
        action_type: action as PreferenceActionType,
        previous_value: existingTagPreference ? JSON.stringify(existingTagPreference) : undefined,
        new_value: JSON.stringify(newPreference),
        tag_id: normalizedTagId,
        source_file_id: options?.sourceFileId,
        question_id: options?.metadata?.questionId,
        metadata: options?.metadata ? JSON.stringify(options.metadata) : undefined,
        created_at: now
      };
      if (await isPortableSocialCloud(normalizedUserPnIdentifier)) {
        await PrefsPortable.appendPreferenceInteractionPortable(normalizedUserPnIdentifier, interaction, accountId);
      } else {
        const token: GoogleDriveToken = { access_token: accessToken };
        const { PreferencesSheetsService } = await import('./preferencesSheetsService');
        const spreadsheetId = await PreferencesSheetsService.getPreferencesSheet(
          token,
          metadataFolderId,
          normalizedUserPnIdentifier,
          accountId
        );
        await PreferencesSheetsService.appendPreferenceInteraction(
          token,
          spreadsheetId,
          interaction,
          normalizedUserPnIdentifier,
          accountId
        );
      }
    } catch (error) {
      // Log error but don't fail the preference update
      console.warn('[PreferencesService] Failed to log tag preference interaction:', error);
    }

    const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    await this.updatePreferencesFile(accessToken, metadataFolderId, userPnIdentifier, {
      tagPreferences
    }, normalizedUserPnIdentifier, accountId);
  }

  /**
   * Remove a tag preference
   * Also logs tag preference removal to preferences.xlsx sheet
   */
  static async removeTagPreference(
    accessToken: string,
    metadataFolderId: string,
    userPnIdentifier: string, // Actually the pnIdentifier
    tagId: string,
    accountId?: string
  ): Promise<void> {
    // Use userPnIdentifier for cache lookup
    const existingPreferences = await this.getPreferencesFile(accessToken, metadataFolderId, userPnIdentifier);
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

    if (existingTagPreference) {
      try {
        const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
        const interaction: PreferenceInteraction = {
          interaction_id: crypto.randomUUID(),
          user_pn_identifier: userPnIdentifier,
          preference_type: 'tag_preference',
          action_type: 'remove',
          previous_value: JSON.stringify(existingTagPreference),
          new_value: undefined,
          tag_id: normalizedTagId,
          source_file_id: existingTagPreference.sourceFileId,
          question_id: existingTagPreference.metadata?.questionId,
          metadata: existingTagPreference.metadata ? JSON.stringify(existingTagPreference.metadata) : undefined,
          created_at: new Date().toISOString()
        };
        if (await isPortableSocialCloud(normalizedUserPnIdentifier)) {
          await PrefsPortable.appendPreferenceInteractionPortable(normalizedUserPnIdentifier, interaction, accountId);
        } else {
          const token: GoogleDriveToken = { access_token: accessToken };
          const { PreferencesSheetsService } = await import('./preferencesSheetsService');
          const spreadsheetId = await PreferencesSheetsService.getPreferencesSheet(
            token,
            metadataFolderId,
            normalizedUserPnIdentifier,
            accountId
          );
          await PreferencesSheetsService.appendPreferenceInteraction(
            token,
            spreadsheetId,
            interaction,
            normalizedUserPnIdentifier,
            accountId
          );
        }
      } catch (error) {
        console.warn('[PreferencesService] Failed to log tag preference removal:', error);
      }
    }

    const normalizedUserPnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    await this.updatePreferencesFile(accessToken, metadataFolderId, userPnIdentifier, {
      tagPreferences
    }, normalizedUserPnIdentifier, accountId);
  }

  /**
   * Get all tag preferences for a user
   */
  static async getTagPreferences(
    accessToken: string,
    metadataFolderId: string,
    pnIdentifier?: string
  ): Promise<UserTagPreference[]> {
    const preferences = await this.getPreferencesFile(accessToken, metadataFolderId, pnIdentifier);
    return preferences?.tagPreferences || [];
  }
}

