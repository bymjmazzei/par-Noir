/**
 * L5 integrator permission manifest — declared at registration, shown at OAuth consent.
 */

export type PermissionManifestItemType = 'scope' | 'data_point' | 'storage' | 'indexing';

export interface PermissionManifestItem {
  id: string;
  type: PermissionManifestItemType;
  label: string;
  rationale: string;
  required?: boolean;
}

export interface IntegratorPermissionManifest {
  items: PermissionManifestItem[];
}

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Access your public profile information',
  'cloud:app': 'Store app data in your dedicated integrator folder',
  'cloud:read': 'Read files from your pN cloud (first-party only)'
};

export function defaultLabelForScope(scope: string): string {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope];
  if (scope.startsWith('zkp:') || scope.startsWith('data_point:')) {
    return `Access verified data: ${scope.replace(/^(zkp:|data_point:)/, '')}`;
  }
  return scope;
}

/** Build manifest items from scopes when developer did not supply a full manifest. */
export function manifestFromScopes(scopes: string[]): IntegratorPermissionManifest {
  const items: PermissionManifestItem[] = [];
  for (const scope of scopes) {
    if (!scope?.trim()) continue;
    const id = scope.trim();
    items.push({
      id,
      type: id === 'cloud:app' ? 'storage' : id.startsWith('zkp:') || id.startsWith('data_point:') ? 'data_point' : 'scope',
      label: defaultLabelForScope(id),
      rationale: '',
      required: id === 'openid'
    });
  }
  return { items };
}

export function normalizePermissionManifest(
  raw: unknown,
  scopes: string[] = []
): IntegratorPermissionManifest {
  if (raw && typeof raw === 'object' && Array.isArray((raw as IntegratorPermissionManifest).items)) {
    const items = (raw as IntegratorPermissionManifest).items
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => ({
        id: String(item.id).trim(),
        type: (['scope', 'data_point', 'storage', 'indexing'].includes(String(item.type))
          ? item.type
          : 'scope') as PermissionManifestItemType,
        label: String(item.label || defaultLabelForScope(item.id)).trim(),
        rationale: String(item.rationale || '').trim(),
        required: item.required === true
      }));
    if (items.length > 0) return { items };
  }
  return manifestFromScopes(scopes);
}

export function validatePermissionManifest(manifest: IntegratorPermissionManifest): string | null {
  if (!manifest.items.length) return 'permissionManifest must include at least one item';
  for (const item of manifest.items) {
    if (!item.id.trim()) return 'Each manifest item needs an id';
    if (!item.label.trim()) return `Manifest item "${item.id}" needs a label`;
    if (!item.rationale.trim()) return `Manifest item "${item.id}" needs a rationale (why users should grant it)`;
  }
  return null;
}

/** Escape HTML for consent template injection. */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** HTML blocks for oauth-consent.html {{MANIFEST_HTML}} */
export function renderManifestHtml(manifest: IntegratorPermissionManifest, clientId: string): string {
  if (!manifest.items.length) return '';
  return manifest.items
    .map((item) => {
      const why = item.rationale
        ? `<div class="permission-rationale" style="margin:4px 0 12px 16px;font-size:13px;color:#aaa;">${escHtml(item.rationale)}</div>`
        : '';
      const req = item.required ? ' <span style="color:#888;">(required)</span>' : '';
      const storageHint =
        item.id === 'cloud:app' || item.type === 'storage'
          ? `<div class="permission-rationale" style="margin:4px 0 12px 16px;font-size:12px;color:#888;">Folder: <strong>integrators/${escHtml(clientId)}/</strong> on your cloud</div>`
          : '';
      return `<div class="permission-item" style="margin-bottom:8px;">
        <div class="permission-desc" style="margin:6px 0;font-weight:500;">• ${escHtml(item.label)}${req}</div>
        ${why}${storageHint}
      </div>`;
    })
    .join('');
}
