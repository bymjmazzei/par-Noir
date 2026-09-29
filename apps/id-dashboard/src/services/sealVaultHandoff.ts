/**
 * Google connect has a token and no Key 1 / Key 2. The unlock app seals the
 * envelope and returns ciphertext. The token stays in this tab's sessionStorage
 * so Drive calls can continue after the handoff.
 */

import { buildShellLaunchUrl, type HostedShellSession } from '@par-noir/oauth-ui';
import { setSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';

const PENDING_KEY = 'pn-pending-cloud-envelope';

function b64Url(json: string): string {
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function launchSealVault(identityId: string, credentials: StorageCredentialsEnvelope): void {
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ identityId, credentials })
  );
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  window.location.href = buildShellLaunchUrl({
    op: 'seal_vault',
    returnTo,
    vaultPayload: b64Url(JSON.stringify(credentials)),
  });
}

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
}
