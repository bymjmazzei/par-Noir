/**
 * OAuth helpers for Prism
 * Builds authorize URL for prism-app client
 */

import { API_ENDPOINT } from '../config/api';

const CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'prism-app';

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
 * Returns OAuth authorize URL for Prism
 * Opens oauth-authorize.html which handles unlock + consent
 */
export function getPrismOAuthUrl(): string {
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const state = generateState();
  const nonce = generateNonce();
  const scope = ['openid', 'profile'];

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('pn_oauth_state', state);
    sessionStorage.setItem('pn_oauth_nonce', nonce);
    sessionStorage.setItem('pn_oauth_return_path', '/');
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope.join(' '),
    state,
    nonce,
  });

  return `${window.location.origin}/oauth-authorize.html?${params.toString()}`;
}
