/**
 * One check for every outbound Pen link: editor, press engine, and the API publish guard.
 * Blocked links never open. Allowed links carry warnings for the leaving screen.
 */

import { hostMatches, LINK_BLOCKLIST, LINK_SHORTENERS } from './linkBlocklist.js';

export type LinkWarning = 'lookalike_host' | 'download' | 'label_mismatch' | 'shortener';
export type LinkBlock = 'invalid' | 'not_https' | 'credentials' | 'ip_or_local' | 'blocklisted';
export type LinkVerdict =
  | { ok: true; url: string; host: string; warnings: LinkWarning[] }
  | { ok: false; reason: LinkBlock };

const RISKY_DOWNLOAD = [
  '.exe', '.msi', '.dmg', '.pkg', '.apk', '.scr', '.bat', '.cmd', '.js', '.vbs',
  '.jar', '.zip', '.rar', '.7z', '.iso'
];

const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'lan', 'home.arpa', 'corp', 'intranet'];

const PAR_NOIR_HOSTS = ['parnoir.com'];

export const LINK_BLOCK_MESSAGES: Record<LinkBlock, string> = {
  invalid: 'That is not a valid web address.',
  not_https: 'Only secure https:// links can open.',
  credentials: 'Links with a username or password before the site are not allowed.',
  ip_or_local: 'Links to IP addresses or local network hosts are not allowed.',
  blocklisted: 'This site is blocked on par Noir.'
};

export const LINK_WARNING_MESSAGES: Record<LinkWarning, string> = {
  lookalike_host: 'This address uses characters that can imitate another site.',
  download: 'This link downloads a file.',
  label_mismatch: 'The button text names a different site than where it goes.',
  shortener: 'This is a short link. The real destination is hidden.'
};

function isIpHost(host: string): boolean {
  if (host.startsWith('[')) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isLocalHost(host: string): boolean {
  if (!host.includes('.')) return true;
  return hostMatches(host, LOCAL_SUFFIXES);
}

function sameSite(host: string, named: string): boolean {
  const n = named.toLowerCase().replace(/^www\./, '');
  const h = host.replace(/^www\./, '');
  return h === n || h.endsWith(`.${n}`) || n.endsWith(`.${h}`);
}

function labelMismatch(host: string, label: string | undefined): boolean {
  const text = (label || '').toLowerCase();
  if (!text.trim()) return false;
  const named = text.match(/(?:[a-z0-9-]+\.)+[a-z]{2,}/g) || [];
  if (named.some((domain) => !sameSite(host, domain))) return true;
  if (/par\s*-?\s*noir/.test(text) && !hostMatches(host, PAR_NOIR_HOSTS)) return true;
  return false;
}

export function checkLink(raw: string | undefined, label?: string): LinkVerdict {
  const value = (raw || '').trim();
  if (!value) return { ok: false, reason: 'invalid' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_https' };
  if (url.username || url.password) return { ok: false, reason: 'credentials' };
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, reason: 'invalid' };
  if (isIpHost(host) || isLocalHost(host)) return { ok: false, reason: 'ip_or_local' };
  if (hostMatches(host, LINK_BLOCKLIST)) return { ok: false, reason: 'blocklisted' };

  const warnings: LinkWarning[] = [];
  if (host.split('.').some((part) => part.startsWith('xn--'))) warnings.push('lookalike_host');
  const path = url.pathname.toLowerCase();
  if (RISKY_DOWNLOAD.some((ext) => path.endsWith(ext))) warnings.push('download');
  if (hostMatches(host, LINK_SHORTENERS)) warnings.push('shortener');
  if (labelMismatch(host, label)) warnings.push('label_mismatch');
  return { ok: true, url: url.toString(), host, warnings };
}
