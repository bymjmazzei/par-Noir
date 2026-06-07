/**
 * Google Drive Proxy Service
 * Proxies Google Drive API calls using stored OAuth tokens
 */

import { storageCredentialsService } from './storageCredentialsService';
import { PNOAuthService } from './pnOAuthService';
import { hashIdentifier, safeLogger } from '../../utils/logger';

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
  async getAccessToken(userPnIdentifier: string, accountId?: string, additionalCandidates?: string[]): Promise<string> {
    safeLogger.info('[GoogleDriveProxy] getAccessToken called');
    
    // CRITICAL: Use ONLY the pn identifier (first candidate)
    // Dashboard stores credentials under pn identifier only, so we should only try that
    // The additionalCandidates array should only contain the pn identifier
    const pnIdentifier = userPnIdentifier?.startsWith('pn-') ? userPnIdentifier : (additionalCandidates?.[0] || userPnIdentifier);
    
    if (!pnIdentifier || !pnIdentifier.startsWith('pn-')) {
      safeLogger.error('[GoogleDriveProxy] Invalid pn identifier');
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }

    const { isPnRevokedForNetwork } = await import('./identitySuccessionService');
    if (isPnRevokedForNetwork(pnIdentifier)) {
      throw new Error('This pN identifier is retired on the par Noir network. Use your successor identity for Drive access.');
    }
    
    // Try pn identifier first; also try additionalCandidates (e.g. legacy raw identity_id from DB)
    const identifierCandidates = [pnIdentifier];
    if (additionalCandidates?.length) {
      for (const c of additionalCandidates) {
        if (c && c !== pnIdentifier && !identifierCandidates.includes(c)) {
          identifierCandidates.push(c);
        }
      }
    }
    
    safeLogger.info('[GoogleDriveProxy] Resolving credentials by identifier candidate', {
      subjectHash: hashIdentifier(userPnIdentifier),
      candidates: identifierCandidates.length,
    });
    
    // Try to find credentials using only the pn identifier
    const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
    
    if (!credentialsRecord) {
      safeLogger.warn('[GoogleDriveProxy] No credentials record found', {
        subjectHash: hashIdentifier(userPnIdentifier),
        candidates: identifierCandidates.length,
      });
      throw new Error('Google Drive not connected. Please connect in the dashboard.');
    }
    
    console.log(`[GoogleDriveProxy] Credentials record found`);

    const credentials = credentialsRecord.credentials;
    console.log(`[GoogleDriveProxy] Credential shape resolved`);
    
    // Support both googleDriveAccounts array and single googleDrive object
    let account: GoogleDriveToken | null = null;
    
    if (accountId && credentials.googleDriveAccounts) {
      // Extract the actual account identifier if accountId includes "::"
      const actualAccountId = accountId.includes('::') ? accountId.split('::')[1] : accountId;
      
      console.log(`[GoogleDriveProxy] Looking up requested account`);
      
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
        console.error(`[GoogleDriveProxy] Requested account not found`);
        throw new Error(`Google Drive account not found for accountId: ${accountId}`);
      }

      console.log(`[GoogleDriveProxy] Requested account resolved`);
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

    console.log(`[GoogleDriveProxy] Token metadata loaded`);

    if (!token.access_token) {
      console.error(`[GoogleDriveProxy] No access token found in account object`);
      throw new Error('Google Drive access token not found');
    }

    // Check if token needs refresh
    const now = Date.now();
    const expiresAt = token.expires_at || (token.expires_in ? now + (token.expires_in * 1000) : now + 3600000);
    
    // Only refresh if token is expired or expires within 5 minutes
    // Don't refresh unnecessarily - tokens are valid for 1 hour, so only refresh when needed
    const isExpired = expiresAt < now;
    const expiresSoon = expiresAt < now + 300000; // 5 minutes
    const shouldRefresh = isExpired || expiresSoon;
    
    safeLogger.info('[GoogleDriveProxy] Token check', { shouldRefresh, isExpired, expiresSoon });
    
    // Only refresh if token is expired or about to expire
    // Don't refresh unnecessarily - the stored token is valid if it's not expired
    if (token.refresh_token && shouldRefresh) {
      try {
        console.log(`[GoogleDriveProxy] Refreshing access token`);
        const refreshedToken = await this.refreshAccessToken(token.refresh_token);
        console.log(`[GoogleDriveProxy] Token refreshed successfully`);
        
        // Update stored credentials for the specific account
        // CRITICAL: Preserve refresh_token - Google often doesn't return a new one, so keep the existing one
        const preservedRefreshToken = refreshedToken.refresh_token || token.refresh_token || (account as any).refresh_token || (account as any).refreshToken;
        
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
              refresh_token: preservedRefreshToken,
              refreshToken: preservedRefreshToken
            };
          } else {
            // Account not found in array - this shouldn't happen, but log and try to use first account
            console.warn(`[GoogleDriveProxy] Requested account missing during refresh persistence`);
            // Try to update first account as fallback
            if (credentials.googleDriveAccounts.length > 0) {
              credentials.googleDriveAccounts[0] = {
                ...credentials.googleDriveAccounts[0],
                access_token: refreshedToken.access_token,
                accessToken: refreshedToken.access_token,
                expires_at: refreshedToken.expires_in 
                  ? Date.now() + (refreshedToken.expires_in * 1000)
                  : undefined,
                expires_in: refreshedToken.expires_in,
                refresh_token: preservedRefreshToken,
                refreshToken: preservedRefreshToken
              };
            }
          }
        } else if (credentials.googleDrive) {
          credentials.googleDrive = {
            ...credentials.googleDrive,
            access_token: refreshedToken.access_token,
            expires_at: refreshedToken.expires_in 
              ? Date.now() + (refreshedToken.expires_in * 1000)
              : undefined,
            expires_in: refreshedToken.expires_in,
            refresh_token: preservedRefreshToken
          };
        } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
          // Fallback: if no accountId but we have accounts, update the first one
          credentials.googleDriveAccounts[0] = {
            ...credentials.googleDriveAccounts[0],
            access_token: refreshedToken.access_token,
            accessToken: refreshedToken.access_token,
            expires_at: refreshedToken.expires_in 
              ? Date.now() + (refreshedToken.expires_in * 1000)
              : undefined,
            expires_in: refreshedToken.expires_in,
            refresh_token: preservedRefreshToken,
            refreshToken: preservedRefreshToken
          };
        }
        
        // CRITICAL: Always save credentials after refresh to persist the refresh token
        // CRITICAL: Use the pn identifier from the credentials record, not userPnIdentifier
        await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
        console.log(`[GoogleDriveProxy] Credentials saved after token refresh`);
        
        return refreshedToken.access_token;
      } catch (error: any) {
        safeLogger.error('[GoogleDriveProxy] Failed to refresh Google Drive token', {
          message: error.message || String(error),
        });
        
        // If refresh fails and token is expired, throw error immediately
        // Don't try to use expired token - user needs to reconnect
        if (isExpired) {
          throw new Error(`Google Drive authentication failed. Your Google Drive connection has expired. Please reconnect your Google Drive account in the dashboard. Error: ${error.message || 'Token refresh failed'}`);
        }
        
        // If token is still valid but refresh failed, try using existing token
        // This handles temporary network issues
        console.warn(`[GoogleDriveProxy] Token refresh failed but token is still valid, using existing token`);
      }
    }

    // Return the access token (either refreshed or original)
    const finalToken = token.access_token;
    
    // If token is expired and we didn't refresh, throw error
    if (isExpired && !shouldRefresh) {
      throw new Error('Google Drive access token has expired. Please reconnect your Google Drive account in the dashboard.');
    }
    
    console.log(`[GoogleDriveProxy] Returning access token`);
    return finalToken;
  }

  /**
   * Extract access token from already-fetched credentials (avoids duplicate DB query)
   * Use this when you already have credentials from getCredentials()
   */
  extractAccessTokenFromCredentials(
    credentials: any,
    accountId?: string
  ): string {
    const googleDriveAccounts = credentials.googleDriveAccounts || 
      (credentials.googleDrive ? [credentials.googleDrive] : []);
    
    if (googleDriveAccounts.length === 0) {
      throw new Error('Google Drive account not found');
    }

    let account: GoogleDriveToken | null = null;
    
    if (accountId && googleDriveAccounts.length > 0) {
      const actualAccountId = accountId.includes('::') ? accountId.split('::')[1] : accountId;
      account = googleDriveAccounts.find(
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
        account = googleDriveAccounts[0];
      }
    } else if (googleDriveAccounts.length > 0) {
      account = googleDriveAccounts[0];
    } else if (credentials.googleDrive) {
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

    // Check if token needs refresh (but don't refresh here - caller should use getAccessToken if refresh needed)
    const now = Date.now();
    const expiresAt = token.expires_at || (token.expires_in ? now + (token.expires_in * 1000) : now + 3600000);
    const isExpired = expiresAt < now;
    const expiresSoon = expiresAt < now + 300000; // 5 minutes
    
    // If token is expired or about to expire, caller should use getAccessToken() to refresh
    // But for performance, return it anyway and let the API call fail if needed
    // (Most tokens are valid for 1 hour, so this is rare)
    
    return token.access_token;
  }

  /**
   * Force refresh access token (public method for 401 retries)
   */
  async forceRefreshAccessToken(userPnIdentifier: string, accountId?: string, additionalCandidates?: string[]): Promise<string> {
    const pnIdentifier = userPnIdentifier?.startsWith('pn-') ? userPnIdentifier : (additionalCandidates?.[0] || userPnIdentifier);
    if (!pnIdentifier || !pnIdentifier.startsWith('pn-')) {
      throw new Error('Invalid pn identifier');
    }
    
    const identifierCandidates = [pnIdentifier];
    const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
    
    if (!credentialsRecord) {
      throw new Error('Google Drive not connected');
    }
    
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
    
    if (!account) {
      throw new Error('Google Drive account not found');
    }
    
    const refreshToken = (account as any).refresh_token || (account as any).refreshToken;
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    const refreshedToken = await this.refreshAccessToken(refreshToken);
    
    // Update stored credentials
    if (accountId && credentials.googleDriveAccounts) {
      const accountIndex = credentials.googleDriveAccounts.findIndex(
        (acc: any) => 
          acc.backendId === accountId || 
          acc.keyPrefix === accountId ||
          `${acc.backendId}` === accountId ||
          `${acc.keyPrefix}` === accountId
      );
      if (accountIndex >= 0) {
        credentials.googleDriveAccounts[accountIndex] = {
          ...credentials.googleDriveAccounts[accountIndex],
          access_token: refreshedToken.access_token,
          accessToken: refreshedToken.access_token,
          expires_at: refreshedToken.expires_in ? Date.now() + (refreshedToken.expires_in * 1000) : undefined,
          expires_in: refreshedToken.expires_in,
          refresh_token: refreshToken, // Preserve original refresh token
          refreshToken: refreshToken
        };
      }
    } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
      credentials.googleDriveAccounts[0] = {
        ...credentials.googleDriveAccounts[0],
        access_token: refreshedToken.access_token,
        accessToken: refreshedToken.access_token,
        expires_at: refreshedToken.expires_in ? Date.now() + (refreshedToken.expires_in * 1000) : undefined,
        expires_in: refreshedToken.expires_in,
        refresh_token: refreshToken,
        refreshToken: refreshToken
      };
    } else if (credentials.googleDrive) {
      credentials.googleDrive = {
        ...credentials.googleDrive,
        access_token: refreshedToken.access_token,
        expires_at: refreshedToken.expires_in ? Date.now() + (refreshedToken.expires_in * 1000) : undefined,
        expires_in: refreshedToken.expires_in,
        refresh_token: refreshToken
      };
    }
    
    await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
    return refreshedToken.access_token;
  }

  /**
   * Update stored token after automatic refresh by OAuth2 client library
   * Called from GoogleOAuth2Helper when tokens are refreshed automatically
   */
  async updateStoredToken(
    userPnIdentifier: string,
    accountId: string | undefined,
    newAccessToken: string,
    expiryDate?: Date
  ): Promise<void> {
    const pnIdentifier = userPnIdentifier?.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;

    if (!pnIdentifier || !pnIdentifier.startsWith('pn-')) {
      throw new Error('Invalid pn identifier');
    }

    const identifierCandidates = [pnIdentifier];
    const rawId = pnIdentifier.replace(/^pn-/, '');
    if (rawId && rawId !== pnIdentifier) {
      identifierCandidates.push(rawId);
    }
    const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
    
    if (!credentialsRecord) {
      throw new Error('Credentials not found');
    }
    
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
    
    if (!account) {
      throw new Error('Google Drive account not found');
    }
    
    // Update the account with new token
    const expiresAt = expiryDate ? expiryDate.getTime() : undefined;
    const expiresIn = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : undefined;
    
    if (accountId && credentials.googleDriveAccounts) {
      const accountIndex = credentials.googleDriveAccounts.findIndex(
        (acc: any) => 
          acc.backendId === accountId || 
          acc.keyPrefix === accountId ||
          `${acc.backendId}` === accountId ||
          `${acc.keyPrefix}` === accountId
      );
      if (accountIndex >= 0) {
        credentials.googleDriveAccounts[accountIndex] = {
          ...credentials.googleDriveAccounts[accountIndex],
          access_token: newAccessToken,
          accessToken: newAccessToken,
          expires_at: expiresAt,
          expires_in: expiresIn,
          // Preserve refresh_token
          refresh_token: (account as any).refresh_token || (account as any).refreshToken,
          refreshToken: (account as any).refresh_token || (account as any).refreshToken
        };
      }
    } else if (credentials.googleDriveAccounts && credentials.googleDriveAccounts.length > 0) {
      credentials.googleDriveAccounts[0] = {
        ...credentials.googleDriveAccounts[0],
        access_token: newAccessToken,
        accessToken: newAccessToken,
        expires_at: expiresAt,
        expires_in: expiresIn,
        refresh_token: (account as any).refresh_token || (account as any).refreshToken,
        refreshToken: (account as any).refresh_token || (account as any).refreshToken
      };
    } else if (credentials.googleDrive) {
      credentials.googleDrive = {
        ...credentials.googleDrive,
        access_token: newAccessToken,
        expires_at: expiresAt,
        expires_in: expiresIn,
        refresh_token: (account as any).refresh_token
      };
    }
    
    // Save updated credentials
    await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
  }

  /**
   * Refresh Google Drive access token
   */
  private async refreshAccessToken(refreshToken: string): Promise<GoogleDriveToken> {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    if (!clientSecret) {
      throw new Error('Google Drive client secret not configured');
    }
    if (!clientId || typeof clientId !== 'string' || clientId.trim() === '') {
      throw new Error('Google Drive client ID not configured');
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
  async listFiles(userPnIdentifier: string, query?: string, pageSize: number = 50, accountId?: string, additionalCandidates?: string[]): Promise<GoogleDriveFile[]> {
    let accessToken = await this.getAccessToken(userPnIdentifier, accountId, additionalCandidates);

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
      const pnIdentifier = userPnIdentifier?.startsWith('pn-') ? userPnIdentifier : (additionalCandidates?.[0] || userPnIdentifier);
      const identifierCandidates = pnIdentifier?.startsWith('pn-') ? [pnIdentifier] : [];
      const credentialsRecord = await storageCredentialsService.findCredentialsByIdentityCandidates(identifierCandidates);
      
      let refreshAttempted = false;
      let refreshSucceeded = false;
      
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
          refreshAttempted = true;
          try {
            // Force refresh by setting expires_at to past
            (account as any).expires_at = Date.now() - 1000;
            await storageCredentialsService.upsertCredentials(credentialsRecord.identityId, credentials);
            // Get fresh token (will trigger refresh)
            accessToken = await this.getAccessToken(userPnIdentifier, accountId, additionalCandidates);
            refreshSucceeded = true;
            
            // Retry the request with refreshed token
            response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
              },
            });
          } catch (refreshError: any) {
            console.error(`[GoogleDriveProxy] Token refresh failed:`, refreshError?.message || refreshError);
            // If refresh fails, the refresh token is likely invalid - user needs to reconnect
            throw new Error(`Google Drive authentication failed. Your Google Drive connection has expired. Please reconnect your Google Drive account in the dashboard. Error: ${refreshError?.message || 'Token refresh failed'}`);
          }
        } else {
          console.warn(`[GoogleDriveProxy] No refresh token available for account ${accountId || 'default'}`);
        }
      } else {
        console.warn(`[GoogleDriveProxy] No credentials record found for ${pnIdentifier}`);
      }
      
      // If we tried to refresh but still get 401, the refresh token is invalid
      if (refreshAttempted && refreshSucceeded && response.status === 401) {
        throw new Error(`Google Drive authentication failed. Your Google Drive connection has expired. Please reconnect your Google Drive account in the dashboard.`);
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      
      // If we still get a 401 after refresh attempt, the refresh token is likely invalid
      if (response.status === 401) {
        console.error(`[GoogleDriveProxy] Token refresh failed or refresh token is invalid. User needs to reconnect Google Drive.`);
        throw new Error(`Google Drive authentication failed. Please reconnect your Google Drive account in the dashboard. Original error: ${errorText}`);
      }
      
      throw new Error(`Failed to list files: ${errorText}`);
    }

    const data = await response.json() as { files?: GoogleDriveFile[] };
    return data.files || [];
  }

  /**
   * Upload file to Google Drive
   */
  async uploadFile(
    userPnIdentifier: string,
    file: Buffer,
    fileName: string,
    mimeType: string,
    parents?: string[],
    accountId?: string,
    additionalCandidates?: string[]
  ): Promise<GoogleDriveFile> {
    // Get access token and also get the account info for retry logic
    let accessToken = await this.getAccessToken(userPnIdentifier, accountId, additionalCandidates);
    
    // Get account info for refresh token if needed for retry
    const credentialsRecord = await storageCredentialsService.getCredentials(userPnIdentifier);
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
  async downloadFile(userPnIdentifier: string, fileId: string, accountId?: string, additionalCandidates?: string[]): Promise<Blob> {
    const accessToken = await this.getAccessToken(userPnIdentifier, accountId, additionalCandidates);

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
  async getFileMetadata(userPnIdentifier: string, fileId: string, accountId?: string): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userPnIdentifier, accountId);

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
  async deleteFile(userPnIdentifier: string, fileId: string, accountId?: string): Promise<void> {
    const accessToken = await this.getAccessToken(userPnIdentifier, accountId);

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
    userPnIdentifier: string,
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
      const accessToken = await this.getAccessToken(userPnIdentifier, accountId);
      
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
                await this.deleteFile(userPnIdentifier, jsonData.files[0].id, accountId);
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
            // Build token object from accessToken
            const token: { access_token: string } = { access_token: accessToken };
            const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
              token,
              metadataFolderId,
              fileId,
              userPnIdentifier,
              accountId
            );
            
            if (spreadsheetId) {
              try {
                await this.deleteFile(userPnIdentifier, spreadsheetId, accountId);
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
    userPnIdentifier: string,
    pnIdentifier: string,
    fileId: string,
    accountId?: string
  ): Promise<{ mainFileId?: string } | null> {
    if (!pnIdentifier || !fileId) {
      return null;
    }

    try {
      const accessToken = await this.getAccessToken(userPnIdentifier, accountId);
      
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
                    console.log(`[readCompanionMetadata] Found JSON metadata in ${contentType} folder for ${fileId}, checking for mainFileId...`);
                    if (jsonMetadata.mainFileId) {
                      console.log(`[readCompanionMetadata] Found mainFileId ${jsonMetadata.mainFileId} in JSON metadata for ${fileId}`);
                      return { mainFileId: jsonMetadata.mainFileId };
                    } else {
                      console.log(`[readCompanionMetadata] JSON metadata for ${fileId} exists but does not contain mainFileId`);
                    }
                  } catch (parseError) {
                    console.warn(`[readCompanionMetadata] Failed to parse JSON metadata for ${fileId} in ${contentType} folder:`, parseError);
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
              console.log(`[readCompanionMetadata] Found JSON metadata in flat structure for ${fileId}, checking for mainFileId...`);
              if (jsonMetadata.mainFileId) {
                console.log(`[readCompanionMetadata] Found mainFileId ${jsonMetadata.mainFileId} in JSON metadata for ${fileId}`);
                return { mainFileId: jsonMetadata.mainFileId };
              } else {
                console.log(`[readCompanionMetadata] JSON metadata for ${fileId} exists but does not contain mainFileId`);
              }
            } catch (parseError) {
              console.warn(`[readCompanionMetadata] Failed to parse JSON metadata for ${fileId} in flat structure:`, parseError);
            }
          }
        }
      }
      
      // Try spreadsheet metadata file
      const { CompanionMetadataSheets } = await import('./companionMetadataSheets');
      try {
        // Build token object from accessToken
        const token: { access_token: string } = { access_token: accessToken };
        // For readCompanionMetadata, we need userPnIdentifier - extract from pnIdentifier parameter
        // pnIdentifier is the owner of the file, so use it for metadata access
        const userPnIdentifierForMetadata = pnIdentifier || '';
        const accountIdForMetadata = accountId;
        
        const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
          token,
          metadataFolderId,
          fileId,
          userPnIdentifierForMetadata,
          accountIdForMetadata
        );
        
        if (spreadsheetId) {
          const spreadsheetMetadata = await CompanionMetadataSheets.readMetadata(
            token,
            spreadsheetId,
            userPnIdentifierForMetadata,
            accountIdForMetadata
          );
          
          if (spreadsheetMetadata?.mainFileId) {
            console.log(`[readCompanionMetadata] Found mainFileId ${spreadsheetMetadata.mainFileId} in spreadsheet metadata for ${fileId}`);
            return { mainFileId: spreadsheetMetadata.mainFileId };
          } else {
            console.log(`[readCompanionMetadata] Spreadsheet metadata for ${fileId} exists but does not contain mainFileId`);
          }
        }
      } catch (spreadsheetError) {
        // Non-critical - spreadsheet might not exist
      }
      
      console.log(`[readCompanionMetadata] No companion metadata found for ${fileId} (tried JSON in content type subfolders, flat structure, and spreadsheets)`);
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
    userPnIdentifier: string,
    fileId: string,
    updates: { name?: string; description?: string; parents?: string[] },
    accountId?: string
  ): Promise<GoogleDriveFile> {
    const accessToken = await this.getAccessToken(userPnIdentifier, accountId);

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

  /**
   * Grant Google Drive reader access to a specific user email (idempotent).
   */
  async grantReaderPermission(
    accessToken: string,
    fileId: string,
    emailAddress: string
  ): Promise<void> {
    const normalizedEmail = emailAddress.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('emailAddress is required to grant Drive reader permission');
    }

    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?fields=permissions(emailAddress)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (listRes.ok) {
      const data = (await listRes.json()) as { permissions?: Array<{ emailAddress?: string }> };
      const already = data.permissions?.some(
        (p) => p.emailAddress?.trim().toLowerCase() === normalizedEmail
      );
      if (already) {
        return;
      }
    }

    const shareRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'user',
          emailAddress: emailAddress.trim()
        })
      }
    );
    if (!shareRes.ok) {
      const errorText = await shareRes.text().catch(() => 'Unknown error');
      throw new Error(`Failed to grant Drive reader permission: ${errorText}`);
    }
  }

  /**
   * Resolve the primary Google account email stored for a pN identifier.
   */
  async getGoogleEmailForPn(userPnIdentifier: string, accountId?: string): Promise<string | null> {
    const pnIdentifier = userPnIdentifier.startsWith('pn-') ? userPnIdentifier : `pn-${userPnIdentifier}`;
    const credentialsRecord = await storageCredentialsService.getCredentials(pnIdentifier);
    const credentials = credentialsRecord?.credentials;
    if (!credentials) {
      return null;
    }
    const accounts =
      credentials.googleDriveAccounts ||
      (credentials.googleDrive ? [credentials.googleDrive] : []);
    if (accounts.length === 0) {
      return null;
    }
    let account = accounts[0] as { email?: string; accountId?: string; backendId?: string };
    if (accountId) {
      const match = accounts.find(
        (acc: any) =>
          acc.backendId === accountId ||
          acc.keyPrefix === accountId ||
          acc.accountId === accountId
      );
      if (match) {
        account = match as typeof account;
      }
    }
    const email = (account as { email?: string }).email;
    return email?.trim() || null;
  }
}

export const googleDriveProxyService = new GoogleDriveProxyService();

