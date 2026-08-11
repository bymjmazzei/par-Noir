/**
 * Sync HTTPS + per-backend host allowlist for publicContentRef.publicUrl.
 * DNS / private-IP resolution is API-side (Node) in safePublicFetchUrl.
 */

export class UnsafePublicFetchUrlError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'INVALID_URL'
      | 'SCHEME'
      | 'CREDENTIALS'
      | 'HOST'
      | 'BACKEND'
      | 'PRIVATE_IP' = 'INVALID_URL'
  ) {
    super(message);
    this.name = 'UnsafePublicFetchUrlError';
  }
}

/** Exact hosts or suffix patterns (leading *. = any subdomain of the rest). */
const BACKEND_HOST_RULES: Record<string, string[]> = {
  google_drive: ['drive.google.com', 'drive.usercontent.google.com'],
  dropbox: ['dl.dropboxusercontent.com', 'www.dropbox.com'],
  onedrive: ['1drv.ms', 'onedrive.live.com', '*.sharepoint.com'],
  aws_s3: ['*.amazonaws.com'],
  azure_blob: ['*.blob.core.windows.net'],
};

function hostMatchesRule(hostname: string, rule: string): boolean {
  const host = hostname.toLowerCase();
  const r = rule.toLowerCase();
  if (r.startsWith('*.')) {
    const suffix = r.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return host === r;
}

export function isAllowedPublicFetchHost(hostname: string, backend: string): boolean {
  const rules = BACKEND_HOST_RULES[backend];
  if (!rules || rules.length === 0) return false;
  return rules.some((rule) => hostMatchesRule(hostname, rule));
}

/** IPv4 / IPv6 literals that must never be fetched (SSRF). */
export function isBlockedIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const octets = v4.slice(1).map((n) => Number(n));
    if (octets.some((o) => o > 255)) return true;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 (simplified)
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // ULA
    if (h.startsWith('fe80')) return true; // link-local
    if (h.startsWith('ff')) return true; // multicast
    // IPv4-mapped
    const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
    if (mapped) return isBlockedIpLiteral(mapped[1]);
  }

  return false;
}

/**
 * Sync structural + host allowlist check. Does not resolve DNS.
 * Throws UnsafePublicFetchUrlError on violation.
 */
export function assertSafePublicFetchUrl(url: string, backend: string): URL {
  if (!backend || typeof backend !== 'string') {
    throw new UnsafePublicFetchUrlError('backend required for publicUrl allowlist', 'BACKEND');
  }
  if (!BACKEND_HOST_RULES[backend]) {
    throw new UnsafePublicFetchUrlError(`backend ${backend} has no publicUrl allowlist`, 'BACKEND');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafePublicFetchUrlError('publicUrl is not a valid URL', 'INVALID_URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new UnsafePublicFetchUrlError('publicUrl must use https', 'SCHEME');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafePublicFetchUrlError('publicUrl must not include credentials', 'CREDENTIALS');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new UnsafePublicFetchUrlError('publicUrl missing hostname', 'HOST');
  }

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UnsafePublicFetchUrlError('publicUrl host is blocked', 'HOST');
  }

  if (isBlockedIpLiteral(hostname)) {
    throw new UnsafePublicFetchUrlError('publicUrl resolves to a blocked IP literal', 'PRIVATE_IP');
  }

  if (!isAllowedPublicFetchHost(hostname, backend)) {
    throw new UnsafePublicFetchUrlError(
      `publicUrl host not allowlisted for backend ${backend}`,
      'HOST'
    );
  }

  return parsed;
}

export function isSafePublicFetchUrlShape(url: string, backend: string): boolean {
  try {
    assertSafePublicFetchUrl(url, backend);
    return true;
  } catch {
    return false;
  }
}
