/**
 * Google connect has a token and no Key 1 / Key 2. The unlock app seals the
 * envelope and returns ciphertext. The token stays in this tab's sessionStorage
 * so Drive calls can continue after the handoff.
 */

import {
  buildShellLaunchUrl,
  buildShellWebUrl,
  shellLaunchAfterAppProbe,
  tryPreferUnlockApp,
  type HostedShellSession,
} from '@par-noir/oauth-ui';
import { setSessionCloudCredentials } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import { API_ENDPOINT } from '../config/api';

const PENDING_KEY = 'pn-pending-cloud-envelope';

function b64Url(json: string): string {
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function nativeUnlockShell(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (
    window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  ).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform();
}

/**
 * Ask the Unlock app to seal the Drive envelope. If the page stays visible,
 * open the same seal flow on the web unlock page. A custom-scheme assignment
 * that does not leave the tab is what left setup stuck at 0%.
 */
export async function launchSealVault(
  identityId: string,
  credentials: StorageCredentialsEnvelope
): Promise<'app' | 'web'> {
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({ identityId, credentials })
  );
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
  const launch = {
    op: 'seal_vault' as const,
    returnTo,
    vaultPayload: b64Url(JSON.stringify(credentials)),
  };
  await tryPreferUnlockApp(buildShellLaunchUrl(launch));
  const decision = shellLaunchAfterAppProbe({
    nativePlatform: nativeUnlockShell(),
    documentHidden: typeof document !== 'undefined' && document.hidden,
  });
  if (decision === 'web') {
    window.location.assign(buildShellWebUrl(launch));
  }
  return decision;
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
  const { sessionDriveFor } = await import('./sessionDrive');
  await sessionDriveFor(pending.identityId, authToken);
}
