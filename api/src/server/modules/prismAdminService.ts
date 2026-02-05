/**
 * Prism Admin Service
 * Admin allowlist via PRISM_ADMIN_PN_IDS env var (comma-separated)
 * Bootstrap mode via PRISM_BOOTSTRAP_MODE=true
 */

function getAdminIds(): string[] {
  const raw = process.env.PRISM_ADMIN_PN_IDS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isPrismAdmin(pnIdentifier: string | undefined): boolean {
  if (!pnIdentifier) return false;
  const ids = getAdminIds();
  const normalized = pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
  return ids.some((id) => {
    const adminNorm = id.startsWith('pn-') ? id : `pn-${id}`;
    return adminNorm === normalized;
  });
}

export function isBootstrapMode(): boolean {
  return process.env.PRISM_BOOTSTRAP_MODE === 'true';
}
