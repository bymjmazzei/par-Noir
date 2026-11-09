/**
 * Dashboard API token session + thin decrypt→mint wrapper.
 * Unlock-proof mint lives in `@par-noir/oauth-ui` (never send Key 2 on the wire).
 */

import { API_ENDPOINT, PN_CLIENT_ID } from '../config/api';
import { retry } from '../utils/helpers';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import {
  createPnSession,
  exchangePortalAuthorizationCode,
  mintAccessTokenWithUnlockProof,
  oauthStatesMatch,
  type PortalTokenResponse,
} from '@par-noir/oauth-ui';

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
  key1: string;
  key2: string;
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

/**
 * Dashboard instance of the shared pN session: the owner API JWT refreshes ahead of
 * expiry, idle / lock-all / expiry run the logout teardown and reload home.
 */
export const dashboardSession = createPnSession({
  clientId: PN_CLIENT_ID,
  apiEndpoint: API_ENDPOINT,
  storageKey: STORAGE_KEY,
});

/** Start the API session for the unlocked pN (unlock-proof mint or shell exchange). */
export async function beginDashboardSession(tokens: PortalTokenResponse, publicKey?: string): Promise<string> {
  const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
  const pnIdentifier = publicKey ? deriveCanonicalPnIdentifier(publicKey) : '';
  return dashboardSession.begin(tokens, { pnIdentifier: pnIdentifier || 'unknown' }).accessToken;
}

/** Sync read for owner routes; the idle watch keeps the stored token refreshed. */
export function getStoredToken(): StoredToken | null {
  const record = dashboardSession.load();
  if (!record || record.expiresAt < Date.now() + 60_000) return null;
  return {
    accessToken: record.accessToken,
    expiresAt: record.expiresAt,
    pnIdentifier: record.pnIdentifier === 'unknown' ? undefined : record.pnIdentifier,
  };
}

/** Returns stored token only when it was issued for this pN (prevents cross-pN 403s). */
export function getStoredTokenForPn(wantedPn: string): StoredToken | null {
  const token = getStoredToken();
  if (!token?.accessToken || !token.pnIdentifier) return null;
  const normalized = wantedPn.startsWith('pn-') ? wantedPn : `pn-${wantedPn}`;
  if (token.pnIdentifier !== normalized) return null;
  return token;
}

/**
 * Decrypt on-device, then mint via shared oauth-ui unlock-proof helpers.
 * Key 2 / Key 1 never leave this function onto the wire.
 */
export async function acquireApiTokenInline(
  input: InlineOAuthAcquireInput
): Promise<{ accessToken: string; pnIdentifier: string; tokens: PortalTokenResponse }> {
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
    input.key1,
    input.key2
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

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<PortalTokenResponse> {
  return retry(async () => {
    try {
      return await exchangePortalAuthorizationCode({
        apiEndpoint: API_ENDPOINT,
        clientId: PN_CLIENT_ID,
        code,
        redirectUri,
      });
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
