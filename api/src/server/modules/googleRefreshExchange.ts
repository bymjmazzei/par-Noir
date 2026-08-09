/**
 * The one place the server exchanges a Google refresh token for an access token.
 *
 * Under device cloud custody the user's refresh token lives on their device and
 * is presented per call; the server only contributes the par Noir app's own
 * client credentials, which it must never hand to a client.
 */

import { safeLogger } from '../../utils/logger';

export type GoogleRefreshFailure =
  | 'not_configured'
  | 'rejected'
  | 'unparseable'
  | 'no_access_token';

export type GoogleRefreshResult =
  | { ok: true; accessToken: string; refreshToken?: string; expiresIn: number }
  | { ok: false; reason: GoogleRefreshFailure; status: number; message: string };

/**
 * Exchange a refresh token with Google.
 * Never logs or returns the refresh token, the access token, or the app secret.
 */
export async function exchangeGoogleRefreshToken(
  refreshToken: string
): Promise<GoogleRefreshResult> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!clientSecret?.trim() || !clientId?.trim()) {
    safeLogger.error('[GoogleRefresh] OAuth client credentials not configured', {
      hasClientId: Boolean(clientId?.trim()),
      hasClientSecret: Boolean(clientSecret?.trim())
    });
    return {
      ok: false,
      reason: 'not_configured',
      status: 500,
      message:
        'Google OAuth client credentials are not configured on the server. Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.'
    };
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const responseText = await response.text();

  if (!response.ok) {
    let googleError: { error?: string; error_description?: string } = {};
    try {
      googleError = JSON.parse(responseText);
    } catch {
      googleError = { error: 'unparseable_google_error' };
    }
    // invalid_grant here means the user must reconnect Drive; surface the code
    // but never the token that produced it.
    safeLogger.warn('[GoogleRefresh] Google rejected the refresh token', {
      status: response.status,
      googleError: googleError.error
    });
    return {
      ok: false,
      reason: 'rejected',
      status: response.status === 400 || response.status === 401 ? 401 : 502,
      message: googleError.error_description || googleError.error || 'Google rejected the refresh token'
    };
  }

  let tokenData: { access_token?: string; refresh_token?: string; expires_in?: number };
  try {
    tokenData = JSON.parse(responseText);
  } catch {
    safeLogger.error('[GoogleRefresh] Could not parse Google token response');
    return {
      ok: false,
      reason: 'unparseable',
      status: 502,
      message: 'Could not parse the token response from Google'
    };
  }

  if (!tokenData.access_token?.trim()) {
    safeLogger.error('[GoogleRefresh] Google returned no access token');
    return {
      ok: false,
      reason: 'no_access_token',
      status: 502,
      message: 'Google returned no access token'
    };
  }

  return {
    ok: true,
    accessToken: tokenData.access_token.trim(),
    refreshToken: tokenData.refresh_token?.trim(),
    expiresIn:
      typeof tokenData.expires_in === 'number' && tokenData.expires_in > 0
        ? tokenData.expires_in
        : 3600
  };
}
