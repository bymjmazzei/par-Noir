/**
 * Cookies shared by every first-party app in one browser. All apps live under
 * *.parnoir.com, so a parent-domain cookie is first-party everywhere (and plain
 * host cookies on localhost are shared across dev ports).
 */

export const PN_BROWSER_ID_COOKIE = 'pn_bid';
export const PN_LAST_ACTIVE_COOKIE = 'pn_last_active';
export const PN_LOCKED_AT_COOKIE = 'pn_locked_at';

const MAX_AGE_S = 400 * 24 * 60 * 60;
const BROWSER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

function hasDocument(): boolean {
  return typeof document !== 'undefined' && typeof document.cookie === 'string';
}

export function sharedCookieDomain(hostname: string): string | undefined {
  const host = hostname.toLowerCase();
  if (host === 'parnoir.com' || host.endsWith('.parnoir.com')) return '.parnoir.com';
  return undefined;
}

function readCookie(name: string): string | null {
  if (!hasDocument()) return null;
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (!hasDocument()) return;
  const loc = typeof window !== 'undefined' ? window.location : undefined;
  const domain = loc ? sharedCookieDomain(loc.hostname) : undefined;
  const secure = loc?.protocol === 'https:';
  document.cookie = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_S}`,
    'SameSite=Lax',
    domain ? `Domain=${domain}` : '',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function randomId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Stable per-browser id (not secret): groups every app's session for lock-all. */
export function getOrCreateBrowserId(): string | undefined {
  if (!hasDocument()) return undefined;
  const existing = readCookie(PN_BROWSER_ID_COOKIE);
  if (existing && BROWSER_ID_RE.test(existing)) return existing;
  const next = randomId();
  writeCookie(PN_BROWSER_ID_COOKIE, next);
  return readCookie(PN_BROWSER_ID_COOKIE) === next ? next : undefined;
}

function readEpochCookie(name: string): number {
  const raw = readCookie(name);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** Last user activity across every app in this browser (ms epoch). */
export function readSharedLastActive(): number {
  return readEpochCookie(PN_LAST_ACTIVE_COOKIE);
}

export function writeSharedLastActive(at: number): void {
  writeCookie(PN_LAST_ACTIVE_COOKIE, String(Math.floor(at)));
}

/** When any app in this browser last locked (ms epoch). Sessions unlocked before it are dead. */
export function readSharedLockedAt(): number {
  return readEpochCookie(PN_LOCKED_AT_COOKIE);
}

export function writeSharedLockedAt(at: number): void {
  writeCookie(PN_LOCKED_AT_COOKIE, String(Math.floor(at)));
}
