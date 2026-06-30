import { pushPnOAuthDebug } from './pnOAuthDebug';

/**
 * Snapshot oauth_resume query string in sessionStorage before React runs.
 * Survives Strict Mode remount and races where the URL is read after replaceState.
 */
export const PN_OAUTH_RESUME_SEARCH_KEY = 'pn_oauth_resume_search_v1';
/** Encrypted identity hash from consent redirect (paired with oauth_resume search). */
export const PN_OAUTH_RESUME_HASH_KEY = 'pn_oauth_resume_hash_v1';

export function isOAuthResumeUrl(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const sp = new URLSearchParams(search ?? window.location.search);
    return sp.get('oauth_resume') === '1';
  } catch {
    return false;
  }
}

/** Drop stale resume snapshots on normal visits (avoids re-running token exchange on `/`). */
export function clearOAuthResumeSnapshotUnlessOnResumeUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!isOAuthResumeUrl()) {
      sessionStorage.removeItem(PN_OAUTH_RESUME_SEARCH_KEY);
      sessionStorage.removeItem(PN_OAUTH_RESUME_HASH_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Params for oauth_resume handling: only when the current URL is a resume URL.
 * Uses the pre-React snapshot when the URL still has oauth_resume (Strict Mode / replaceState races).
 */
export function getOAuthResumeSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  if (!isOAuthResumeUrl()) {
    clearOAuthResumeSnapshotUnlessOnResumeUrl();
    return null;
  }
  try {
    const stored = sessionStorage.getItem(PN_OAUTH_RESUME_SEARCH_KEY);
    return new URLSearchParams(stored ?? window.location.search);
  } catch {
    return new URLSearchParams(window.location.search);
  }
}

export function snapshotOAuthResumeSearchFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    if (isOAuthResumeUrl()) {
      sessionStorage.setItem(PN_OAUTH_RESUME_SEARCH_KEY, window.location.search);
      if (window.location.hash) {
        sessionStorage.setItem(PN_OAUTH_RESUME_HASH_KEY, window.location.hash);
      }
      pushPnOAuthDebug('bootstrap_snapshot_resume', {
        searchLen: window.location.search.length,
        hashLen: window.location.hash.length,
        hasCodeParam: new URLSearchParams(window.location.search).has('code'),
        hasErrorParam: new URLSearchParams(window.location.search).has('error'),
      });
    } else {
      clearOAuthResumeSnapshotUnlessOnResumeUrl();
    }
  } catch {
    /* ignore */
  }
}
