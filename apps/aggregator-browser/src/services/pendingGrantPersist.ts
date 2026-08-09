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
 */

import {
  ensureCloudAccessToken,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { PN_CLIENT_ID } from '../config/oauthClient';

interface PendingGrant {
  clientId: string;
  /** The user's per-data-point choices. Empty array means "shared nothing". */
  grantedDataPoints: string[];
}

let pending: PendingGrant | null = null;

/**
 * Record a consent choice awaiting a Drive token.
 * Call only when consent was actually shown; a skipped consent has nothing new
 * to persist and must not overwrite what is already stored.
 */
export function setPendingGrant(grantedDataPoints: string[]): void {
  pending = { clientId: PN_CLIENT_ID, grantedDataPoints };
}

export function clearPendingGrant(): void {
  pending = null;
}

export function hasPendingGrant(): boolean {
  return pending !== null;
}

/**
 * Send the held consent choice now that the vault is hydrated.
 * Returns true when the grant was persisted, so the next unlock can skip consent.
 */
export async function flushPendingGrant(params: {
  authToken: string;
  pnIdentifier: string;
}): Promise<boolean> {
  const grant = pending;
  if (!grant) return false;

  // Refresh if the session token has aged out. Forwarding a dead token here is
  // what turned this call into a 500 and left the grant unwritten, so the next
  // unlock asked for consent all over again.
  const accessToken = await ensureCloudAccessToken({
    authToken: params.authToken,
    pnIdentifier: params.pnIdentifier,
    apiEndpoint: API_ENDPOINT,
    path: 'grant-persist'
  });
  if (!accessToken) {
    // Keep it pending: hydration may still be in flight.
    return false;
  }

  try {
    const res = await fetch(`${API_ENDPOINT.replace(/\/$/, '')}/oauth/grant/persist`, {
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

    if (!res.ok) {
      // 409 means the token was not usable; leave it pending for a later attempt.
      console.warn('[OAuth] Grant persist did not succeed', { status: res.status });
      return false;
    }

    pending = null;
    return true;
  } catch {
    console.warn('[OAuth] Grant persist request failed');
    return false;
  }
}
