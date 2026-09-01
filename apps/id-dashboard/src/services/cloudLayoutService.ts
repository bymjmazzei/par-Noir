/**
 * Owner cloud layout version status + upgrade (dashboard).
 */

import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { ownerFetch } from './ownerApiService';

export type CloudLayoutPending = { id: string; description: string };

export type CloudLayoutStatus = {
  identityId?: string;
  current: number;
  required: number;
  pending: CloudLayoutPending[];
  complete: boolean;
  appliedMigrations: string[];
};

/** Status is credentials-only — do not require X-PN-Cloud-Access-Token. */
export async function fetchCloudLayoutStatus(
  authToken: string,
  pnIdentifier: string
): Promise<CloudLayoutStatus | null> {
  const path = `/api/storage/${encodeURIComponent(pnIdentifier)}/layout/status`;
  const proof = await deviceProofHeaders('GET', path);
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...proof,
    },
  });
  if (res.status === 404) {
    return {
      current: 0,
      required: 1,
      pending: [],
      complete: false,
      appliedMigrations: [],
    };
  }
  if (!res.ok) return null;
  return (await res.json()) as CloudLayoutStatus;
}

export async function upgradeCloudLayout(
  authToken: string,
  pnIdentifier: string
): Promise<CloudLayoutStatus> {
  const res = await ownerFetch(
    authToken,
    'POST',
    `/api/storage/${encodeURIComponent(pnIdentifier)}/layout/upgrade`,
    {},
    { pnIdentifier }
  );
  const body = (await res.json().catch(() => ({}))) as CloudLayoutStatus & {
    error?: string;
    message?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(
      body.message || body.error_description || body.error || `Layout upgrade failed (${res.status})`
    );
  }
  return body;
}
