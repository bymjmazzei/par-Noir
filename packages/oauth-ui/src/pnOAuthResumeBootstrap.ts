import { pushPnOAuthDebug } from './pnOAuthDebug';

/**
 * Snapshot oauth_resume query string in sessionStorage before React runs.
 * Survives Strict Mode remount and races where the URL is read after replaceState.
 */
export const PN_OAUTH_RESUME_SEARCH_KEY = 'pn_oauth_resume_search_v1';

export function snapshotOAuthResumeSearchFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('oauth_resume') === '1') {
      sessionStorage.setItem(PN_OAUTH_RESUME_SEARCH_KEY, window.location.search);
      pushPnOAuthDebug('bootstrap_snapshot_resume', {
        searchLen: window.location.search.length,
        hasCodeParam: sp.has('code'),
        hasErrorParam: sp.has('error'),
      });
    }
  } catch {
    /* ignore */
  }
}
