/**
 * Opt-in OAuth diagnostics for production (console is stripped in Vite production builds).
 *
 * Enable: open the app with ?pn_debug_oauth=1 (persists in localStorage until ?pn_debug_oauth=0).
 * Read:    DevTools Console → window.__PN_OAUTH_DEBUG__
 *
 * Never logs secrets (codes, tokens, redirect URIs, user identifiers).
 */

export const PN_DEBUG_OAUTH_STORAGE_KEY = 'pn_debug_oauth';

export function initPnOAuthDebugFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const v = new URLSearchParams(window.location.search).get(PN_DEBUG_OAUTH_STORAGE_KEY);
    if (v === '1') {
      localStorage.setItem(PN_DEBUG_OAUTH_STORAGE_KEY, '1');
    } else if (v === '0') {
      localStorage.removeItem(PN_DEBUG_OAUTH_STORAGE_KEY);
      const w = window as Window & { __PN_OAUTH_DEBUG__?: unknown[] };
      delete w.__PN_OAUTH_DEBUG__;
    }
  } catch {
    /* ignore */
  }
}

export function isPnOAuthDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(PN_DEBUG_OAUTH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export type PnOAuthDebugEntry = {
  t: number;
  phase: string;
} & Record<string, unknown>;

export function pushPnOAuthDebug(phase: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PN_DEBUG_OAUTH_STORAGE_KEY) !== '1') return;
    const entry: PnOAuthDebugEntry = { t: Date.now(), phase, ...(data || {}) };
    const w = window as Window & { __PN_OAUTH_DEBUG__?: PnOAuthDebugEntry[] };
    if (!w.__PN_OAUTH_DEBUG__) w.__PN_OAUTH_DEBUG__ = [];
    w.__PN_OAUTH_DEBUG__.push(entry);
    if (w.__PN_OAUTH_DEBUG__.length > 120) w.__PN_OAUTH_DEBUG__.shift();
  } catch {
    /* ignore */
  }
}
