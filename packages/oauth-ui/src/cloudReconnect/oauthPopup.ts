import {
  exchangeProviderAuthorizationCode,
  fetchGoogleUserInfo,
  GOOGLE_TOKEN_URL,
  takePkceVerifier
} from '@par-noir/device-cloud-credentials';

/**
 * Wait for oauth-callback.html postMessage / BroadcastChannel / localStorage with an auth code.
 *
 * Google OAuth often nulls window.opener (COOP). The callback still delivers via
 * BroadcastChannel + pn_oauth_latest_key; Connect must not rely on postMessage alone.
 */
export function waitForOAuthPopupCode(opts?: {
  timeoutMs?: number;
  origin?: string;
}): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const expectedOrigin = opts?.origin ?? window.location.origin;

  return new Promise((resolve, reject) => {
    let settled = false;
    const startedAt = Date.now();

    // Drop stale handoffs from a prior Connect attempt so we do not consume an old code.
    try {
      const oldKey = localStorage.getItem('pn_oauth_latest_key');
      if (oldKey) localStorage.removeItem(oldKey);
      localStorage.removeItem('pn_oauth_latest_key');
      localStorage.removeItem('pn_oauth_pending');
    } catch {
      /* ignore */
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('OAuth timeout — please try again'));
    }, timeoutMs);

    const bc =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('par-noir-oauth-v1') : null;

    const finish = (payload: { type?: string; code?: string; error?: string }) => {
      if (settled) return;
      if (payload?.type && payload.type !== 'oauth_callback' && payload.type !== 'GOOGLE_OAUTH_CODE') {
        return;
      }
      settled = true;
      cleanup();
      if (payload.error) reject(new Error(payload.error));
      else if (payload.code) resolve(payload.code);
      else reject(new Error('No authorization code'));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      const payload = event.data as { type?: string; code?: string; error?: string };
      if (payload?.type !== 'oauth_callback' && payload?.type !== 'GOOGLE_OAUTH_CODE') return;
      finish(payload);
    };

    const readLatestFromStorage = () => {
      try {
        const key = localStorage.getItem('pn_oauth_latest_key');
        if (!key) return;
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const payload = JSON.parse(raw) as { type?: string; code?: string; error?: string; timestamp?: number };
        if (payload?.type !== 'oauth_callback' && payload?.type !== 'GOOGLE_OAUTH_CODE') return;
        // Only accept handoffs created after this wait started (allow 2s clock skew).
        if (typeof payload.timestamp === 'number' && payload.timestamp < startedAt - 2000) return;
        if (payload.code || payload.error) finish(payload);
      } catch {
        /* ignore */
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pn_oauth_latest_key' || (event.key && event.key.startsWith('pn_oauth_callback_'))) {
        readLatestFromStorage();
      }
    };

    const poll = window.setInterval(readLatestFromStorage, 250);

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      bc?.close();
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    if (bc) {
      bc.onmessage = (ev: MessageEvent) => {
        const payload = ev.data as { type?: string; code?: string; error?: string };
        if (payload?.type === 'oauth_callback' || payload?.type === 'GOOGLE_OAUTH_CODE') {
          finish(payload);
        }
      };
    }
    readLatestFromStorage();
  });
}

export async function exchangeGoogleOAuthCode(opts: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  email?: string;
  name?: string;
}> {
  const tokens = await exchangeProviderAuthorizationCode({
    tokenUrl: GOOGLE_TOKEN_URL,
    clientId: opts.clientId,
    code: opts.code,
    redirectUri: opts.redirectUri,
    codeVerifier: opts.codeVerifier ?? takePkceVerifier()
  });
  if (!tokens) {
    throw new Error('Failed to exchange Google authorization code');
  }
  const profile = await fetchGoogleUserInfo(tokens.accessToken);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    email: profile.email,
    name: profile.name
  };
}
