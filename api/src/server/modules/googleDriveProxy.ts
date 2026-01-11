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
  async getAccessToken(userDid: string, accountId?: string, additionalCandidates?: string[]): Promise<string> {
    console.log(`[GoogleDriveProxy] getAccessToken called with userDid: ${userDid}, accountId: ${accountId}`);
    
    // CRITICAL: Use ONLY the pn identifier (first candidate)
    // Dashboard stores credentials under pn identifier only, so we should only try that
    // The additionalCandidates array should only contain the pn identifier
    const pnIdentifier = userDid?.startsWith('pn-') ? userDid : (additionalCandidates?.[0] || userDid);
    
    if (!pnIdentifier || !pnIdentifier.startsWith('pn-')) {
      console.error(`[GoogleDriveProxy] Invalid pn identifier: ${pnIdentifier}. Expected format: pn-{hash}`);
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }
    
    // CRITICAL: Only try the pn identifier - no fallback to DID or public key
    const identifierCandidates = [pnIdentifier];
    
    console.log(`[GoogleDriveProxy] Using pn identifier only: ${pnIdentifier}`);
    
    // Try to find credentials using only the pn identifier
    const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
    
    if (!credentialsRecord) {
      console.error(`[GoogleDriveProxy] No credentials record found for userDid: ${userDid} (tried: ${identifierCandidates.filter(Boolean).join(', ')})`);
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }
    
    const usedIdentifier = credentialsRecord.identityId;
    
    console.log(`[GoogleDriveProxy] Using credentials stored under identifier: ${usedIdentifier}`);

    const credentials = credentialsRecord.credentials;
    console.log(`[GoogleDriveProxy] Found credentials record. Has googleDriveAccounts: ${!!credentials.googleDriveAccounts}, has googleDrive: ${!!credentials.googleDrive}`);
    
    // Support both googleDriveAccounts array and single googleDrive object
    let account: GoogleDriveToken | null = null;
    
    if (accountId && credentials.googleDriveAccounts) {
      // Extract the actual account identifier if accountId includes "::"
      const actualAccountId = accountId.includes('::') ? accountId.split('::')[1] : accountId;
      
      console.log(`[GoogleDriveProxy] Looking for account with accountId: ${accountId} (actualAccountId: ${actualAccountId})`);
      console.log(`[GoogleDriveProxy] Available accounts:`, credentials.googleDriveAccounts.map((acc: any) => ({
        backendId: acc.backendId,
        keyPrefix: acc.keyPrefix
      })));
      
      // Find specific account by accountId (backendId, keyPrefix, or full accountId string)
      // AccountId might be in format "google_drive::email-hash" or just "backendId" or "keyPrefix"
      account = credentials.googleDriveAccounts.find(
        (acc: any) => 
          acc.backendId === accountId || 
          acc.keyPrefix === accountId ||
          acc.backendId === actualAccountId ||
          acc.keyPrefix === actualAccountId ||
          `${acc.backendId}` === accountId ||
          `${acc.keyPrefix}` === accountId ||
          `${acc.backendId}` === actualAccountId ||
          `${acc.keyPrefix}` === actualAccountId
      ) || null;
      
      if (!account) {
        console.error(`[GoogleDriveProxy] Account not found for accountId: ${accountId} (actualAccountId: ${actualAccountId})`);
        console.error(`[GoogleDriveProxy] Available accounts:`, credentials.googleDriveAccounts.map((acc: any) => ({
          backendId: acc.backendId,
          keyPrefix: acc.keyPrefix
        })));
        throw new Error(`Google Drive account not found for accountId: ${accountId}`);
      }
      
      console.log(`[GoogleDriveProxy] Found matching account:`, { backendId: (account as any).backendId, keyPrefix: (account as any).keyPrefix });
    } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
      // Use first account if no accountId specified
      account = credentials.googleDriveAccounts[0];
      console.log(`[GoogleDriveProxy] Using first account (no accountId specified)`);
    } else if (credentials.googleDrive) {
      // Fallback to single googleDrive object
      account = credentials.googleDrive;
      console.log(`[GoogleDriveProxy] Using single googleDrive object`);
    } else {
      account = credentials as GoogleDriveToken;
      console.log(`[GoogleDriveProxy] Using credentials as GoogleDriveToken`);
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

    console.log(`[GoogleDriveProxy] Token extracted from account:`, {
      hasAccessToken: !!token.access_token,
      accessTokenLength: token.access_token?.length || 0,
      accessTokenPrefix: token.access_token?.substring(0, 20) || 'N/A',
      hasRefreshToken: !!token.refresh_token,
      expires_at: token.expires_at,
      expires_in: token.expires_in,
      accountKeys: Object.keys(account || {})
    });

    if (!token.access_token) {
      console.error(`[GoogleDriveProxy] No access token found in account object. Account keys:`, Object.keys(account || {}));
      throw new Error('Google Drive access token not found');
    }

    // Check if token needs refresh
    const now = Date.now();
    const expiresAt = token.expires_at || (token.expires_in ? now + (token.expires_in * 1000) : now + 3600000);
    
    // Always try to refresh if token is expired or close to expiring
    // Also refresh if token is older than 30 minutes (tokens typically expire after 1 hour)
    // OR if expires_at is in the past (force refresh)
    const tokenAge = expiresAt - now;
    const isExpired = expiresAt < now;
    const shouldRefresh = isExpired || expiresAt < now + 60000 || tokenAge < 1800000; // Refresh if expired, expires in < 1 min, or age < 30 min
    
    console.log(`[GoogleDriveProxy] Token check for accountId: ${accountId || 'default'}, expiresAt: ${expiresAt}, now: ${now}, age: ${tokenAge}ms, shouldRefresh: ${shouldRefresh}`);
    
    // Only refresh if token is expired or about to expire
    // Don't refresh unnecessarily - the stored token is valid if it's not expired
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
        
        // CRITICAL: Use the pn identifier from the credentials record, not userDid
        await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
        
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
    const finalToken = token.access_token;
    console.log(`[GoogleDriveProxy] Returning access token. Length: ${finalToken?.length || 0}, Prefix: ${finalToken?.substring(0, 20) || 'N/A'}`);
    return finalToken;
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
  async listFiles(userDid: string, query?: string, pageSize: number = 50, accountId?: string, additionalCandidates?: string[]): Promise<GoogleDriveFile[]> {
    let accessToken = await this.getAccessToken(userDid, accountId, additionalCandidates);

    const params = new URLSearchParams({
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, parents, description)',
      pageSize: pageSize.toString(),
      orderBy: 'modifiedTime desc',
    });

    if (query) {
      params.append('q', query);
    }

    // Try the request, and if we get a 401, refresh the token and retry once
    let response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    // If we get a 401, the token is invalid - force refresh and retry
    if (response.status === 401) {
      console.log(`[GoogleDriveProxy] Got 401 from Google Drive API, forcing token refresh and retrying...`);
      
      // Force refresh by getting credentials and updating expires_at to past
      // CRITICAL: Use only pn identifier
      const pnIdentifier = userDid?.startsWith('pn-') ? userDid : (additionalCandidates?.[0] || userDid);
      const identifierCandidates = pnIdentifier?.startsWith('pn-') ? [pnIdentifier] : [];
      const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
      if (credentialsRecord) {
        const credentials = credentialsRecord.credentials;
        let account: GoogleDriveToken | null = null;
        
        if (accountId && credentials.googleDriveAccounts) {
          const actualAccountId = accountId.includes('::') ? accountId.split('::')[1] : accountId;
          account = credentials.googleDriveAccounts.find(
            (acc: any) => 
              acc.backendId === accountId || 
              acc.keyPrefix === accountId ||
              acc.backendId === actualAccountId ||
              acc.keyPrefix === actualAccountId
          ) || null;
        } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
          account = credentials.googleDriveAccounts[0];
        } else if (credentials.googleDrive) {
          account = credentials.googleDrive;
        }
        
        if (account && ((account as any).refresh_token || (account as any).refreshToken)) {
          // Force refresh by setting expires_at to past
          (account as any).expires_at = Date.now() - 1000;
          await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
          // Get fresh token (will trigger refresh)
          accessToken = await this.getAccessToken(userDid, accountId, additionalCandidates);
          
          // Retry the request with refreshed token
          response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });
        }
      }
    }

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
    accountId?: string,
    additionalCandidates?: string[]
  ): Promise<GoogleDriveFile> {
    // Get access token and also get the account info for retry logic
    let accessToken = await this.getAccessToken(userDid, accountId, additionalCandidates);
    
    // Get account info for refresh token if needed for retry
    const credentialsRecord = await storageCredentialsService.getCredentials(userDid);
    const credentials = credentialsRecord?.credentials;
    let refreshToken: string | undefined;
    if (accountId && credentials?.googleDriveAccounts) {
      const account = credentials.googleDriveAccounts.find(
        (acc: any) => 
          acc.backendId === accountId || 
          acc.keyPrefix === accountId ||
          `${acc.backendId}` === accountId ||
          `${acc.keyPrefix}` === accountId ||
          (accountId.includes('::') && (acc.backendId === accountId.split('::')[1] || acc.keyPrefix === accountId.split('::')[1]))
      );
      refreshToken = account ? ((account as any).refresh_token || (account as any).refreshToken) : undefined;
    } else if (credentials?.googleDriveAccounts?.[0]) {
      refreshToken = (credentials.googleDriveAccounts[0] as any).refresh_token || (credentials.googleDriveAccounts[0] as any).refreshToken;
    } else if (credentials?.googleDrive) {
      refreshToken = (credentials.googleDrive as any).refresh_token || (credentials.googleDrive as any).refreshToken;
    }

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
      if (response.status === 401 && refreshToken) {
        console.log(`[GoogleDriveProxy] Got 401, attempting token refresh and retry`);
        try {
          const refreshedToken = await this.refreshAccessToken(refreshToken);
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
  async downloadFile(userDid: string, fileId: string, accountId?: string, additionalCandidates?: string[]): Promise<Blob> {
    const accessToken = await this.getAccessToken(userDid, accountId, additionalCandidates);

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
  async getFileMetadata(userDid: string, fileId: string, accountId?: string): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userDid, accountId);

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

  /**
   * Delete file from Google Drive
   */
  async deleteFile(userDid: string, fileId: string, accountId?: string): Promise<void> {
    const accessToken = await this.getAccessToken(userDid, accountId);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete file: ${errorText}`);
    }
  }

  /**
   * Delete companion metadata files (JSON and spreadsheet) for given file IDs
   * This is a non-throwing function that gracefully handles errors
   */
  async deleteCompanionMetadataFiles(
    userDid: string,
    pnIdentifier: string,
    fileIds: string[],
    accountId?: string
  ): Promise<{ deletedJson: number; deletedSpreadsheets: number; errors: string[] }> {
    const result = {
      deletedJson: 0,
      deletedSpreadsheets: 0,
      errors: [] as string[]
    };

    if (!pnIdentifier || !fileIds || fileIds.length === 0) {
      return result;
    }

    try {
      const accessToken = await this.getAccessToken(userDid, accountId);
      
      // Get pN folder and metadata folder
      const pnFolderName = `par Noir - ${pnIdentifier}`;
      const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
      
      const folderResponse = await fetch(folderSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!folderResponse.ok) {
        result.errors.push('Failed to find pN folder');
        return result;
      }

      const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
      if (!folderData.files || folderData.files.length === 0) {
        result.errors.push('pN folder not found');
        return result;
      }

      const pnFolderId = folderData.files[0].id;
      
      // Get metadata folder
      const metadataFolderName = '_metadata';
      const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
      
      const metadataFolderResponse = await fetch(metadataSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!metadataFolderResponse.ok) {
        result.errors.push('Failed to find metadata folder');
        return result;
      }

      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
      if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
        result.errors.push('Metadata folder not found');
        return result;
      }

      const metadataFolderId = metadataFolderData.files[0].id;
      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');

      // Delete metadata files for each fileId
      for (const fileId of fileIds) {
        try {
          // Delete JSON metadata file: {fileId}.metadata.json
          const jsonMetadataFileName = `${fileId}.metadata.json`;
          const jsonSearchQuery = `name='${jsonMetadataFileName.replace(/'/g, "\\'")}' and '${metadataFolderId}' in parents and trashed=false`;
          const jsonSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(jsonSearchQuery)}&fields=files(id)&pageSize=1`;
          
          const jsonResponse = await fetch(jsonSearchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (jsonResponse.ok) {
            const jsonData = await jsonResponse.json() as { files?: Array<{ id: string }> };
            if (jsonData.files && jsonData.files.length > 0) {
              try {
                await this.deleteFile(userDid, jsonData.files[0].id, accountId);
                result.deletedJson++;
                console.log(`✅ [deleteCompanionMetadataFiles] Deleted JSON metadata file for ${fileId}`);
              } catch (jsonDeleteError: any) {
                const errorMsg = jsonDeleteError?.message || String(jsonDeleteError);
                if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
                  result.errors.push(`Failed to delete JSON metadata for ${fileId}: ${errorMsg}`);
                }
              }
            }
          }

          // Delete spreadsheet metadata file
          try {
            const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
              accessToken,
              metadataFolderId,
              fileId
            );
            
            if (spreadsheetId) {
              try {
                await this.deleteFile(userDid, spreadsheetId, accountId);
                result.deletedSpreadsheets++;
                console.log(`✅ [deleteCompanionMetadataFiles] Deleted spreadsheet metadata for ${fileId}`);
              } catch (spreadsheetDeleteError: any) {
                const errorMsg = spreadsheetDeleteError?.message || String(spreadsheetDeleteError);
                if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
                  result.errors.push(`Failed to delete spreadsheet metadata for ${fileId}: ${errorMsg}`);
                }
              }
            }
          } catch (spreadsheetFindError: any) {
            // Non-critical - spreadsheet might not exist
            console.log(`ℹ️ [deleteCompanionMetadataFiles] Could not find spreadsheet metadata for ${fileId}`);
          }
        } catch (fileError: any) {
          result.errors.push(`Error processing metadata deletion for ${fileId}: ${fileError?.message || fileError}`);
        }
      }
    } catch (error: any) {
      result.errors.push(`Failed to delete companion metadata files: ${error?.message || error}`);
    }

    return result;
  }

  /**
   * Read companion metadata (JSON or spreadsheet) to get mainFileId connection
   * Returns object with mainFileId if found, null otherwise
   */
  async readCompanionMetadata(
    userDid: string,
    pnIdentifier: string,
    fileId: string,
    accountId?: string
  ): Promise<{ mainFileId?: string } | null> {
    if (!pnIdentifier || !fileId) {
      return null;
    }

    try {
      const accessToken = await this.getAccessToken(userDid, accountId);
      
      // Get pN folder and metadata folder
      const pnFolderName = `par Noir - ${pnIdentifier}`;
      const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
      
      const folderResponse = await fetch(folderSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!folderResponse.ok) {
        return null;
      }

      const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
      if (!folderData.files || folderData.files.length === 0) {
        return null;
      }

      const pnFolderId = folderData.files[0].id;
      
      // Get metadata folder
      const metadataFolderName = '_metadata';
      const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
      
      const metadataFolderResponse = await fetch(metadataSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!metadataFolderResponse.ok) {
        return null;
      }

      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
      if (!metadataFolderData.files || metadataFolderData.files.length === 0) {
        return null;
      }

      const metadataFolderId = metadataFolderData.files[0].id;
      
      // Try JSON metadata file first - check content type subfolders, then flat structure
      const jsonMetadataFileName = `${fileId}.metadata.json`;
      const contentTypes = ['media', 'thoughts', 'collections'];
      
      // Try content type subfolders first (new structure)
      for (const contentType of contentTypes) {
        const subfolderQuery = `name='${contentType}' and '${metadataFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const subfolderUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id)&pageSize=1`;
        
        const subfolderResponse = await fetch(subfolderUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (subfolderResponse.ok) {
          const subfolderData = await subfolderResponse.json() as { files?: Array<{ id: string }> };
          if (subfolderData.files && subfolderData.files.length > 0) {
            const subfolderId = subfolderData.files[0].id;
            const jsonSearchQuery = `name='${jsonMetadataFileName.replace(/'/g, "\\'")}' and '${subfolderId}' in parents and trashed=false`;
            const jsonSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(jsonSearchQuery)}&fields=files(id)&pageSize=1`;
            
            const jsonResponse = await fetch(jsonSearchUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (jsonResponse.ok) {
              const jsonData = await jsonResponse.json() as { files?: Array<{ id: string }> };
              if (jsonData.files && jsonData.files.length > 0) {
                // Download and parse JSON metadata file
                const jsonFileId = jsonData.files[0].id;
                const downloadResponse = await fetch(
                  `https://www.googleapis.com/drive/v3/files/${jsonFileId}?alt=media`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                
                if (downloadResponse.ok) {
                  try {
                    const jsonMetadata = await downloadResponse.json() as any;
                    if (jsonMetadata.mainFileId) {
                      return { mainFileId: jsonMetadata.mainFileId };
                    }
                  } catch {
                    // Invalid JSON, continue to next option
                  }
                }
              }
            }
          }
        }
      }
      
      // Fallback to flat structure (old structure - search directly in metadata folder)
      const flatJsonSearchQuery = `name='${jsonMetadataFileName.replace(/'/g, "\\'")}' and '${metadataFolderId}' in parents and trashed=false`;
      const flatJsonSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(flatJsonSearchQuery)}&fields=files(id)&pageSize=1`;
      
      const flatJsonResponse = await fetch(flatJsonSearchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (flatJsonResponse.ok) {
        const flatJsonData = await flatJsonResponse.json() as { files?: Array<{ id: string }> };
        if (flatJsonData.files && flatJsonData.files.length > 0) {
          const jsonFileId = flatJsonData.files[0].id;
          const downloadResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${jsonFileId}?alt=media`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
          );
          
          if (downloadResponse.ok) {
            try {
              const jsonMetadata = await downloadResponse.json() as any;
              if (jsonMetadata.mainFileId) {
                return { mainFileId: jsonMetadata.mainFileId };
              }
            } catch {
              // Invalid JSON, continue to spreadsheet
            }
          }
        }
      }
      
      // Try spreadsheet metadata file
      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
      try {
        const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
          accessToken,
          metadataFolderId,
          fileId
        );
        
        if (spreadsheetId) {
          const spreadsheetMetadata = await CompanionMetadataSheets.readMetadata(
            accessToken,
            spreadsheetId
          );
          
          // Note: CompanionMetadata interface doesn't have mainFileId, but check if it exists in the raw data
          // For now, spreadsheets may not have mainFileId, so return null if not found in JSON
          // The user confirmed mainFileId is in companion metadata files, so it should be in JSON
          return null;
        }
      } catch (spreadsheetError) {
        // Non-critical - spreadsheet might not exist
      }
      
      return null;
    } catch (error: any) {
      console.error(`[readCompanionMetadata] Error reading companion metadata for ${fileId}:`, error?.message || error);
      return null;
    }
  }

  /**
   * Update file metadata in Google Drive
   */
  async updateFileMetadata(
    userDid: string,
    fileId: string,
    updates: { name?: string; description?: string; parents?: string[] },
    accountId?: string
  ): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userDid, accountId);

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update file: ${errorText}`);
    }

    return response.json() as Promise<GoogleDriveFile>;
  }
}

export const googleDriveProxyService = new GoogleDriveProxyService();

