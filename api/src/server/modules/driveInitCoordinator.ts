/**
 * One in-flight Drive layout init per pN — dedupes concurrent PUT + POST /initialize calls.
 */

import { normalizePnIdentifier } from './integratorStoragePaths';
import {
  clearDriveInitProgress,
  setDriveInitProgress,
} from './driveInitProgress';

export type DriveInitResult = { metadataFolderId: string; pnFolderId: string };

const inflight = new Map<string, Promise<DriveInitResult>>();

export function isDriveInitInFlight(pnIdentifier: string): boolean {
  return inflight.has(normalizePnIdentifier(pnIdentifier));
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
      return result;
    })
    .catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setDriveInitProgress(key, 'failed', msg.slice(0, 200), 0);
      console.warn(`[DriveInit] Failed init for ${key}:`, msg);
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
      clearDriveInitProgress(key);
    });
  inflight.set(key, promise);
  return promise;
}
