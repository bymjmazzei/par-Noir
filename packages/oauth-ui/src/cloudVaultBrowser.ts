/**
 * Browser entry for the OAuth unlock page's cloud vault helper.
 *
 * Bundled to static/oauth-cloud-vault.js by `npm run build:vault-script`. It is
 * generated, never hand-edited: the previous hand-written ES5 copy drifted from
 * the shared resolver and shipped a token Google had already expired, so every
 * unlock re-prompted for consent.
 *
 * Unseal and freshness both come from @par-noir/device-cloud-credentials, so
 * the page cannot disagree with the rest of the system about either.
 *
 * The unsealed token is returned to the caller and never stored. Do not persist
 * it to localStorage or sessionStorage: cloud tokens must not survive lock.
 */

import {
  accountRefreshToken,
  freshAccessTokenFromEnvelope,
  isAccessTokenFresh,
  isSealedEnvelopeShape,
  pickGoogleAccount,
  unsealCloudVaultWithAnyFactor
} from '@par-noir/device-cloud-credentials';
import type { SealedEnvelope } from '@par-noir/device-cloud-credentials';

interface UnsealFactors {
  mlKemSecretKey?: string | null;
  pnName?: string | null;
  passcode?: string | null;
}

interface DriveTokenOptions extends UnsealFactors {
  /** Needed to mint a replacement when the sealed token has expired. */
  apiEndpoint?: string | null;
  /** Authorization code from /oauth/authorize/authenticate, proving unlock. */
  code?: string | null;
  clientId?: string | null;
}

/**
 * Ask the API to exchange the vault's refresh token for a live access token.
 * The unlock page has no pN access token yet, so the authorization code is the
 * proof of unlock.
 */
async function mintAccessToken(
  refreshToken: string,
  opts: DriveTokenOptions
): Promise<string | null> {
  if (!opts.apiEndpoint || !opts.code || !opts.clientId) {
    console.warn('[OAuth] Cannot mint Drive token: missing api endpoint or authorization code');
    return null;
  }
  const base = String(opts.apiEndpoint).replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/oauth/authorize/drive-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: opts.code,
        client_id: opts.clientId,
        refresh_token: refreshToken
      })
    });
    if (!res.ok) {
      // Reason only. Never log the envelope, the factors, or either token.
      let reason = String(res.status);
      try {
        const body = (await res.json()) as { reason?: string };
        if (body?.reason) reason = body.reason;
      } catch {
        /* keep the status */
      }
      console.warn('[OAuth] Drive token refresh rejected', { reason });
      return null;
    }
    const body = (await res.json()) as { access_token?: string };
    return typeof body.access_token === 'string' && body.access_token.trim()
      ? body.access_token.trim()
      : null;
  } catch {
    console.warn('[OAuth] Drive token refresh request failed');
    return null;
  }
}

/**
 * Resolve a usable Drive access token from a sealed vault.
 *
 * Resolves to null rather than throwing, and rather than returning a token it
 * cannot vouch for: a missing token means consent is shown, which is degraded
 * but correct. Returning a dead one means the API cannot read the stored grant
 * and the user is asked again anyway, with a 500 behind it.
 */
async function accessTokenFromSealedVault(
  envelope: SealedEnvelope | null,
  options: DriveTokenOptions
): Promise<string | null> {
  if (!envelope || !isSealedEnvelopeShape(envelope)) return null;

  let credentials: unknown;
  try {
    credentials = await unsealCloudVaultWithAnyFactor(envelope, {
      mlKemSecretKey: options.mlKemSecretKey,
      pnName: options.pnName,
      passcode: options.passcode
    });
  } catch {
    // Never log the reason with identity material attached.
    console.warn('[OAuth] Cloud vault unseal unavailable');
    return null;
  }

  const fresh = freshAccessTokenFromEnvelope(credentials);
  if (fresh) return fresh;

  const account = pickGoogleAccount(credentials);
  const refreshToken = account ? accountRefreshToken(account) : null;
  if (!refreshToken) {
    console.warn('[OAuth] Sealed vault has no refresh token; Drive token unavailable');
    return null;
  }

  return mintAccessToken(refreshToken, options);
}

const api = {
  accessTokenFromSealedVault,
  unsealWithAnyFactor: unsealCloudVaultWithAnyFactor,
  freshTokenFromEnvelope: freshAccessTokenFromEnvelope,
  isAccessTokenFresh,
  isSealedEnvelopeShape
};

declare global {
  interface Window {
    ParNoirCloudVault: typeof api;
  }
}

(globalThis as unknown as { ParNoirCloudVault: typeof api }).ParNoirCloudVault = api;

export type ParNoirCloudVaultApi = typeof api;
