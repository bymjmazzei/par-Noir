/**
 * Preferences Service
 * Manages user preferences stored on Google Drive
 * Each user stores their preferences in preferences.json in their _metadata folder
 */

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
      
      return updatedPreferences;
    } catch (error) {
      console.error('Error updating preferences file:', error);
      throw error;
    }
  }

  /**
   * Add or update a tag preference
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
    
    const newPreference: UserTagPreference = {
      tagId: normalizedTagId,
      preference,
      action,
      confidence: options?.confidence ?? 0.8,
      sourceFileId: options?.sourceFileId,
      metadata: options?.metadata,
      createdAt: existingIndex >= 0 ? tagPreferences[existingIndex].createdAt : now,
      updatedAt: now
    };

    if (existingIndex >= 0) {
      // Update existing preference
      tagPreferences[existingIndex] = newPreference;
    } else {
      // Add new preference
      tagPreferences.push(newPreference);
    }

    await this.updatePreferencesFile(accessToken, metadataFolderId, userDid, {
      tagPreferences
    });
  }

  /**
   * Remove a tag preference
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
    const tagPreferences = existingPreferences.tagPreferences.filter(
      tp => tp.tagId !== normalizedTagId
    );

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

