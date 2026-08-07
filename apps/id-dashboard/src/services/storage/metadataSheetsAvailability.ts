/**
 * Session memo for metadata-sheet probes (zkp-data-points, third-party-permissions)
 * that return 409/401 while Drive layout/index is incomplete.
 *
 * Unlock fires PN_CLOUD_CREDENTIALS_READY when local secrets warm — before Storage
 * has finished initialize. Without this memo, App re-probes on every READY and
 * storms red 409s in the console.
 */

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

const unavailableThisSession = new Set<string>();

export function isMetadataSheetsUnavailable(pnIdentifier: string): boolean {
  return unavailableThisSession.has(normalizePn(pnIdentifier));
}

export function markMetadataSheetsUnavailable(pnIdentifier: string): void {
  unavailableThisSession.add(normalizePn(pnIdentifier));
}

/** Clear after a successful Drive layout init so privacy/ZKP can probe again. */
export function clearMetadataSheetsUnavailable(pnIdentifier?: string): void {
  if (pnIdentifier) {
    unavailableThisSession.delete(normalizePn(pnIdentifier));
    return;
  }
  unavailableThisSession.clear();
}
