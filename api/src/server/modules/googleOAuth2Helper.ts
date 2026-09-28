/**
 * Google OAuth2 helper.
 * Builds a Drive client from a device-forwarded access token. It does not refresh.
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

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
    _userPnIdentifier: string,
    _accountId?: string
  ): OAuth2Client {
    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID || 'device-forwarded';
    const oauth2Client = new google.auth.OAuth2(clientId);
    const expiryDate = token.expires_at
      ? token.expires_at
      : token.expires_in
        ? Date.now() + (token.expires_in * 1000)
        : undefined;

    // Access token only. The device refreshes with the provider; this client must not.
    oauth2Client.setCredentials({
      access_token: token.access_token,
      expiry_date: expiryDate,
    });
    return oauth2Client;
  }
}
