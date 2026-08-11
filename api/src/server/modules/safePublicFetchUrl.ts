/**
 * Node-side publicUrl SSRF guard: sync allowlist + DNS private-IP block + safe redirects.
 */
import { promises as dns } from 'dns';
import {
  assertSafePublicFetchUrl,
  isBlockedIpLiteral,
  UnsafePublicFetchUrlError,
} from '@par-noir/aggregator-domain';

export { UnsafePublicFetchUrlError };

const MAX_REDIRECTS = 5;

function isBlockedResolvedAddress(address: string): boolean {
  return isBlockedIpLiteral(address);
}

/**
 * Sync host allowlist + resolve DNS; reject if any address is private/blocked.
 */
export async function assertSafePublicFetchUrlResolved(
  url: string,
  backend: string
): Promise<URL> {
  const parsed = assertSafePublicFetchUrl(url, backend);
  const hostname = parsed.hostname;

  // IP literals already checked in assertSafePublicFetchUrl
  if (isBlockedIpLiteral(hostname)) {
    throw new UnsafePublicFetchUrlError('publicUrl host is a blocked IP', 'PRIVATE_IP');
  }

  // Skip DNS for pure IP hosts (already validated); for names, resolve both families.
  const looksLikeIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
  if (looksLikeIp) {
    return parsed;
  }

  let addresses: string[] = [];
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);
    addresses = [...v4, ...v6];
    if (addresses.length === 0) {
      // Fallback to lookup (CNAME / odd resolvers)
      const looked = await dns.lookup(hostname, { all: true });
      addresses = looked.map((e) => e.address);
    }
  } catch (err) {
    throw new UnsafePublicFetchUrlError(
      `publicUrl DNS resolution failed: ${err instanceof Error ? err.message : 'unknown'}`,
      'HOST'
    );
  }

  if (addresses.length === 0) {
    throw new UnsafePublicFetchUrlError('publicUrl DNS returned no addresses', 'HOST');
  }

  for (const addr of addresses) {
    if (isBlockedResolvedAddress(addr)) {
      throw new UnsafePublicFetchUrlError(
        'publicUrl resolves to a blocked/private address',
        'PRIVATE_IP'
      );
    }
  }

  return parsed;
}

export type SafeFetchBytesResult = {
  status: number;
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
};

/**
 * GET bytes with redirect:manual; re-validate each Location against the same backend allowlist.
 */
export async function fetchSafePublicBytes(
  url: string,
  backend: string,
  options?: { accept?: string }
): Promise<SafeFetchBytesResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafePublicFetchUrlResolved(current, backend);

    const res = await fetch(current, {
      redirect: 'manual',
      headers: {
        Accept: options?.accept || 'application/octet-stream,application/json,*/*',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new UnsafePublicFetchUrlError('redirect without Location', 'INVALID_URL');
      }
      // Resolve relative Location against current
      current = new URL(location, current).toString();
      continue;
    }

    const contentType = res.headers.get('content-type');
    const ab = await res.arrayBuffer();
    return {
      status: res.status,
      buffer: Buffer.from(ab),
      contentType,
      finalUrl: current,
    };
  }

  throw new UnsafePublicFetchUrlError('too many redirects', 'INVALID_URL');
}
