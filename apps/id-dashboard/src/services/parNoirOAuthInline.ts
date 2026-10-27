/**
 * Dashboard API token session + thin decrypt→mint wrapper.
 * Unlock-proof mint lives in `@par-noir/oauth-ui` (never send passcode on the wire).
 */

import { API_ENDPOINT } from '../config/api';
import { retry } from '../utils/helpers';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import {
  exchangePortalAuthorizationCode,
  mintAccessTokenWithUnlockProof,
  oauthStatesMatch,
} from '@par-noir/oauth-ui';

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
 * Decrypt on-device, then mint via shared oauth-ui unlock-proof helpers.
 * Passcode / pn name never leave this function onto the wire.
 */
export async function acquireApiTokenInline(
  input: InlineOAuthAcquireInput
): Promise<{ accessToken: string; pnIdentifier: string }> {
  const redirectUri = input.redirectUri || `${window.location.origin}/oauth-callback.html`;
  const state = crypto.getRandomValues(new Uint8Array(16));
  const stateHex = Array.from(state, (b) => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(OAUTH_STATE_KEY, stateHex);

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

  return mintAccessTokenWithUnlockProof({
    apiEndpoint: API_ENDPOINT,
    clientId: PN_CLIENT_ID,
    redirectUri,
    publicKey: input.publicKey,
    mlDsaSecretKeyB64,
    scope: input.scope,
    state: stateHex,
  });
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  return retry(async () => {
    try {
      const data = await exchangePortalAuthorizationCode({
        apiEndpoint: API_ENDPOINT,
        clientId: PN_CLIENT_ID,
        code,
        redirectUri,
      });
      return data.access_token;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Token exchange failed';
      const error = new Error(
        message.includes('429') || /busy|rate/i.test(message)
          ? 'API is busy — retrying sign-in…'
          : message
      );
      throw error;
    }
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
      errorDescription: errorDescription ? decodeURIComponent(errorDescription.replace(/\+/g, ' ')) : null,
    };
  } finally {
    const url = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState({}, '', url);
    if (redirectUri) {
      void redirectUri;
    }
  }
}
