/**
 * Falsification: feed visibility must not prefetch full comments or likers lists.
 * Tile strip uses metadata.engagement.topComments; detail loads on interaction.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

describe('lazy feed-tile engagement gate', () => {
  it('FullScreenFeed does not preload comments on visibility', () => {
    const src = readFileSync(resolve(root, 'components/FullScreenFeed.tsx'), 'utf8');
    expect(src).not.toMatch(/Preload comments for the visible file/);
    expect(src).toMatch(/engagement\?\.topComments/);
    expect(src).toMatch(/Me "comments" tab: load full comments only when that tab is active/);
  });

  it('FullScreenFeed tile comment counts come from metadata not getComments\(\)\.length', () => {
    const src = readFileSync(resolve(root, 'components/FullScreenFeed.tsx'), 'utf8');
    expect(src).not.toMatch(/getComments\([^)]+\)\.length\s*\+/);
  });

  it('FeedEngagementSidebar long-press opens LikersListModal', () => {
    const src = readFileSync(resolve(root, 'components/FeedEngagementSidebar.tsx'), 'utf8');
    expect(src).toMatch(/LikersListModal/);
    expect(src).toMatch(/LONG_PRESS_MS\s*=\s*450/);
    expect(src).toMatch(/setShowLikers\(true\)/);
  });

  it('LikersListModal fetches /likes only when mounted', () => {
    const src = readFileSync(resolve(root, 'components/LikersListModal.tsx'), 'utf8');
    expect(src).toMatch(/\/api\/engagement\/\$\{encodeURIComponent\(fileId\)\}\/likes/);
  });
});
