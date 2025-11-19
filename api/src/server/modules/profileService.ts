/**
 * Profile Service
 * Manages user profile data stored on Google Drive
 * Each user stores their profile data in profile.json in their _metadata folder
 */

export interface UserProfile {
  identifier: string;
  displayName?: string;
  profileImageFileId?: string;
  updatedAt: string;
}

export class ProfileService {
  private static readonly PROFILE_FILE_NAME = 'profile.json';

  /**
   * Get profile file from user's Google Drive
   */
  static async getProfileFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserProfile | null> {
    try {
      // Search for profile.json in metadata folder
      const searchQuery = `name='${this.PROFILE_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
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

      // Download profile file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        return await getResponse.json() as UserProfile;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting profile file:', error);
      return null;
    }
  }

  /**
   * Create or update profile file
   */
  static async updateProfileFile(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    profileData: UserProfile
  ): Promise<void> {
    const profileContent = JSON.stringify(profileData, null, 2);

    try {
      // Search for existing profile.json
      const searchQuery = `name='${this.PROFILE_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
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
            body: profileContent
          });
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.PROFILE_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="profile.json"',
        'Content-Type: application/json',
        '',
        profileContent,
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
    } catch (error) {
      console.error('Error updating profile file:', error);
      throw error;
    }
  }

  /**
   * Update display name
   */
  static async updateDisplayName(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    displayName: string
  ): Promise<void> {
    let profile = await this.getProfileFile(accessToken, metadataFolderId);
    
    if (!profile) {
      profile = {
        identifier,
        updatedAt: new Date().toISOString()
      };
    }

    profile.displayName = displayName;
    profile.updatedAt = new Date().toISOString();

    await this.updateProfileFile(accessToken, metadataFolderId, identifier, profile);
  }

  /**
   * Update profile image fileId
   */
  static async updateProfileImage(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    fileId: string
  ): Promise<void> {
    let profile = await this.getProfileFile(accessToken, metadataFolderId);
    
    if (!profile) {
      profile = {
        identifier,
        updatedAt: new Date().toISOString()
      };
    }

    profile.profileImageFileId = fileId;
    profile.updatedAt = new Date().toISOString();

    await this.updateProfileFile(accessToken, metadataFolderId, identifier, profile);
  }

  /**
   * Get user profile
   */
  static async getProfile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<UserProfile | null> {
    return await this.getProfileFile(accessToken, metadataFolderId);
  }
}

