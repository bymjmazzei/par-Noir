/**
 * OAuth helpers for Prism
 * Builds authorize URL for prism-app client (API consent)
 */

import { API_ENDPOINT } from '../config/api';

export const PRISM_CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'prism-app';

/** Config for UnlockButton / OAuth consent flow */
export function getPrismOAuthConfig() {
  return {
    clientId: PRISM_CLIENT_ID,
    apiEndpoint: API_ENDPOINT,
    redirectUri: `${window.location.origin}/oauth-callback.html`,
    scope: ['openid', 'profile'] as const,
  };
}

/** Store state/nonce for callback verification */
export function prismOnBeforeNavigate(state: string, nonce: string) {
  sessionStorage.setItem('pn_oauth_state', state);
  sessionStorage.setItem('pn_oauth_nonce', nonce);
  sessionStorage.setItem('pn_oauth_return_path', '/');
}

function generateState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns OAuth authorize URL for Prism (API consent).
 * Used when direct navigation is needed (e.g. ApplyModal).
 */
export function getPrismOAuthUrl(): string {
  const config = getPrismOAuthConfig();
  const state = generateState();
  const nonce = generateNonce();
  prismOnBeforeNavigate(state, nonce);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope.join(' '),
    state,
    nonce,
  });

  return `${config.apiEndpoint.replace(/\/$/, '')}/oauth/authorize/consent?${params.toString()}`;
}
