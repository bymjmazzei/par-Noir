/**
 * Persist the OAuth consent choice once the cloud vault is hydrated.
 *
 * Token exchange runs before hydration, so under device cloud custody the server
 * has no Drive token at that moment and cannot write the grant. Without this the
 * user re-consents on every unlock. We hold the choice in memory across those few
 * seconds and hand it to the API once a Drive token exists.
 *
 * In-memory only, by design: this must not survive a lock, and the Drive token it
 * forwards must never be written to localStorage or sessionStorage.
 *
 * Call setPendingGrant only when the consent step was actually shown
 * (`consent_shown=1`). Consent-skip unlocks must not re-flush every time.
 */

import {
  ensureCloudAccessToken,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';

interface PendingGrant {
  clientId: string;
  /** The user's per-data-point choices. Empty array means "shared nothing". */
  grantedDataPoints: string[];
}

let pending: PendingGrant | null = null;
let flushInFlight: Promise<boolean> | null = null;

/**
 * Record a consent choice awaiting a Drive token.
 * Call only when consent was shown (`consent_shown=1` on the OAuth return).
 */
export function setPendingGrant(
  clientId: string,
  grantedDataPoints: string[]
): void {
  if (!clientId || !clientId.trim()) return;
  pending = { clientId: clientId.trim(), grantedDataPoints };
}

export function clearPendingGrant(): void {
  pending = null;
}

export function hasPendingGrant(): boolean {
  return pending !== null;
}

async function waitForDriveInit(
  apiEndpoint: string,
  authToken: string,
  pnIdentifier: string,
  accessToken: string
): Promise<boolean> {
  const base = apiEndpoint.replace(/\/$/, '');
  const id = encodeURIComponent(pnIdentifier);
  const headers = {
    Authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    [PN_CLOUD_ACCESS_TOKEN_HEADER]: accessToken
  };

  const initRes = await fetch(`${base}/api/storage/initialize/${id}`, {
    method: 'POST',
    headers
  });
  // 202 accepted or 200 already ready — both OK to poll
  if (!initRes.ok && initRes.status !== 202) {
    console.warn('[OAuth] Drive initialize failed', { status: initRes.status });
    return false;
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const statusRes = await fetch(`${base}/api/storage/initialize/${id}/status`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        [PN_CLOUD_ACCESS_TOKEN_HEADER]: accessToken
      }
    });
    if (statusRes.ok) {
      const body = (await statusRes.json().catch(() => ({}))) as {
        complete?: boolean;
        failed?: boolean;
        initInProgress?: boolean;
      };
      if (body.complete) return true;
      if (body.failed) {
        console.warn('[OAuth] Drive initialize reported failed');
        return false;
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.warn('[OAuth] Drive initialize timed out');
  return false;
}

/**
 * Send the held consent choice now that the vault is hydrated.
 * Returns true when the grant was persisted, so the next unlock can skip consent.
 * Single-flight: concurrent callers share one attempt; non-retryable errors clear pending.
 */
export async function flushPendingGrant(params: {
  authToken: string;
  pnIdentifier: string;
  apiEndpoint: string;
}): Promise<boolean> {
  if (!pending) return false;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const grant = pending;
    if (!grant) return false;

    const accessToken = await ensureCloudAccessToken({
      authToken: params.authToken,
      pnIdentifier: params.pnIdentifier,
      apiEndpoint: params.apiEndpoint,
      path: 'grant-persist'
    });
    if (!accessToken) {
      // Keep pending: hydrate may still be in flight.
      return false;
    }

    const postPersist = async (): Promise<Response> =>
      fetch(`${params.apiEndpoint.replace(/\/$/, '')}/oauth/grant/persist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.authToken}`,
          'Content-Type': 'application/json',
          [PN_CLOUD_ACCESS_TOKEN_HEADER]: accessToken
        },
        body: JSON.stringify({
          client_id: grant.clientId,
          granted_data_points: grant.grantedDataPoints
        })
      });

    try {
      let res = await postPersist();

      if (res.ok) {
        pending = null;
        return true;
      }

      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === 'drive_index_incomplete') {
          console.warn('[OAuth] Grant persist waiting on Drive index — initializing');
          const ready = await waitForDriveInit(
            params.apiEndpoint,
            params.authToken,
            params.pnIdentifier,
            accessToken
          );
          if (!ready) return false;
          res = await postPersist();
          if (res.ok) {
            pending = null;
            return true;
          }
          if (res.status === 409) {
            const again = (await res.json().catch(() => ({}))) as { error?: string };
            console.warn('[OAuth] Grant persist still blocked after initialize', {
              error: again.error || 'cloud_token_required'
            });
            return false;
          }
        } else {
          // cloud_token_required (or unknown 409) — leave pending for later hydrate.
          console.warn('[OAuth] Grant persist waiting on cloud token', { status: 409 });
          return false;
        }
      }

      // Other errors: clear pending so a render loop cannot hammer the API.
      console.warn('[OAuth] Grant persist did not succeed', { status: res.status });
      pending = null;
      return false;
    } catch {
      console.warn('[OAuth] Grant persist request failed');
      pending = null;
      return false;
    }
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
