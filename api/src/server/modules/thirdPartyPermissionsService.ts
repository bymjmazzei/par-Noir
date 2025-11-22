/**
 * Third Party Permissions Service
 * Manages third-party tool permissions for users
 * Stores permissions in Google Drive Metadata folder (same pattern as preferences and zkp-data-points)
 */

export interface ThirdPartyPermission {
  toolId: string;
  toolName: string;
  toolDescription: string;
  permissions: string[];
  dataPoints: string[]; // Which data points this tool can access (user granted)
  requiredDataPoints: string[]; // Data points marked as required by the tool
  optionalDataPoints: string[]; // Data points marked as optional by the tool
  grantedAt: string;
  expiresAt?: string;
  status: 'active' | 'pending' | 'revoked';
}

export interface ThirdPartyPermissionsFile {
  identifier: string;
  updatedAt: string;
  permissions: Record<string, ThirdPartyPermission>;
}

export class ThirdPartyPermissionsService {
  private static readonly PERMISSIONS_FILE_NAME = 'third-party-permissions.json';

  /**
   * Get third-party permissions file from user's Google Drive
   */
  static async getPermissionsFile(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ThirdPartyPermission> | null> {
    try {
      // Search for third-party-permissions.json in metadata folder
      const searchQuery = `name='${this.PERMISSIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
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

      // Download third-party-permissions.json file
      const fileId = searchData.files[0].id;
      const getResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!getResponse.ok) {
        return null;
      }

      try {
        const data = await getResponse.json() as { permissions?: Record<string, ThirdPartyPermission> };
        return data.permissions || null;
      } catch {
        return null;
      }
    } catch (error) {
      console.error('Error getting third-party permissions file:', error);
      return null;
    }
  }

  /**
   * Get all third-party permissions for a user
   */
  static async getPermissions(
    accessToken: string,
    metadataFolderId: string
  ): Promise<Record<string, ThirdPartyPermission>> {
    const permissions = await this.getPermissionsFile(accessToken, metadataFolderId);
    return permissions || {};
  }

  /**
   * Store or update third-party permissions
   */
  static async storePermissions(
    accessToken: string,
    metadataFolderId: string,
    identifier: string,
    permissions: Record<string, ThirdPartyPermission>
  ): Promise<void> {
    const fileContent: ThirdPartyPermissionsFile = {
      identifier,
      updatedAt: new Date().toISOString(),
      permissions
    };

    const fileContentJson = JSON.stringify(fileContent, null, 2);

    try {
      // Search for existing third-party-permissions.json
      const searchQuery = `name='${this.PERMISSIONS_FILE_NAME}' and '${metadataFolderId}' in parents and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)&pageSize=1`;
      
      const searchResponse = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json() as { files?: Array<{ id: string }> };
        
        if (searchData.files && searchData.files.length > 0) {
          // Update existing file
          const fileId = searchData.files[0].id;
          const updateResponse = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: fileContentJson
          });
          
          if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            console.error('Failed to update third-party permissions file:', updateResponse.status, errorText);
            throw new Error(`Failed to update third-party permissions file: ${errorText}`);
          }
          
          console.log('Successfully updated third-party permissions file:', fileId);
          return;
        }
      }

      // Create new file
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const metadataPart = JSON.stringify({
        name: this.PERMISSIONS_FILE_NAME,
        parents: [metadataFolderId]
      });

      const multipartBody = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="metadata"',
        'Content-Type: application/json',
        '',
        metadataPart,
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="third-party-permissions.json"',
        'Content-Type: application/json',
        '',
        fileContentJson,
        `--${boundary}--`
      ].join('\r\n');

      const createResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
      
      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Failed to create third-party permissions file:', createResponse.status, errorText);
        throw new Error(`Failed to create third-party permissions file: ${errorText}`);
      }
      
      const createdFile = await createResponse.json() as { id: string };
      console.log('Successfully created third-party permissions file:', createdFile.id);
    } catch (error) {
      console.error('Error storing third-party permissions:', error);
      throw error;
    }
  }
}

