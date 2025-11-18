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
  thumbnailLink?: string;
  parents?: string[];
  description?: string;
}

export class GoogleDriveProxyService {
  /**
   * Get Google Drive access token for a user
   * Supports multiple accounts - if accountId is provided, uses that specific account
   * Handles token refresh if needed
   */
  async getAccessToken(userDid: string, accountId?: string): Promise<string> {
    const credentialsRecord = await storageCredentialsService.getCredentials(userDid);
    
    if (!credentialsRecord) {
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }

    const credentials = credentialsRecord.credentials;
    
    // Support both googleDriveAccounts array and single googleDrive object
    let account: GoogleDriveToken | null = null;
    
    if (accountId && credentials.googleDriveAccounts) {
      // Find specific account by accountId (backendId, keyPrefix, or full accountId string)
      // AccountId might be in format "google_drive::email-hash" or just "backendId" or "keyPrefix"
      account = credentials.googleDriveAccounts.find(
        (acc: any) => 
          acc.backendId === accountId || 
          acc.keyPrefix === accountId ||
          `${acc.backendId}` === accountId ||
          `${acc.keyPrefix}` === accountId ||
          (accountId.includes('::') && (acc.backendId === accountId.split('::')[1] || acc.keyPrefix === accountId.split('::')[1]))
      ) || null;
      
      if (!account) {
        console.error(`[GoogleDriveProxy] Account not found for accountId: ${accountId}`);
        console.error(`[GoogleDriveProxy] Available accounts:`, credentials.googleDriveAccounts.map((acc: any) => ({
          backendId: acc.backendId,
          keyPrefix: acc.keyPrefix
        })));
      }
    } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
      // Use first account if no accountId specified
      account = credentials.googleDriveAccounts[0];
    } else if (credentials.googleDrive) {
      // Fallback to single googleDrive object
      account = credentials.googleDrive;
    } else {
      account = credentials as GoogleDriveToken;
    }

    if (!account) {
      throw new Error('Google Drive account not found');
    }

    const token: GoogleDriveToken = {
      access_token: (account as any).access_token || (account as any).accessToken || account.access_token,
      refresh_token: (account as any).refresh_token || (account as any).refreshToken || account.refresh_token,
      expires_in: account.expires_in,
      token_type: account.token_type,
      expires_at: account.expires_at
    };

    if (!token.access_token) {
      throw new Error('Google Drive access token not found');
    }

    // Check if token needs refresh
    const now = Date.now();
    const expiresAt = token.expires_at || (token.expires_in ? now + (token.expires_in * 1000) : now + 3600000);
    
    // Always try to refresh if token is expired or close to expiring
    // Also refresh if token is older than 30 minutes (tokens typically expire after 1 hour)
    const tokenAge = expiresAt - now;
    const shouldRefresh = expiresAt < now + 60000 || tokenAge < 1800000; // Refresh if expires in < 1 min or age < 30 min
    
    console.log(`[GoogleDriveProxy] Token check for accountId: ${accountId || 'default'}, expiresAt: ${expiresAt}, now: ${now}, age: ${tokenAge}ms, shouldRefresh: ${shouldRefresh}`);
    
    // If we have a refresh token, always try to refresh to ensure we have a valid token
    if (token.refresh_token && shouldRefresh) {
      try {
        console.log(`[GoogleDriveProxy] Refreshing access token for accountId: ${accountId || 'default'}`);
        const refreshedToken = await this.refreshAccessToken(token.refresh_token);
        console.log(`[GoogleDriveProxy] Token refreshed successfully`);
        
        // Update stored credentials for the specific account
        if (accountId && credentials.googleDriveAccounts) {
          const accountIndex = credentials.googleDriveAccounts.findIndex(
            (acc: any) => 
              acc.backendId === accountId || 
              acc.keyPrefix === accountId ||
              `${acc.backendId}` === accountId ||
              `${acc.keyPrefix}` === accountId ||
              (accountId.includes('::') && (acc.backendId === accountId.split('::')[1] || acc.keyPrefix === accountId.split('::')[1]))
          );
          if (accountIndex >= 0) {
            credentials.googleDriveAccounts[accountIndex] = {
              ...credentials.googleDriveAccounts[accountIndex],
              access_token: refreshedToken.access_token,
              accessToken: refreshedToken.access_token,
              expires_at: refreshedToken.expires_in 
                ? Date.now() + (refreshedToken.expires_in * 1000)
                : undefined,
              expires_in: refreshedToken.expires_in,
              refresh_token: refreshedToken.refresh_token || token.refresh_token,
              refreshToken: refreshedToken.refresh_token || token.refresh_token
            };
          }
        } else if (credentials.googleDrive) {
          credentials.googleDrive = {
            ...credentials.googleDrive,
            access_token: refreshedToken.access_token,
            expires_at: refreshedToken.expires_in 
              ? Date.now() + (refreshedToken.expires_in * 1000)
              : undefined,
            expires_in: refreshedToken.expires_in,
            refresh_token: refreshedToken.refresh_token || token.refresh_token
          };
        }
        
        await storageCredentialsService.upsertCredentials(userDid, credentials);
        
        return refreshedToken.access_token;
      } catch (error: any) {
        console.error(`[GoogleDriveProxy] Failed to refresh Google Drive token:`, error.message || error);
        // If refresh fails, try using the existing token anyway (it might still be valid)
        // But log a warning
        console.warn(`[GoogleDriveProxy] Token refresh failed, attempting to use existing token`);
        // Don't throw - try the existing token first
      }
    }

    // Return the access token (either refreshed or original)
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
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents, description)',
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
    parents?: string[],
    accountId?: string
  ): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userDid, accountId);

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
      console.error(`[GoogleDriveProxy] Upload failed with status ${response.status}:`, errorText);
      
      // If we get a 401, the token is invalid - try refreshing it
      if (response.status === 401 && token.refresh_token) {
        console.log(`[GoogleDriveProxy] Got 401, attempting token refresh and retry`);
        try {
          const refreshedToken = await this.refreshAccessToken(token.refresh_token);
          // Retry upload with refreshed token
          const retryResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${refreshedToken.access_token}`,
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': body.length.toString(),
            },
            body: body,
          });
          
          if (!retryResponse.ok) {
            const retryErrorText = await retryResponse.text();
            throw new Error(`Failed to upload file after token refresh: ${retryErrorText}`);
          }
          
          return retryResponse.json() as Promise<GoogleDriveFile>;
        } catch (refreshError: any) {
          console.error(`[GoogleDriveProxy] Token refresh and retry failed:`, refreshError.message || refreshError);
          throw new Error(`Failed to upload file: ${errorText}`);
        }
      }
      
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

