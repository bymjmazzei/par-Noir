/**
 * Shared pN OAuth popup flow. Must stay in sync with static oauth-callback.html
 * (apps/aggregator-browser/public/oauth-callback.html and copies in other apps).
 *
 * Contract:
 * - Callback page posts message: { type: 'oauth_callback', code?, state?, error?, age_shared?, timestamp? }
 * - Callback page sets localStorage: pn_oauth_pending, pn_oauth_latest_key, pn_oauth_callback_<ts>
 */

export const PN_OAUTH_MESSAGE_TYPE = 'oauth_callback' as const;
export const PN_OAUTH_STORAGE_PENDING = 'pn_oauth_pending';
export const PN_OAUTH_STORAGE_LATEST_KEY = 'pn_oauth_latest_key';

export interface OAuthConsentUrlConfig {
  clientId: string;
  apiEndpoint: string;
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
  /** When true (default), adds popup=true so API consent knows to close/popup UX */
  forPopup?: boolean;
}

export interface PnOAuthPopupResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  age_shared?: string;
}

function generateRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build authorize URL to API /oauth/authorize/consent (redirects to /oauth/consent).
 */
export function buildOAuthConsentUrl(config: OAuthConsentUrlConfig): string {
  const state = config.state ?? generateRandomHex(16);
  const nonce = config.nonce ?? generateRandomHex(16);
  const scope = (config.scope ?? ['openid', 'profile']).join(' ');
  const forPopup = config.forPopup !== false;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope,
    state,
    nonce,
  });
  if (forPopup) {
    params.set('popup', 'true');
  }

  const base = config.apiEndpoint.replace(/\/$/, '');
  return `${base}/oauth/authorize/consent?${params.toString()}`;
}

/** @deprecated Use buildOAuthConsentUrl */
export function buildOAuthAuthorizeUrl(config: OAuthConsentUrlConfig): string {
  return buildOAuthConsentUrl(config);
}

const DEFAULT_POPUP_FEATURES = 'width=500,height=600,scrollbars=yes,resizable=yes';

export interface StartPnOAuthPopupOptions {
  url: string;
  expectedState: string;
  /** Opener origin for postMessage validation (default window.location.origin) */
  origin?: string;
  timeoutMs?: number;
  popupName?: string;
  popupFeatures?: string;
}

function parseOAuthPayload(raw: Record<string, unknown>): PnOAuthPopupResult | null {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.type !== PN_OAUTH_MESSAGE_TYPE) return null;
  return {
    code: typeof raw.code === 'string' ? raw.code : undefined,
    state: typeof raw.state === 'string' ? raw.state : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    error_description: typeof raw.error_description === 'string' ? raw.error_description : undefined,
    age_shared: typeof raw.age_shared === 'string' ? raw.age_shared : undefined,
  };
}

/**
 * Opens consent URL in a popup and resolves when oauth_callback is received (postMessage or localStorage poll).
 */
export function startPnOAuthPopup(options: StartPnOAuthPopupOptions): Promise<PnOAuthPopupResult> {
  const {
    url,
    expectedState,
    origin = typeof window !== 'undefined' ? window.location.origin : '',
    timeoutMs = 300_000,
    popupName = 'pn-oauth',
    popupFeatures = DEFAULT_POPUP_FEATURES,
  } = options;

  return new Promise((resolve, reject) => {
    const popup = window.open(url, popupName, popupFeatures);
    if (!popup) {
      reject(new Error('POPUP_BLOCKED'));
      return;
    }

    let settled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let checkClosedInterval: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let popupClosedTime: number | null = null;

    const finish = (result: PnOAuthPopupResult) => {
      if (settled) return;
      settled = true;
      if (pollInterval !== undefined) clearInterval(pollInterval);
      if (checkClosedInterval !== undefined) clearInterval(checkClosedInterval);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      try {
        localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
        localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      if (pollInterval !== undefined) clearInterval(pollInterval);
      if (checkClosedInterval !== undefined) clearInterval(checkClosedInterval);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      try {
        localStorage.removeItem(PN_OAUTH_STORAGE_PENDING);
        localStorage.removeItem(PN_OAUTH_STORAGE_LATEST_KEY);
      } catch {
        /* ignore */
      }
      reject(err);
    };

    const acceptPayload = (raw: Record<string, unknown>) => {
      const parsed = parseOAuthPayload(raw);
      if (!parsed) return;
      if (parsed.state !== undefined && parsed.state !== expectedState) return;
      finish(parsed);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      acceptPayload(data as Record<string, unknown>);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pn_oauth_callback' && event.newValue) {
        try {
          const data = JSON.parse(event.newValue) as Record<string, unknown>;
          acceptPayload(data);
        } catch {
          /* ignore */
        }
        try {
          localStorage.removeItem('pn_oauth_callback');
        } catch {
          /* ignore */
        }
      }
    };

    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);

    pollInterval = setInterval(() => {
      if (settled) return;
      try {
        const pending = localStorage.getItem(PN_OAUTH_STORAGE_PENDING);
        const latestKey = localStorage.getItem(PN_OAUTH_STORAGE_LATEST_KEY);
        if (pending === 'true' && latestKey) {
          const stored = localStorage.getItem(latestKey);
          if (stored) {
            try {
              const data = JSON.parse(stored) as Record<string, unknown>;
              const age = Date.now() - ((data.timestamp as number) || 0);
              if (data.timestamp && age < 30_000) {
                try {
                  localStorage.removeItem(latestKey);
                } catch {
                  /* ignore */
                }
                acceptPayload(data);
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }, 50);

    checkClosedInterval = setInterval(() => {
      if (settled) return;
      try {
        if (popup.closed) {
          if (popupClosedTime === null) popupClosedTime = Date.now();
          else if (Date.now() - popupClosedTime > 3000) {
            fail(new Error('POPUP_CLOSED'));
          }
        }
      } catch {
        /* COOP may throw */
      }
    }, 500);

    timeoutId = setTimeout(() => {
      if (!settled) fail(new Error('POPUP_TIMEOUT'));
    }, timeoutMs);
  });
}
