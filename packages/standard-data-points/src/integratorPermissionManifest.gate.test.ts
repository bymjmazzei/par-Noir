/**
 * Falsification: consent could show scopes without developer rationale if validation
 * or renderManifestHtml skipped the rationale field.
 */
import { describe, expect, it } from 'vitest';
import {
  renderManifestHtml,
  validatePermissionManifest,
  type IntegratorPermissionManifest
} from './integratorPermissionManifest';

describe('integratorPermissionManifest gate', () => {
  it('validatePermissionManifest fails when rationale missing', () => {
    const manifest: IntegratorPermissionManifest = {
      items: [
        {
          id: 'openid',
          type: 'scope',
          label: 'Verify your identity',
          rationale: '',
          required: true
        }
      ]
    };
    expect(validatePermissionManifest(manifest)).toBe(
      'Manifest item "openid" needs a rationale (why users should grant it)'
    );
  });

  it('renderManifestHtml includes rationale text', () => {
    const manifest: IntegratorPermissionManifest = {
      items: [
        {
          id: 'cloud:app',
          type: 'storage',
          label: 'Store app data in your silo',
          rationale: 'We need a folder to save your drafts offline.'
        }
      ]
    };
    const html = renderManifestHtml(manifest, 'my-app');
    expect(html).toContain('We need a folder to save your drafts offline.');
    expect(html).toContain('integrators/my-app/');
  });
});
