export const DEFAULT_API_URL = 'https://api.parnoir.com';

/** Only PN_API_URL is configurable. https only, except a local API on loopback. */
export function resolveApiUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.PN_API_URL || DEFAULT_API_URL).trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('PN_API_URL is not a valid URL');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('PN_API_URL must use https');
  }
  return raw;
}
