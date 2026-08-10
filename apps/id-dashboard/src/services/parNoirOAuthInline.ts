import { API_ENDPOINT } from '../config/api';
import { retry } from '../utils/helpers';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import {
  base64ToBytes,
  deriveCanonicalPnIdentifier,
  signOauthUnlockProof,
} from '@par-noir/pqc-crypto';

const PN_CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'browser-app';
const STORAGE_KEY = 'pn_api_token';
const OAUTH_STATE_KEY = 'pn_oauth_state';

export interface StoredToken {
  accessToken: string;
  expiresAt: number;
  /** pN identifier this token was issued for (so we never reuse it for a different pN). */
  pnIdentifier?: string;
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

function extractMlDsaSecretKeyB64(decrypted: {
  privateKey?: string;
  pqcSecrets?: { mlDsaSecretKey?: string };
}): string {
  const sk = decrypted.pqcSecrets?.mlDsaSecretKey || decrypted.privateKey;
  if (!sk) {
    throw new Error('This identity does not include ML-DSA signing keys required for OAuth unlock proof.');
  }
  return sk;
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

/** Returns stored token only when it was issued for this pN (prevents cross-pN 403s). */
export function getStoredTokenForPn(wantedPn: string): StoredToken | null {
  const token = getStoredToken();
  if (!token?.accessToken || !token.pnIdentifier) return null;
  const normalized = wantedPn.startsWith('pn-') ? wantedPn : `pn-${wantedPn}`;
  if (token.pnIdentifier !== normalized) return null;
  return token;
}

export function setStoredToken(token: StoredToken | null): void {
  if (token) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function clearStoredToken(): void {
  setStoredToken(null);
}

/**
 * Challenge → local unlock → ML-DSA proof → authorization code → access token.
 * Passcode and pn name are used only on-device to decrypt; they never hit the wire.
 */
export async function acquireApiTokenInline(
  input: InlineOAuthAcquireInput
): Promise<{ accessToken: string; pnIdentifier: string }> {
  const redirectUri = input.redirectUri || `${window.location.origin}/oauth-callback.html`;
  const scope = getScope(input.scope);
  const scopeStr = scope.join(' ');
  const state = randomHex(16);
  const nonce = randomHex(16);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const raw = await IdentityCrypto.decryptData(
    {
      encrypted: input.encryptedIdentity.encryptedData,
      iv: input.encryptedIdentity.iv,
      salt: input.encryptedIdentity.salt,
    },
    input.pnName,
    input.passcode
  );
  const decrypted = JSON.parse(raw) as {
    privateKey?: string;
    pqcSecrets?: { mlDsaSecretKey?: string };
  };
  const mlDsaSecretKeyB64 = extractMlDsaSecretKeyB64(decrypted);
  const pnIdentifier = deriveCanonicalPnIdentifier(input.publicKey);

  const challengeResponse = await fetch(`${API_ENDPOINT}/oauth/authorize/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PN_CLIENT_ID,
      redirect_uri: redirectUri,
    }),
  });
  if (!challengeResponse.ok) {
    const err = await challengeResponse.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description || 'OAuth unlock challenge failed'
    );
  }
  const challengeBody = (await challengeResponse.json()) as {
    challenge_id?: string;
    challenge?: string;
  };
  if (!challengeBody.challenge_id || !challengeBody.challenge) {
    throw new Error('OAuth unlock challenge response incomplete');
  }

  const signature = signOauthUnlockProof(
    {
      challenge: challengeBody.challenge,
      clientId: PN_CLIENT_ID,
      redirectUri,
      scope: scopeStr,
      state,
      nonce,
      publicKey: input.publicKey,
    },
    base64ToBytes(mlDsaSecretKeyB64)
  );

  const authResponse = await fetch(`${API_ENDPOINT}/oauth/authorize/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: PN_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: scopeStr,
      state,
      nonce,
      challenge_id: challengeBody.challenge_id,
      public_key: input.publicKey,
      signature,
    }),
  });

  if (!authResponse.ok) {
    const err = await authResponse.json().catch(() => ({}));
    throw new Error((err as { error_description?: string }).error_description || 'Inline OAuth authentication failed');
  }

  const authResult = (await authResponse.json()) as { code?: string };
  if (!authResult.code) {
    throw new Error('No authorization code received from OAuth authentication');
  }

  const accessToken = await exchangeCodeForToken(authResult.code, redirectUri);
  return { accessToken, pnIdentifier };
}

/** Public: derive the pN identifier used for OAuth (matches the token's embedded pN). */
export async function derivePnIdentifierForToken(
  _unusedPnName: string,
  _unusedLocalSecret: string,
  publicKey: string
): Promise<string> {
  return deriveCanonicalPnIdentifier(publicKey);
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  return retry(async () => {
    const res = await fetch(`${API_ENDPOINT}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: PN_CLIENT_ID,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message =
        res.status === 429
          ? 'API is busy — retrying sign-in…'
          : (err as { error_description?: string }).error_description || 'Token exchange failed';
      const error = new Error(message);
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
        (error as { retryAfter?: number }).retryAfter = Number.isFinite(retryAfterSec)
          ? retryAfterSec * 1000
          : 5000;
      }
      throw error;
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }, 5, 2000);
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
