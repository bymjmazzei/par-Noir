/**
 * Session memo for owner-index probes that cannot succeed (403 policy / 409 incomplete
 * under device custody). Avoids repeat GET /api/storage/owner-index noise in the
 * browser console once we already know the server index is unavailable.
 */

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

const unavailableThisSession = new Set<string>();

export function isOwnerIndexUnavailable(pnIdentifier: string): boolean {
  return unavailableThisSession.has(normalizePn(pnIdentifier));
}

export function markOwnerIndexUnavailable(pnIdentifier: string): void {
  unavailableThisSession.add(normalizePn(pnIdentifier));
}

/** Clear after a successful Drive layout rebuild so we can probe the API again. */
export function clearOwnerIndexUnavailable(pnIdentifier?: string): void {
  if (pnIdentifier) {
    unavailableThisSession.delete(normalizePn(pnIdentifier));
    return;
  }
  unavailableThisSession.clear();
}
