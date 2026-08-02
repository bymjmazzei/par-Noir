import { API_ENDPOINT } from './api';

const PUBLIC_CONFIG_CACHE_KEY = 'pn_public_config_v1';
const PUBLIC_CONFIG_TTL_MS = 60 * 60 * 1000;

type PublicConfigCache = {
  googleDriveClientId: string;
  fetchedAt: number;
};

function readCachedPublicConfig(): PublicConfigCache | null {
  try {
    const raw = sessionStorage.getItem(PUBLIC_CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicConfigCache;
    if (!parsed?.fetchedAt || Date.now() - parsed.fetchedAt > PUBLIC_CONFIG_TTL_MS) {
      sessionStorage.removeItem(PUBLIC_CONFIG_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedPublicConfig(googleDriveClientId: string): void {
  try {
    sessionStorage.setItem(
      PUBLIC_CONFIG_CACHE_KEY,
      JSON.stringify({ googleDriveClientId, fetchedAt: Date.now() } satisfies PublicConfigCache)
    );
  } catch {
    /* ignore quota errors */
  }
}

/** Local retry — do not import utils/helpers (config↔utils cycle causes TDZ in prod chunks). */
async function retryPublicConfigFetch<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 4,
  baseDelay: number = 1500
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) throw lastError;
      const retryAfter = (error as { retryAfter?: number })?.retryAfter;
      const delay = retryAfter || baseDelay * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError!;
}

/**
 * Returns the Google Drive OAuth client ID for the dashboard.
 * Uses VITE_GOOGLE_DRIVE_CLIENT_ID at build time when set; otherwise
 * fetches from API /api/public-config so deploys don't depend on .env.
 */
export async function getGoogleDriveClientId(): Promise<string> {
  const fromEnv = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
  if (fromEnv && typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return fromEnv.trim();
  }

  const cached = readCachedPublicConfig();
  if (cached?.googleDriveClientId) {
    return cached.googleDriveClientId;
  }

  try {
    const clientId = await retryPublicConfigFetch(async () => {
      const res = await fetch(`${API_ENDPOINT}/api/public-config`);
      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
        const err = new Error('Rate limited fetching public config');
        (err as { retryAfter?: number }).retryAfter = Number.isFinite(retryAfterSec)
          ? retryAfterSec * 1000
          : 3000;
        throw err;
      }
      if (!res.ok) return '';
      const data = (await res.json()) as { googleDriveClientId?: string };
      return (data.googleDriveClientId && String(data.googleDriveClientId).trim()) || '';
    });

    if (clientId) {
      writeCachedPublicConfig(clientId);
    }
    return clientId;
  } catch {
    return cached?.googleDriveClientId || '';
  }
}
