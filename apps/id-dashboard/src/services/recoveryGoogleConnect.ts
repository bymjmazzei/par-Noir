/**
 * Google sign-in for finishing recovery before any pN is unlocked. The token stays on
 * this device and is only used to read the owner's recovery proof from Drive.
 */
import { waitForOAuthPopupCode } from '@par-noir/oauth-ui';
import {
  authorizeUrlWithPkce,
  exchangeProviderAuthorizationCode,
  GOOGLE_TOKEN_URL,
  takePkceVerifier,
} from '@par-noir/device-cloud-credentials';
import { getGoogleDriveClientId, getGoogleDriveClientSecret } from '../config/googleDriveClientId';

const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

export async function connectGoogleForRecovery(): Promise<string> {
  const clientId = await getGoogleDriveClientId();
  const clientSecret = await getGoogleDriveClientSecret();
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new Error('Google sign-in is not configured.');
  }
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const authUrl = await authorizeUrlWithPkce(
    'https://accounts.google.com/o/oauth2/v2/auth?' +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      'response_type=code&' +
      `scope=${encodeURIComponent(SCOPE)}&` +
      `state=${encodeURIComponent('pn_popup')}&` +
      'prompt=select_account'
  );
  // Listen before opening so the popup handoff cannot race the waiter.
  const codePromise = waitForOAuthPopupCode();
  const popup = window.open(authUrl, 'Google sign-in', 'width=500,height=600,left=100,top=100');
  if (!popup) throw new Error('Popup blocked. Allow popups for this site.');
  const code = await codePromise;
  const tokens = await exchangeProviderAuthorizationCode({
    tokenUrl: GOOGLE_TOKEN_URL,
    clientId,
    clientSecret,
    code,
    redirectUri,
    codeVerifier: takePkceVerifier(),
  });
  if (!tokens?.accessToken) throw new Error('Google sign-in failed.');
  return tokens.accessToken;
}
