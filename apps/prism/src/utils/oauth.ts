/**
 * OAuth helpers for Prism
 * Builds authorize URL for prism-app client (API consent)
 */

import { API_ENDPOINT } from '../config/api';
import { Capacitor } from '@capacitor/core';

const raw = import.meta.env.VITE_PN_CLIENT_ID && String(import.meta.env.VITE_PN_CLIENT_ID).trim();
/** Do not use browser-app: deploy/env can leak that id into this build and break redirect validation. */
export const PRISM_CLIENT_ID = raw && raw !== 'browser-app' ? raw : 'prism-app';

/** Config for UnlockButton / OAuth consent flow */
export function getPrismOAuthConfig() {
  return {
    clientId: PRISM_CLIENT_ID,
    apiEndpoint: API_ENDPOINT,
    redirectUri: getPrismRedirectUri(),
    scope: ['openid', 'profile'] as const,
  };
}

export function getPrismRedirectUri(): string {
  if (Capacitor.isNativePlatform()) {
    return 'com.parnoir.prism://oauth-callback';
  }
  return `${window.location.origin}/oauth-callback.html`;
}

/** Store state/nonce for callback verification */
export function prismOnBeforeNavigate(state: string, nonce: string) {
  sessionStorage.setItem('pn_oauth_state', state);
  sessionStorage.setItem('pn_oauth_nonce', nonce);
  sessionStorage.setItem('pn_oauth_return_path', '/');
}

