/**
 * Wait for oauth-callback.html postMessage / BroadcastChannel with an auth code.
 */
export function waitForOAuthPopupCode(opts?: {
  timeoutMs?: number;
  origin?: string;
}): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const expectedOrigin = opts?.origin ?? window.location.origin;

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('OAuth timeout — please try again'));
    }, timeoutMs);

    const bc =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('par-noir-oauth-v1') : null;

    const finish = (payload: { code?: string; error?: string }) => {
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

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      bc?.close();
    };

    window.addEventListener('message', onMessage);
    if (bc) {
      bc.onmessage = (ev: MessageEvent) => {
        const payload = ev.data as { type?: string; code?: string; error?: string };
        if (payload?.type === 'oauth_callback' || payload?.type === 'GOOGLE_OAUTH_CODE') {
          finish(payload);
        }
      };
    }
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
