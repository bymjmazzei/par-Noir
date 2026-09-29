/**
 * A seal that already returned to this tab. New Google connects finish in
 * this tab via connectDriveInThisSession and do not open Unlock.
 */

import { type HostedShellSession } from '@par-noir/oauth-ui';
import { setSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';

const PENDING_KEY = 'pn-pending-cloud-envelope';

export async function publishSealedVault(session: HostedShellSession, authToken: string): Promise<void> {
  const sealed = session.result?.sealedVault;
  if (!sealed) return;
  const pendingRaw = sessionStorage.getItem(PENDING_KEY);
  if (!pendingRaw) return;
  const pending = JSON.parse(pendingRaw) as {
    identityId: string;
    credentials: StorageCredentialsEnvelope;
  };
  setSessionCloudCredentials(pending.identityId, pending.credentials);
  const envelope = JSON.parse(sealed);
  await fetch(
    `${API_ENDPOINT.replace(/\/$/, '')}/api/storage/cloud-vault/${encodeURIComponent(pending.identityId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ envelope }),
    }
  );
  sessionStorage.removeItem(PENDING_KEY);
  const { sessionDriveFor } = await import('./sessionDrive');
  await sessionDriveFor(pending.identityId, authToken);
}
