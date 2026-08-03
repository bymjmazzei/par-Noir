import {
  buildAccountId,
  type StorageCredentialsEnvelope
} from '@par-noir/user-owned-storage';
import { exchangeGoogleOAuthCode, waitForOAuthPopupCode } from './oauthPopup';
import type { CloudProviderId } from './types';

export function isOAuthCloudProvider(
  provider: string | null | undefined
): provider is 'google_drive' | 'dropbox' | 'onedrive' {
  return provider === 'google_drive' || provider === 'dropbox' || provider === 'onedrive';
}

export function isCloudProviderId(value: string | null | undefined): value is CloudProviderId {
  return (
    value === 'google_drive' ||
    value === 'dropbox' ||
    value === 'onedrive' ||
    value === 'aws_s3' ||
    value === 'azure_blob' ||
    value === 'ftp'
  );
}

async function ownerFetch(
  apiEndpoint: string,
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${apiEndpoint.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return typeof data.email === 'string' && data.email.includes('@') ? data.email : null;
  } catch {
    return null;
  }
}

/** Prefer existing linked Google account ids so reconnect does not create a second layout row. */
async function resolveExistingGoogleLayout(
  apiEndpoint: string,
  authToken: string,
  pnIdentifier: string
): Promise<{
  envelope: StorageCredentialsEnvelope;
  accountId: string | null;
  backendId: string | null;
  keyPrefix: string | null;
}> {
  const empty = {
    envelope: {} as StorageCredentialsEnvelope,
    accountId: null as string | null,
    backendId: null as string | null,
    keyPrefix: null as string | null
  };
  try {
    const res = await ownerFetch(
      apiEndpoint,
      authToken,
      'GET',
      `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}`
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as { credentials?: StorageCredentialsEnvelope };
    const envelope = data.credentials ?? {};
    const prev = envelope.googleDriveAccounts?.[0];
    const accountId = prev?.accountId || prev?.backendId || null;
    const backendId = prev?.backendId || prev?.accountId || null;
    const keyPrefix = prev?.keyPrefix || null;
    return { envelope, accountId, backendId, keyPrefix };
  } catch {
    return empty;
  }
}

export interface ReconnectOAuthParams {
  provider: 'google_drive' | 'dropbox' | 'onedrive';
  pnIdentifier: string;
  authToken: string;
  apiEndpoint: string;
  googleClientId?: string | null;
}

/**
 * Start provider OAuth in the current user-gesture stack (window.open),
 * then exchange and return a local envelope with secrets.
 */
export async function reconnectOAuthProvider(
  params: ReconnectOAuthParams
): Promise<StorageCredentialsEnvelope> {
  const { provider, pnIdentifier, authToken, apiEndpoint, googleClientId } = params;
  if (provider === 'google_drive') {
    if (!googleClientId?.trim()) {
      throw new Error('Google Drive OAuth is not configured (missing client id).');
    }
    const redirectUri = `${window.location.origin}/oauth-callback.html`;
    const scope =
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(googleClientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `prompt=consent&access_type=offline`;
    const popup = window.open(authUrl, 'pn-cloud-google-oauth', 'width=500,height=700');
    if (!popup) throw new Error('Popup blocked — allow popups for OAuth.');
    const code = await waitForOAuthPopupCode();
    const tokens = await exchangeGoogleOAuthCode({ apiEndpoint, code, redirectUri });
    const email = await fetchGoogleUserEmail(tokens.accessToken);
    const existing = await resolveExistingGoogleLayout(apiEndpoint, authToken, pnIdentifier);
    const slug =
      email?.split('@')[0]?.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48) || 'default';
    const accountId =
      existing.accountId || buildAccountId('google_drive', pnIdentifier, slug);
    const backendId =
      existing.backendId ||
      (accountId.startsWith('google_drive::') ? accountId : `google_drive::${slug}`);
    const keyPrefix =
      existing.keyPrefix ||
      `google_drive_${backendId.replace(/^google_drive::/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
    const nowIso = new Date().toISOString();
    const prevAccount = existing.envelope.googleDriveAccounts?.[0] ?? {};
    const layoutAccount = {
      ...prevAccount,
      accountId,
      backendId,
      keyPrefix,
      ...(email ? { email } : {}),
      connectedAt: prevAccount.connectedAt || nowIso,
      updatedAt: nowIso
    };
    delete (layoutAccount as { accessToken?: string }).accessToken;
    delete (layoutAccount as { access_token?: string }).access_token;
    delete (layoutAccount as { refreshToken?: string }).refreshToken;
    delete (layoutAccount as { refresh_token?: string }).refresh_token;

    const layoutEnvelope: StorageCredentialsEnvelope = {
      ...existing.envelope,
      socialCloudProvider: existing.envelope.socialCloudProvider || 'google_drive',
      socialCloudAccountId: existing.envelope.socialCloudAccountId || accountId,
      googleDriveAccounts: [layoutAccount]
    };
    const putRes = await ownerFetch(
      apiEndpoint,
      authToken,
      'PUT',
      `/api/storage/credentials/${encodeURIComponent(pnIdentifier)}`,
      { credentials: layoutEnvelope }
    );
    if (!putRes.ok) {
      const err = (await putRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || 'Failed to update Drive layout on API');
    }

    return {
      ...layoutEnvelope,
      googleDriveAccounts: [
        {
          ...layoutAccount,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          email: email || undefined
        }
      ]
    };
  }

  const configRes = await fetch(`${apiEndpoint.replace(/\/$/, '')}/api/public-config`);
  const config = (await configRes.json()) as { dropboxAppKey?: string; microsoftClientId?: string };
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  let authUrl = '';
  if (provider === 'dropbox') {
    if (!config.dropboxAppKey) throw new Error('Dropbox is not configured on this server.');
    authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(config.dropboxAppKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&token_access_type=offline&state=pn_popup`;
  } else {
    if (!config.microsoftClientId) throw new Error('Microsoft OAuth is not configured on this server.');
    authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(config.microsoftClientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('Files.ReadWrite.AppFolder offline_access')}&state=pn_popup`;
  }
  const popup = window.open(authUrl, 'pn-cloud-oauth', 'width=500,height=700');
  if (!popup) throw new Error('Popup blocked — allow popups for OAuth.');
  const code = await waitForOAuthPopupCode();
  const exchangePath =
    provider === 'dropbox' ? '/api/storage/oauth/dropbox/exchange' : '/api/storage/oauth/onedrive/exchange';
  const res = await ownerFetch(apiEndpoint, authToken, 'POST', exchangePath, {
    code,
    redirectUri,
    pnIdentifier
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || 'Token exchange failed');
  }
  const data = (await res.json()) as {
    accessToken?: string;
    access_token?: string;
    refreshToken?: string;
    refresh_token?: string;
    accountId?: string;
    email?: string;
  };
  const accessToken = data.accessToken || data.access_token;
  const refreshToken = data.refreshToken || data.refresh_token;
  if (!accessToken) throw new Error('OAuth exchange returned no access token');
  const accountId = data.accountId || buildAccountId(provider, pnIdentifier, 'reconnect');
  if (provider === 'dropbox') {
    return {
      socialCloudProvider: 'dropbox',
      socialCloudAccountId: accountId,
      dropboxAccounts: [
        {
          accountId,
          accessToken,
          refreshToken,
          email: data.email
        }
      ]
    };
  }
  return {
    socialCloudProvider: 'onedrive',
    socialCloudAccountId: accountId,
    onedriveAccounts: [
      {
        accountId,
        accessToken,
        refreshToken,
        email: data.email
      }
    ]
  };
}

export { ownerFetch };
