/**
 * Single unlock-scoped wait for Drive-ready cloud credentials.
 * Mailbox drain and preferences load await this instead of racing vault hydrate.
 */

import {
  hasCloudCredentialsReady,
  waitForCloudCredentialsReady,
  PN_CLOUD_CREDENTIALS_READY_EVENT
} from '@par-noir/device-cloud-credentials';

const completed = new Set<string>();

export function resetCloudUnlockCoordinator(pnIdentifier?: string): void {
  if (pnIdentifier) {
    completed.delete(pnIdentifier);
  } else {
    completed.clear();
  }
}

/** Called after publishCloudDriveReady succeeds (or vault already had secrets). */
export function markCloudUnlockComplete(pnIdentifier: string, ok: boolean): void {
  if (ok) {
    completed.add(pnIdentifier);
  }
}

/**
 * Resolves when session has a usable Google access token, or timeout.
 */
export async function awaitCloudUnlockComplete(
  pnIdentifier: string,
  timeoutMs = 60_000
): Promise<boolean> {
  if (hasCloudCredentialsReady(pnIdentifier) || completed.has(pnIdentifier)) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (ok) completed.add(pnIdentifier);
      resolve(ok);
    };

    const onReady = () => {
      if (hasCloudCredentialsReady(pnIdentifier)) finish(true);
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
      }
    };

    const timer = setTimeout(() => {
      finish(hasCloudCredentialsReady(pnIdentifier));
    }, timeoutMs);

    if (typeof window !== 'undefined') {
      window.addEventListener(PN_CLOUD_CREDENTIALS_READY_EVENT, onReady);
    }

    void waitForCloudCredentialsReady(pnIdentifier, timeoutMs).then(finish);
  });
}
