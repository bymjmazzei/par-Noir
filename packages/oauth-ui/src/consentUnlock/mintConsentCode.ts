/**
 * Challenge → ML-DSA unlock proof → authenticate. Never sends passcode / pn name.
 */

import type { AuthenticateWithUnlockProofParams } from '../oauthUnlockProofMint';
import { extractMlDsaSecretKeyB64, type DecryptedIdentityRecord } from './extractMlDsa';
import { isMessagingHandoffClient } from './constants';
import { extractMessagingSessionFromDecrypted } from '../messagingOAuthHandoff';

export type ConsentAuthenticateResult = {
  code: string;
  pnIdentifier: string;
  existingGrant?: { dataPoints?: string[] } | null;
  dataPointLevels?: Record<string, string>;
  availableDataPoints?: Record<string, { available: boolean; reason?: string }> | null;
  sealedCloudVault?: unknown;
};

export type CompleteConsentUnlockInput = {
  apiEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  nonce: string;
  publicKey: string;
  decryptedIdentity: DecryptedIdentityRecord;
};

/**
 * Mint authorization code after local decrypt. Factors stay off the wire.
 */
export async function mintConsentAuthorizationCode(
  input: CompleteConsentUnlockInput
): Promise<ConsentAuthenticateResult> {
  if (isMessagingHandoffClient(input.clientId)) {
    const session = extractMessagingSessionFromDecrypted(input.decryptedIdentity);
    if (!session) {
      throw new Error(
        'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
      );
    }
  }

  const mlDsaSecretKeyB64 = extractMlDsaSecretKeyB64(input.decryptedIdentity);
  if (!mlDsaSecretKeyB64) {
    throw new Error(
      'This pN identity does not include ML-DSA signing keys. Create or update your identity at pn.parnoir.com, then try again.'
    );
  }

  const scopeParts = input.scope.split(/\s+/).filter(Boolean);
  const detailed = await authenticateWithUnlockProofDetailed({
    apiEndpoint: input.apiEndpoint,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    publicKey: input.publicKey,
    mlDsaSecretKeyB64,
    scope: scopeParts,
    state: input.state || undefined,
    nonce: input.nonce || undefined,
  });

  return detailed;
}

/** Like authenticateWithUnlockProof but keeps grant metadata from the API body. */
export async function authenticateWithUnlockProofDetailed(
  params: AuthenticateWithUnlockProofParams
): Promise<ConsentAuthenticateResult> {
  // Re-implement post so we can read extra fields — still no passcode on body.
  const { requestOauthUnlockChallenge } = await import('../oauthUnlockProofMint');
  const { base64ToBytes } = await import('@par-noir/pqc-crypto/encoding');
  const {
    deriveCanonicalPnIdentifier,
    signOauthUnlockProof,
  } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');

  const apiEndpoint = params.apiEndpoint.replace(/\/$/, '');
  const scopeStr =
    params.scope && params.scope.length > 0 ? params.scope.join(' ') : 'openid profile';
  const state =
    params.state ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const nonce =
    params.nonce ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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

  const body: Record<string, string> = {
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: scopeStr,
    state,
    nonce,
    challenge_id: challengeId,
    public_key: params.publicKey,
    signature,
  };

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

  const result = (await res.json()) as {
    code?: string;
    existingGrant?: { dataPoints?: string[] } | null;
    dataPointLevels?: Record<string, string>;
    availableDataPoints?: Record<string, { available: boolean; reason?: string }> | null;
    sealedCloudVault?: unknown;
  };
  if (!result.code) {
    throw new Error('No authorization code received from OAuth authentication');
  }

  return {
    code: result.code,
    pnIdentifier,
    existingGrant: result.existingGrant,
    dataPointLevels: result.dataPointLevels,
    availableDataPoints: result.availableDataPoints,
    sealedCloudVault: result.sealedCloudVault,
  };
}

export function scopeNeedsConsentScreen(scope: string): boolean {
  const parts = scope.split(/\s+/).filter(Boolean);
  const requestedDataPoints = parts.filter(
    (s) => s.startsWith('zkp:') || s.startsWith('data_point:')
  );
  const needsIntegratorConsent = parts.includes('cloud:app');
  return requestedDataPoints.length > 0 || needsIntegratorConsent;
}

export function requestedDataPointIds(scope: string): string[] {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .filter((s) => s.startsWith('zkp:') || s.startsWith('data_point:'))
    .map((s) => s.replace(/^(zkp:|data_point:)/, ''));
}

export function requestsCloudAccess(scope: string): boolean {
  return scope.split(/\s+/).some((s) => s.startsWith('cloud:'));
}
