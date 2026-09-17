/**
 * @jest-environment jsdom
 *
 * Gate: dashboard make-public uses fileType-aware feed previews and split error messages.
 */
import fs from 'fs';
import path from 'path';

describe('dashboard upload visibility policy gates', () => {
  const servicesDir = path.join(__dirname, '..', 'services');
  const componentsDir = path.join(__dirname, '..', 'components');

  it('togglePublicVisibility splits share vs feed-preview errors', () => {
    const src = fs.readFileSync(
      path.join(componentsDir, 'storage/hooks/share/togglePublicVisibility.ts'),
      'utf8'
    );
    expect(src).toContain('publishFeedPreviewsForDashboardMakePublic');
    expect(src).toContain('Failed to publish share material:');
    expect(src).toContain('Failed to publish feed preview:');
    expect(src).not.toContain('Failed to generate share token');
  });

  it('dashboard make-public helper is fileType-aware', () => {
    const src = fs.readFileSync(path.join(servicesDir, 'feedPreviewMakePublic.ts'), 'utf8');
    expect(src).toContain("ft === 'thought-thumbnail'");
    expect(src).toContain("ft === 'collection'");
    expect(src).toContain('wantsCollectionCover');
    expect(src).toContain('collectionFileIds');
  });

  it('edit metadata modal uses Caption wording', () => {
    const src = fs.readFileSync(
      path.join(componentsDir, 'storage/FileStorageEditMetadataModal.tsx'),
      'utf8'
    );
    expect(src).toContain('Caption');
    expect(src).not.toMatch(/>\s*Description\s*</);
  });
});
