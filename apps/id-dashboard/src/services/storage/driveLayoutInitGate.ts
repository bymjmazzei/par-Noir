/**
 * Module gate: Drive layout POST /initialize is in flight.
 * Owned-assets and similar Drive-backed probes must not fire mid-init (409 noise).
 */

let activeCount = 0;

export function beginDriveLayoutInit(): void {
  activeCount += 1;
}

export function endDriveLayoutInit(): void {
  activeCount = Math.max(0, activeCount - 1);
}

export function isDriveLayoutInitActive(): boolean {
  return activeCount > 0;
}

/** Test-only: clear leftover count across parallel suites. */
export function resetDriveLayoutInitGate(): void {
  activeCount = 0;
}
