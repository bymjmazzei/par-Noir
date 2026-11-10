/**
 * Persist the OAuth consent choice and release the proofs it covers.
 *
 * The API records the grant itself, but it never reads the user's cloud, so the
 * proofs behind the chosen data points come from this device. We hold the choice
 * in memory until the cloud vault is hydrated, then send both together.
 *
 * In-memory only, by design: this must not survive a lock, and the cloud token
 * used to read proofs must never be written to localStorage or sessionStorage.
 *
 * Call setPendingGrant only when the consent step was actually shown
 * (`consent_shown=1`). Consent-skip unlocks must not re-flush every time.
 */

import { ensureCloudAccessToken, heldProofsFor } from '@par-noir/device-cloud-credentials';

interface PendingGrant {
  clientId: string;
  /** The user's per-data-point choices. Empty array means "shared nothing". */
  grantedDataPoints: string[];
}

let pending: PendingGrant | null = null;
let flushInFlight: Promise<boolean> | null = null;

/**
 * Record a consent choice awaiting the cloud vault.
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

async function proofsToRelease(
  params: { authToken: string; pnIdentifier: string; apiEndpoint: string },
  grantedDataPoints: string[]
) {
  if (grantedDataPoints.length === 0) return [];
  const accessToken = await ensureCloudAccessToken({
    authToken: params.authToken,
    pnIdentifier: params.pnIdentifier,
    apiEndpoint: params.apiEndpoint,
    path: 'grant-persist'
  });
  if (!accessToken) return null;
  return heldProofsFor({
    accessToken,
    pnIdentifier: params.pnIdentifier,
    dataPointIds: grantedDataPoints
  });
}

/**
 * Send the held consent choice with the proofs it covers.
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

    let releasedProofs: Awaited<ReturnType<typeof proofsToRelease>> = [];
    try {
      releasedProofs = await proofsToRelease(params, grant.grantedDataPoints);
    } catch {
      console.warn('[OAuth] Could not read held proofs; persisting grant without them');
      releasedProofs = [];
    }
    if (releasedProofs === null) {
      // Keep pending: hydrate may still be in flight.
      return false;
    }

    try {
      const res = await fetch(`${params.apiEndpoint.replace(/\/$/, '')}/oauth/grant/persist`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: grant.clientId,
          granted_data_points: grant.grantedDataPoints,
          released_proofs: releasedProofs
        })
      });
      // Clear either way so a render loop cannot hammer the API.
      pending = null;
      if (!res.ok) {
        console.warn('[OAuth] Grant persist did not succeed', { status: res.status });
        return false;
      }
      return true;
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
