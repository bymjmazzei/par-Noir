/** Authorization codes already exchanged — never reuse (survives oauth_resume reload). */
const CONSUMED_STORAGE_KEY = 'pn_oauth_consumed_codes_v1';
const consumed = new Set<string>();

function loadPersistedConsumed(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(CONSUMED_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const code of parsed) {
      if (typeof code === 'string' && code) consumed.add(code);
    }
  } catch {
    /* ignore */
  }
}

function persistConsumed(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CONSUMED_STORAGE_KEY, JSON.stringify([...consumed]));
  } catch {
    /* ignore */
  }
}

loadPersistedConsumed();

export function isOauthCodeConsumed(code: string): boolean {
  return consumed.has(code);
}

export function markOauthCodeConsumed(code: string): void {
  if (!code) return;
  consumed.add(code);
  persistConsumed();
}

/** Test-only. */
export function resetOauthConsumedCodesForTests(): void {
  consumed.clear();
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(CONSUMED_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
