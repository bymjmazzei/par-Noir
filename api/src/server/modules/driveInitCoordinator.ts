/**
 * One in-flight Drive layout init per pN — dedupes concurrent PUT + POST /initialize calls.
 */

import { normalizePnIdentifier } from './integratorStoragePaths';

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
  const promise = runner()
    .then((result) => {
      console.log(`[DriveInit] Completed init for ${key}`);
      return result;
    })
    .catch((err) => {
      console.warn(
        `[DriveInit] Failed init for ${key}:`,
        err instanceof Error ? err.message : err
      );
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
