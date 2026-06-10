/**
 * Platform operator allowlist — same pattern as prismAdminService (PRISM_ADMIN_PN_IDS).
 * Operators may approve OAuth applications and issue commercial licenses via developer portal.
 */

function normalizePnId(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function getOperatorIds(): string[] {
  const raw = process.env.PLATFORM_OPERATOR_PN_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function getPlatformRegistryPnIdentifier(): string | null {
  const raw = process.env.PLATFORM_REGISTRY_PN_IDENTIFIER?.trim();
  if (!raw) return null;
  return normalizePnId(raw);
}

export function isPlatformOperator(pnIdentifier: string | undefined): boolean {
  if (!pnIdentifier) return false;
  const normalized = normalizePnId(pnIdentifier);
  return getOperatorIds().some((id) => normalizePnId(id) === normalized);
}

export function isPlatformRegistryConfigured(): boolean {
  return getPlatformRegistryPnIdentifier() != null && getOperatorIds().length > 0;
}
