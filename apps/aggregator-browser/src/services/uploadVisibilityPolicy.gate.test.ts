/**
 * Gate: browser media enqueue defaults public; collection + make-public publish CDN previews;
 * feed-preview failures must not be wrapped as share-token errors.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, rel), 'utf8');
}

describe('upload visibility policy gates', () => {
  it('FileStorageAggregator media enqueue defaults isPublic true', () => {
    const src = read('../components/FileStorageAggregator.tsx');
    expect(src).toMatch(/isPublic:\s*true/);
    expect(src).not.toMatch(/addUploadTask[\s\S]*?isPublic:\s*false/);
    // Pre-upload title/caption modal
    expect(src).toContain('pendingMediaUpload');
    expect(src).toContain('title="Upload"');
  });

  it('collectionService publishes feed previews when public', () => {
    const src = read('./collectionService.ts');
    expect(src).toContain('publishFeedPreviewsForPublicVisual');
    expect(src).toContain('...feedPreviewFields');
    expect(src).toContain('Failed to publish feed preview:');
    expect(src).toContain('Failed to publish share material:');
    expect(src).not.toContain('Failed to generate share token');
  });

  it('make-public uses fileType-aware feed preview helper and split errors', () => {
    const src = read('./backgroundTaskProcessor.ts');
    expect(src).toContain('publishFeedPreviewsForPublicVisual');
    expect(src).toContain('Failed to publish share material:');
    expect(src).toContain('Failed to publish feed preview:');
    expect(src).not.toContain('Failed to generate share token');
    // Must not only gate on image/video MIME for previews
    const makePublicSlice = src.slice(
      src.indexOf('if (makePublic)'),
      src.indexOf('} else if (makePublic !== isCurrentlyPublic)')
    );
    expect(makePublicSlice).toContain('publishFeedPreviewsForPublicVisual');
    expect(makePublicSlice).not.toMatch(/if\s*\(\s*mime\.startsWith\('image\/'\)/);
  });

  it('feedPreviewMakePublic handles collections and thought fileTypes', () => {
    const src = read('./feedPreviewMakePublic.ts');
    expect(src).toContain("ft === 'thought-thumbnail'");
    expect(src).toContain("ft === 'thought-collection'");
    expect(src).toContain("ft === 'collection'");
    expect(src).toContain('wantsCollectionCover');
    expect(src).toContain('collectionFileIds');
    expect(src).toContain('publishFeedPreviews(');
  });
});
