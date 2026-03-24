import { API_ENDPOINT } from '../config/api';

const PN_CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'browser-app';
const STORAGE_KEY = 'pn_api_token';
const OAUTH_STATE_KEY = 'pn_oauth_state';

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

export interface InlineOAuthAcquireInput {
  encryptedIdentity: {
    encryptedData: string;
    iv: string;
    salt: string;
  };
  publicKey: string;
  did: string;
  pnName: string;
  passcode: string;
  redirectUri?: string;
  scope?: string[];
}

interface OAuthResumeResult {
  code: string | null;
  error: string | null;
  errorDescription: string | null;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function oauthStatesMatch(incoming: string, expected: string): boolean {
  const a = incoming.trim();
  const b = expected.trim();
  if (a === b) return true;
  try {
    return decodeURIComponent(a) === decodeURIComponent(b);
  } catch {
    return false;
  }
}

function getScope(scope?: string[]): string[] {
  return scope && scope.length > 0 ? scope : ['openid', 'profile'];
}

export function getStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (parsed.expiresAt < Date.now() + 60_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredToken(token: StoredToken | null): void {
  if (token) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function clearStoredToken(): void {
  setStoredToken(null);
}

export async function acquireApiTokenInline(input: InlineOAuthAcquireInput): Promise<string> {
  const redirectUri = input.redirectUri || `${window.location.origin}/oauth-callback.html`;
  const scope = getScope(input.scope);
  const state = randomHex(16);
  const nonce = randomHex(16);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const authResponse = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PN_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: scope.join(' '),
      state,
      nonce,
      encrypted_identity: input.encryptedIdentity,
      passcode: input.passcode,
      public_key: input.publicKey,
      did: input.did,
      pn_identifier: await derivePnIdentifier(input.pnName, input.passcode, input.publicKey)
    })
  });

  if (!authResponse.ok) {
    const err = await authResponse.json().catch(() => ({}));
    throw new Error((err as { error_description?: string }).error_description || 'Inline OAuth authentication failed');
  }

  const authResult = (await authResponse.json()) as { code?: string };
  if (!authResult.code) {
    throw new Error('No authorization code received from OAuth authentication');
  }

  return exchangeCodeForToken(authResult.code, redirectUri);
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${API_ENDPOINT}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: PN_CLIENT_ID,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error_description?: string }).error_description || 'Token exchange failed');
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function consumeOAuthResumeFromUrl(redirectUri?: string): Promise<OAuthResumeResult | null> {
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth_resume') !== '1') return null;

  const code = params.get('code');
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  const incomingState = params.get('state');
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);

  try {
    if (incomingState && expectedState && !oauthStatesMatch(incomingState, expectedState)) {
      throw new Error('Sign-in could not be verified. Please try again.');
    }
    return {
      code,
      error,
      errorDescription: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : null
    };
  } finally {
    const url = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', url);
    if (redirectUri) {
      void redirectUri;
    }
  }
}

async function derivePnIdentifier(pnName: string, passcode: string, publicKey: string): Promise<string> {
  const combined = `${pnName}:${passcode}:${publicKey}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(combined));
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `pn-${hash.slice(0, 12)}`;
}
