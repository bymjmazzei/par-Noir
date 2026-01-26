/**
 * Google OAuth2 Helper
 * Creates properly configured OAuth2 clients that automatically handle token refresh
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

// Import at function level to avoid circular dependency
let googleDriveProxyService: any;

export interface GoogleDriveToken {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
}

export class GoogleOAuth2Helper {
  /**
   * Create a properly configured OAuth2 client that automatically refreshes tokens
   * @param token - Token object with access_token, refresh_token, expires_at
   * @param userPnIdentifier - For updating stored credentials on refresh
   * @param accountId - For updating stored credentials on refresh
   * @returns Configured OAuth2 client that handles token refresh automatically
   */
  static createClient(
    token: GoogleDriveToken,
    userPnIdentifier: string,
    accountId?: string
  ): OAuth2Client {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error('Google Drive OAuth2 credentials not configured. GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET must be set.');
    }
    
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    
    // Calculate expiry_date from expires_at (Google library expects timestamp in milliseconds)
    const expiryDate = token.expires_at 
      ? token.expires_at 
      : token.expires_in 
        ? Date.now() + (token.expires_in * 1000)
        : undefined;
    
    // Set credentials with ALL required fields for automatic refresh
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expiry_date: expiryDate, // Library expects timestamp in milliseconds
    });
    
    // Listen for token refresh events and update stored credentials
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        try {
          // Lazy import to avoid circular dependency
          if (!googleDriveProxyService) {
            const module = await import('./googleDriveProxy');
            googleDriveProxyService = module.googleDriveProxyService;
          }
          
          // Update stored credentials with new token
          await googleDriveProxyService.updateStoredToken(
            userPnIdentifier,
            accountId,
            tokens.access_token,
            tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
          );
          console.log(`[GoogleOAuth2Helper] Updated stored token after automatic refresh for ${userPnIdentifier}`);
        } catch (error: any) {
          console.error('[GoogleOAuth2Helper] Failed to update stored token after refresh:', error?.message || error);
          // Don't throw - token refresh succeeded, just failed to persist
        }
      }
    });
    
    return oauth2Client;
  }
}
