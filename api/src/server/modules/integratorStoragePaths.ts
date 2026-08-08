/**
 * Canonical paths and client classification for L5 integrator Drive silos.
 */

export const INTEGRATORS_ROOT = 'integrators';

const FIRST_PARTY_CLIENT_IDS = new Set([
  'browser-app',
  'messaging-app',
  'prism-app',
  'developer-portal'
]);

/** OAuth scope: read/write only under integrators/{client_id}/ */
export const SCOPE_CLOUD_APP = 'cloud:app';

export function normalizePnIdentifier(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

export function pnFolderDisplayName(pnIdentifier: string): string {
  return `par Noir - ${normalizePnIdentifier(pnIdentifier)}`;
}

export function getDeveloperPortalClientId(): string {
  return (process.env.DEVELOPER_PORTAL_CLIENT_ID || 'developer-portal').trim();
}

export function isFirstPartyClient(clientId: string | undefined | null): boolean {
  if (!clientId) return false;
  if (FIRST_PARTY_CLIENT_IDS.has(clientId)) return true;
  if (clientId === getDeveloperPortalClientId()) return true;
  return false;
}

/** Sanitize OAuth client_id for use as a Google Drive folder name segment. */
export function integratorFolderName(clientId: string): string {
  const trimmed = clientId.trim();
  if (!trimmed) {
    throw new Error('client_id is required');
  }
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!sanitized || sanitized.length > 128) {
    throw new Error('client_id is not valid for integrator folder naming');
  }
  if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
    throw new Error('client_id is not valid for integrator folder naming');
  }
  return sanitized;
}

export function integratorPathLabel(clientId: string): string {
  return `${INTEGRATORS_ROOT}/${integratorFolderName(clientId)}`;
}

export function scopesIncludeCloudApp(scopes: string[] | undefined): boolean {
  if (!scopes?.length) return false;
  return scopes.includes(SCOPE_CLOUD_APP);
}

export function dataPointIdsFromScopes(scopes: string[]): string[] {
  return scopes
    .filter((s) => s.startsWith('zkp:') || s.startsWith('data_point:'))
    .map((s) => s.replace(/^(zkp:|data_point:)/, ''));
}
