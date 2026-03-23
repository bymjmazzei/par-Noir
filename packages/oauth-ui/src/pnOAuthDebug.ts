/**
 * Opt-in OAuth diagnostics for production (console is stripped in Vite production builds).
 *
 * Enable: open the app with ?pn_debug_oauth=1 (persists in localStorage until ?pn_debug_oauth=0).
 * Read:    DevTools Console:
 *   - window.__PN_OAUTH_DEBUG__   (array; always defined after debug boot)
 *   - pnOAuthDebugCopy()          (returns JSON string; copies to clipboard when possible)
 *   - pnOAuthDebugStatus()        ('on' | 'off')
 *
 * Never logs secrets (codes, tokens, redirect URIs, user identifiers).
 */

export const PN_DEBUG_OAUTH_STORAGE_KEY = 'pn_debug_oauth';

export type PnOAuthDebugEntry = {
  t: number;
  phase: string;
} & Record<string, unknown>;

function ensureDebugGlobals(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    __PN_OAUTH_DEBUG__?: PnOAuthDebugEntry[];
    pnOAuthDebugCopy?: () => string;
    pnOAuthDebugStatus?: () => string;
  };
  if (!w.__PN_OAUTH_DEBUG__) w.__PN_OAUTH_DEBUG__ = [];

  if (typeof w.pnOAuthDebugCopy !== 'function') {
    w.pnOAuthDebugCopy = (): string => {
      const log = w.__PN_OAUTH_DEBUG__ ?? [];
      const s = JSON.stringify(log, null, 2);
      try {
        void navigator.clipboard?.writeText(s);
      } catch {
        /* ignore */
      }
      return s;
    };
  }
  if (typeof w.pnOAuthDebugStatus !== 'function') {
    w.pnOAuthDebugStatus = (): string =>
      localStorage.getItem(PN_DEBUG_OAUTH_STORAGE_KEY) === '1' ? 'on' : 'off';
  }
}

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
      const ww = window as Window & { pnOAuthDebugCopy?: unknown; pnOAuthDebugStatus?: unknown };
      delete ww.pnOAuthDebugCopy;
      delete ww.pnOAuthDebugStatus;
    }
  } catch {
    /* ignore */
  }

  try {
    if (localStorage.getItem(PN_DEBUG_OAUTH_STORAGE_KEY) === '1') {
      ensureDebugGlobals();
      const w = window as Window & { __PN_OAUTH_DEBUG__?: PnOAuthDebugEntry[] };
      w.__PN_OAUTH_DEBUG__!.push({
        t: Date.now(),
        phase: 'debug_session_ready',
        hint: 'OAuth debug on — try lock flow; then pnOAuthDebugCopy() or window.__PN_OAUTH_DEBUG__',
      });
      if (w.__PN_OAUTH_DEBUG__!.length > 120) w.__PN_OAUTH_DEBUG__!.shift();
    }
  } catch {
    /* private mode / blocked storage */
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

export function pushPnOAuthDebug(phase: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(PN_DEBUG_OAUTH_STORAGE_KEY) !== '1') return;
    ensureDebugGlobals();
    const entry: PnOAuthDebugEntry = { t: Date.now(), phase, ...(data || {}) };
    const w = window as Window & { __PN_OAUTH_DEBUG__?: PnOAuthDebugEntry[] };
    w.__PN_OAUTH_DEBUG__!.push(entry);
    if (w.__PN_OAUTH_DEBUG__!.length > 120) w.__PN_OAUTH_DEBUG__!.shift();
  } catch {
    /* ignore */
  }
}
