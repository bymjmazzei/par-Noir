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
  apiEndpoint: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
  const response = await fetch(`${opts.apiEndpoint.replace(/\/$/, '')}/api/auth/google-oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: opts.code, redirectUri: opts.redirectUri })
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'Too many requests (rate limited). Wait about a minute, then try Reconnect again — do not spam Authorize.'
      );
    }
    const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
    throw new Error(err.message || err.error || 'Failed to exchange Google authorization code');
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error('Google token response missing access_token');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in
  };
}
