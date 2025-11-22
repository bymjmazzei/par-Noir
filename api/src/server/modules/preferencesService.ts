/**
 * Preferences Service
 * Manages user preferences stored on Google Drive
 * Each user stores their preferences in preferences.json in their _metadata folder
 */

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
}

