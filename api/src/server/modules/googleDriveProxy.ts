/**
 * Google Drive Proxy Service
 * Proxies Google Drive API calls using stored OAuth tokens
 */

import { storageCredentialsService } from './storageCredentialsService';
import { PNOAuthService } from './pnOAuthService';

export interface GoogleDriveToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  expires_at?: number; // Timestamp when token expires
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
  description?: string;
}

export class GoogleDriveProxyService {
  /**
   * Get Google Drive access token for a user
   * Handles token refresh if needed
   */
  async getAccessToken(userDid: string): Promise<string> {
    const credentialsRecord = await storageCredentialsService.getCredentials(userDid);
    
    if (!credentialsRecord) {
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }

    const credentials = credentialsRecord.credentials;
    const token: GoogleDriveToken = credentials.googleDrive || credentials;

    if (!token.access_token) {
      throw new Error('Google Drive access token not found');
    }

    // Check if token needs refresh
    const now = Date.now();
    const expiresAt = token.expires_at || (token.expires_in ? now + (token.expires_in * 1000) : now + 3600000);
    
    if (expiresAt < now + 60000) { // Refresh if expires in less than 1 minute
      if (!token.refresh_token) {
        throw new Error('Google Drive token expired and no refresh token available');
      }

      try {
        const refreshedToken = await this.refreshAccessToken(token.refresh_token);
        
        // Update stored credentials
        const updatedCredentials = {
          ...credentials,
          googleDrive: {
            ...token,
            access_token: refreshedToken.access_token,
            expires_at: refreshedToken.expires_in 
              ? Date.now() + (refreshedToken.expires_in * 1000)
              : undefined,
            expires_in: refreshedToken.expires_in,
            refresh_token: refreshedToken.refresh_token || token.refresh_token
          }
        };
        
        await storageCredentialsService.upsertCredentials(userDid, updatedCredentials);
        
        return refreshedToken.access_token;
      } catch (error) {
        console.error('Failed to refresh Google Drive token:', error);
        throw new Error('Failed to refresh Google Drive access token');
      }
    }

    return token.access_token;
  }

  /**
   * Refresh Google Drive access token
   */
  private async refreshAccessToken(refreshToken: string): Promise<GoogleDriveToken> {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || '43740774041-fo57a1gqenc9dmggkcrhjl5cvrp40gnq.apps.googleusercontent.com';
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (!clientSecret) {
      throw new Error('Google Drive client secret not configured');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    return response.json() as Promise<GoogleDriveToken>;
  }

  /**
   * List files from Google Drive
   */
  async listFiles(userDid: string, query?: string, pageSize: number = 50): Promise<GoogleDriveFile[]> {
    const accessToken = await this.getAccessToken(userDid);

    const params = new URLSearchParams({
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, description)',
      pageSize: pageSize.toString(),
      orderBy: 'modifiedTime desc',
    });

    if (query) {
      params.append('q', query);
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list files: ${errorText}`);
    }

    const data = await response.json() as { files?: GoogleDriveFile[] };
    return data.files || [];
  }

  /**
   * Upload file to Google Drive
   */
  async uploadFile(
    userDid: string,
    file: Buffer,
    fileName: string,
    mimeType: string,
    parents?: string[]
  ): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userDid);

    const metadata = {
      name: fileName,
      ...(parents && parents.length > 0 ? { parents } : {}),
    };

    // Create multipart/form-data boundary
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const metadataPart = `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
    const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const endBoundary = `\r\n--${boundary}--\r\n`;

    const body = Buffer.concat([
      Buffer.from(metadataPart, 'utf8'),
      Buffer.from(filePart, 'utf8'),
      file,
      Buffer.from(endBoundary, 'utf8')
    ]);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body: body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${errorText}`);
    }

    return response.json() as Promise<GoogleDriveFile>;
  }

  /**
   * Download file from Google Drive
   */
  async downloadFile(userDid: string, fileId: string): Promise<Blob> {
    const accessToken = await this.getAccessToken(userDid);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download file: ${errorText}`);
    }

    return response.blob();
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileMetadata(userDid: string, fileId: string): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userDid);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents,description`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get file metadata: ${errorText}`);
    }

    return response.json() as Promise<GoogleDriveFile>;
  }
}

export const googleDriveProxyService = new GoogleDriveProxyService();

