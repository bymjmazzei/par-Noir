/**
 * Shared gate for loadFiles / loadStorageQuota while POST /storage/initialize runs.
 * Only *active* setup progress blocks (same rule as showDriveSetupProgress).
 */
import type { DriveSetupProgress } from '../FileStorageAggregatorTypes';

export const DRIVE_LAYOUT_WAIT_INTERVAL_MS = 500;
/** Cold Drive init can take several minutes; wait at least this long before loading anyway. */
export const DRIVE_LAYOUT_WAIT_MAX_MS = 10 * 60 * 1000;
/** Hard cap so "Loading files…" cannot spin forever on a hung Google/API call. */
export const LOAD_FILES_TIMEOUT_MS = 90_000;

export function isActiveDriveSetupProgress(
  progress: DriveSetupProgress | null | undefined
): boolean {
  if (!progress) return false;
  return progress.phase !== 'complete' && progress.phase !== 'failed';
}

export function isDriveLayoutBusy(
  inFlight: Set<string>,
  progress: DriveSetupProgress | null | undefined
): boolean {
  return inFlight.size > 0 || isActiveDriveSetupProgress(progress);
}

export async function waitForDriveLayoutIdle(
  isBusy: () => boolean,
  options?: { intervalMs?: number; maxWaitMs?: number }
): Promise<'ready' | 'timeout'> {
  const intervalMs = options?.intervalMs ?? DRIVE_LAYOUT_WAIT_INTERVAL_MS;
  const maxWaitMs = options?.maxWaitMs ?? DRIVE_LAYOUT_WAIT_MAX_MS;
  if (!isBusy()) return 'ready';
  const start = Date.now();
  while (isBusy()) {
    if (Date.now() - start >= maxWaitMs) return 'timeout';
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
  return 'ready';
}
