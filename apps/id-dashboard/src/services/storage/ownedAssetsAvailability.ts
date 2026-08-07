/**
 * Session memo for owned-assets probes that cannot succeed (409 cloud_token /
 * Drive not ready under device custody). Keep-alive mounts Sub-pN + Delegation
 * at unlock; without this, each remount/READY re-hits GET /api/owned-assets and
 * floods the console with red 409s.
 */

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

const unavailableThisSession = new Set<string>();

export function isOwnedAssetsUnavailable(pnIdentifier: string): boolean {
  return unavailableThisSession.has(normalizePn(pnIdentifier));
}

export function markOwnedAssetsUnavailable(pnIdentifier: string): void {
  unavailableThisSession.add(normalizePn(pnIdentifier));
}

/** Clear after reconnect / force refresh / lock so we can probe again. */
export function clearOwnedAssetsUnavailable(pnIdentifier?: string): void {
  if (pnIdentifier) {
    unavailableThisSession.delete(normalizePn(pnIdentifier));
    return;
  }
  unavailableThisSession.clear();
}
