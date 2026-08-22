/** Tracks browse OAuth handoff completion for this tab (cleared on lock). */

export const PN_OAUTH_HANDOFF_COMPLETE_KEY = 'pn_oauth_handoff_complete_v1';

export function markOAuthHandoffComplete(): void {
  try {
    sessionStorage.setItem(PN_OAUTH_HANDOFF_COMPLETE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isOAuthHandoffComplete(): boolean {
  try {
    return sessionStorage.getItem(PN_OAUTH_HANDOFF_COMPLETE_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearOAuthHandoffComplete(): void {
  try {
    sessionStorage.removeItem(PN_OAUTH_HANDOFF_COMPLETE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStaleOAuthCallbackStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('pn_oauth_callback_') || k === 'pn_oauth_callback_latest')) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
    localStorage.removeItem('pn_oauth_storage_pending');
    localStorage.removeItem('pn_oauth_storage_latest_key');
  } catch {
    /* ignore */
  }
}

/** Test-only. */
export function resetOAuthHandoffStateForTests(): void {
  clearOAuthHandoffComplete();
  clearStaleOAuthCallbackStorage();
}
