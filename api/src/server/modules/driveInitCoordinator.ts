/**
 * One in-flight Drive layout init per pN — dedupes concurrent PUT + POST /initialize calls.
 *
 * Progress stays visible after settle so clients polling GET .../status can observe
 * complete/failed (POST returns 202 without awaiting Drive work).
 */

import { normalizePnIdentifier } from './integratorStoragePaths';
import {
  clearDriveInitProgress,
  getDriveInitProgress,
  setDriveInitProgress,
} from './driveInitProgress';

export type DriveInitResult = { metadataFolderId: string; pnFolderId: string };

/** How long complete/failed progress remains readable for status polls. */
const SETTLED_PROGRESS_TTL_MS = 120_000;

const inflight = new Map<string, Promise<DriveInitResult>>();

export function isDriveInitInFlight(pnIdentifier: string): boolean {
  return inflight.has(normalizePnIdentifier(pnIdentifier));
}

function scheduleSettledProgressClear(key: string, phase: 'complete' | 'failed'): void {
  setTimeout(() => {
    const cur = getDriveInitProgress(key);
    if (cur?.phase === phase) clearDriveInitProgress(key);
  }, SETTLED_PROGRESS_TTL_MS);
}

export function runDriveInitOnce(
  pnIdentifier: string,
  runner: () => Promise<DriveInitResult>
): Promise<DriveInitResult> {
  const key = normalizePnIdentifier(pnIdentifier);
  const existing = inflight.get(key);
  if (existing) {
    console.log(`[DriveInit] Joining in-flight init for ${key}`);
    return existing;
  }
  console.log(`[DriveInit] Starting init for ${key}`);
  setDriveInitProgress(key, 'starting', 'Preparing your par Noir storage…', 0);
  const promise = runner()
    .then((result) => {
      console.log(`[DriveInit] Completed init for ${key}`);
      setDriveInitProgress(key, 'complete', 'Storage ready', 100);
      scheduleSettledProgressClear(key, 'complete');
      return result;
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setDriveInitProgress(key, 'failed', msg.slice(0, 200), 0);
      console.warn(`[DriveInit] Failed init for ${key}:`, msg);
      scheduleSettledProgressClear(key, 'failed');
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
      // Do not clear progress here — status polls need complete/failed.
    });
  inflight.set(key, promise);
  return promise;
}
