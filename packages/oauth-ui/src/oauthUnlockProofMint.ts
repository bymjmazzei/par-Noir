/**
 * Shared OAuth unlock-proof mint: challenge → ML-DSA sign → authenticate → code → token.
 * Never accepts passcode / pn name — callers decrypt locally and pass mlDsaSecretKeyB64 only.
 */

import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import {
  deriveCanonicalPnIdentifier,
  signOauthUnlockProof,
} from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { exchangePortalAuthorizationCode } from './portalOAuthSession';

export interface OauthUnlockChallenge {
  challengeId: string;
  challenge: string;
}

export interface AuthenticateWithUnlockProofParams {
  apiEndpoint: string;
  clientId: string;
  redirectUri: string;
  publicKey: string;
  mlDsaSecretKeyB64: string;
  scope?: string[];
  state?: string;
  nonce?: string;
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizeScope(scope?: string[]): string {
  const parts = scope && scope.length > 0 ? scope : ['openid', 'profile'];
  return parts.join(' ');
}

export async function requestOauthUnlockChallenge(opts: {
  apiEndpoint: string;
  clientId: string;
  redirectUri: string;
}): Promise<OauthUnlockChallenge> {
  const res = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/oauth/authorize/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description ||
        (err as { error?: string }).error ||
        'OAuth unlock challenge failed'
    );
  }
  const body = (await res.json()) as { challenge_id?: string; challenge?: string };
  if (!body.challenge_id || !body.challenge) {
    throw new Error('OAuth unlock challenge response incomplete');
  }
  return { challengeId: body.challenge_id, challenge: body.challenge };
}

/**
 * Sign unlock proof and POST /oauth/authorize/authenticate.
 * Body contains public_key + signature only — never passcode or pn name.
 */
export async function authenticateWithUnlockProof(
  params: AuthenticateWithUnlockProofParams
): Promise<{ code: string; state?: string; pnIdentifier: string }> {
  const apiEndpoint = params.apiEndpoint.replace(/\/$/, '');
  const scopeStr = normalizeScope(params.scope);
  const state = params.state || randomHex(16);
  const nonce = params.nonce || randomHex(16);
  const pnIdentifier = deriveCanonicalPnIdentifier(params.publicKey);

  const { challengeId, challenge } = await requestOauthUnlockChallenge({
    apiEndpoint,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
  });

  const signature = signOauthUnlockProof(
    {
      challenge,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: scopeStr,
      state,
      nonce,
      publicKey: params.publicKey,
    },
    base64ToBytes(params.mlDsaSecretKeyB64)
  );

  const body = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: scopeStr,
    state,
    nonce,
    challenge_id: challengeId,
    public_key: params.publicKey,
    signature,
  };

  // Guard: never ship secrets on this wire
  const forbidden = ['passcode', 'pn_name', 'pnName', 'password'] as const;
  for (const key of forbidden) {
    if (key in body) {
      throw new Error(`Refusing authenticate body field: ${key}`);
    }
  }

  const res = await fetch(`${apiEndpoint}/oauth/authorize/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error_description?: string }).error_description ||
        (err as { error?: string }).error ||
        'OAuth authenticate failed'
    );
  }
  const result = (await res.json()) as { code?: string; state?: string };
  if (!result.code) {
    throw new Error('No authorization code received from OAuth authentication');
  }
  return { code: result.code, state: result.state, pnIdentifier };
}

export async function mintAccessTokenWithUnlockProof(
  params: AuthenticateWithUnlockProofParams
): Promise<{ accessToken: string; pnIdentifier: string; code: string }> {
  const { code, pnIdentifier } = await authenticateWithUnlockProof(params);
  const token = await exchangePortalAuthorizationCode({
    apiEndpoint: params.apiEndpoint,
    clientId: params.clientId,
    code,
    redirectUri: params.redirectUri,
  });
  if (!token.access_token) {
    throw new Error('Token exchange returned no access_token');
  }
  return { accessToken: token.access_token, pnIdentifier, code };
}
