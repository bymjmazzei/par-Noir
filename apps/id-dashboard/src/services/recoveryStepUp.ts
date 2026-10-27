/**
 * Recovery tab step-up: the shared par Noir sign-in popup (Unlock app first, web form fallback).
 * Key 1 and Key 2 stay in Unlock; the dashboard only receives an auth code for this pN.
 */
import { buildOAuthConsentUrl, fetchPortalUserInfo, startPnOAuthPopup } from '@par-noir/oauth-ui';
import { API_ENDPOINT } from '../config/api';
import { exchangeCodeForToken, PN_CLIENT_ID } from './parNoirOAuthInline';

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

function friendlyPopupError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'POPUP_BLOCKED') return new Error('Popup blocked. Allow popups for this site and try again.');
  if (msg === 'POPUP_CLOSED') return new Error('Unlock was cancelled.');
  if (msg === 'POPUP_TIMEOUT') return new Error('Unlock timed out. Try again.');
  if (msg === 'OAUTH_STATE_MISMATCH' || msg === 'OAUTH_STATE_MISSING') {
    return new Error('Unlock could not be verified. Try again.');
  }
  return err instanceof Error ? err : new Error(msg);
}

/** Re-authenticate the active pN. Resolves with a fresh API access token for it. */
export async function reauthenticateForRecovery(expectedPublicKey: string): Promise<string> {
  const state = randomHex(16);
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const url = buildOAuthConsentUrl({
    clientId: PN_CLIENT_ID,
    apiEndpoint: API_ENDPOINT,
    redirectUri,
    scope: ['openid', 'profile'],
    state,
    nonce: randomHex(16),
    forPopup: true,
  });

  let code: string | undefined;
  try {
    const result = await startPnOAuthPopup({
      url,
      expectedState: state,
      timeoutMs: 300_000,
      completeViaParentNavigation: false,
    });
    if (result.error) {
      throw new Error(result.error === 'access_denied' ? 'Unlock was declined.' : result.error);
    }
    code = result.code;
  } catch (err) {
    throw friendlyPopupError(err);
  }
  if (!code) throw new Error('Unlock did not complete.');

  const accessToken = await exchangeCodeForToken(code, redirectUri);
  const info = await fetchPortalUserInfo({ apiEndpoint: API_ENDPOINT, accessToken });
  const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
  const expectedPn = normalizePn(deriveCanonicalPnIdentifier(expectedPublicKey));
  const unlockedPn = typeof info.pn_identifier === 'string' ? normalizePn(info.pn_identifier) : '';
  if (!unlockedPn || unlockedPn !== expectedPn) {
    throw new Error('Unlocked identity does not match the active dashboard session.');
  }
  return accessToken;
}
