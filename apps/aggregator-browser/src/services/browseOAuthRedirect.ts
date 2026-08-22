/**
 * Single redirect_uri for browse OAuth token exchange (must match authorize request).
 */

export function browseOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return '/oauth-callback.html';
  return `${window.location.origin}/oauth-callback.html`.replace(/\/$/, '');
}
