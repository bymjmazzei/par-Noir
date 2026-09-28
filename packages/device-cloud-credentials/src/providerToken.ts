/**
 * Device-side OAuth code exchange and refresh.
 * The par Noir API never sees a provider refresh token or authorization code.
 * Google's Web client requires client_secret on this post to Google. Callers
 * pass that secret; Dropbox and Microsoft stay without one.
 */

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
export const MICROSOFT_TOKEN_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const PKCE_KEY = 'pn_provider_pkce_verifier';

export interface ProviderTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64url(bytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export async function authorizeUrlWithPkce(authUrl: string): Promise<string> {
  const pkce = await createPkcePair();
  rememberPkceVerifier(pkce.verifier);
  const join = authUrl.includes('?') ? '&' : '?';
  return `${authUrl}${join}code_challenge=${encodeURIComponent(pkce.challenge)}&code_challenge_method=S256`;
}

export function rememberPkceVerifier(verifier: string): void {
  try {
    sessionStorage.setItem(PKCE_KEY, verifier);
  } catch {
    /* non-browser */
  }
}

export function takePkceVerifier(): string | null {
  try {
    const value = sessionStorage.getItem(PKCE_KEY);
    sessionStorage.removeItem(PKCE_KEY);
    return value?.trim() || null;
  } catch {
    return null;
  }
}

async function postToken(
  tokenUrl: string,
  body: URLSearchParams
): Promise<ProviderTokenResult | null> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const accessToken = data.access_token?.trim() || '';
  if (!accessToken) return null;
  const expiresIn =
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in > 0
      ? data.expires_in
      : 3600;
  const refreshToken = data.refresh_token?.trim() || undefined;
  return { accessToken, refreshToken, expiresIn };
}

function applyClientSecret(body: URLSearchParams, clientSecret?: string | null): void {
  const secret = clientSecret?.trim();
  if (secret) body.set('client_secret', secret);
}

export async function exchangeProviderAuthorizationCode(opts: {
  tokenUrl: string;
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
  scope?: string;
  /** Required by Google's Web client. Omitted for Dropbox and Microsoft. */
  clientSecret?: string | null;
}): Promise<ProviderTokenResult | null> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    grant_type: 'authorization_code'
  });
  applyClientSecret(body, opts.clientSecret);
  if (opts.codeVerifier?.trim()) body.set('code_verifier', opts.codeVerifier.trim());
  if (opts.scope) body.set('scope', opts.scope);
  return postToken(opts.tokenUrl, body);
}

export async function refreshProviderAccessToken(opts: {
  tokenUrl: string;
  clientId: string;
  refreshToken: string;
  scope?: string;
  /** Required by Google's Web client. Omitted for Dropbox and Microsoft. */
  clientSecret?: string | null;
}): Promise<ProviderTokenResult | null> {
  const body = new URLSearchParams({
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    grant_type: 'refresh_token'
  });
  applyClientSecret(body, opts.clientSecret);
  if (opts.scope) body.set('scope', opts.scope);
  return postToken(opts.tokenUrl, body);
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<{ email?: string; name?: string }> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return {};
  const data = (await res.json()) as { email?: string; name?: string };
  return {
    email: typeof data.email === 'string' && data.email.includes('@') ? data.email : undefined,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined
  };
}
