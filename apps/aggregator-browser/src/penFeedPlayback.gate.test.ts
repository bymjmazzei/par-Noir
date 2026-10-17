/**
 * Gate: Pen-backed posts use shared feed-tile playback in FullScreenFeed.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

describe('pen feed playback gate', () => {
  it('FullScreenFeed branches on penDocId via isPenFeedPlaybackMetadata', () => {
    const src = readFileSync(resolve(root, 'components/FullScreenFeed.tsx'), 'utf8');
    expect(src).toMatch(/isPenFeedPlaybackMetadata/);
    expect(src).toMatch(/PenFeedTilePlayer/);
    expect(src).toMatch(/buildPenFeedTileModelForPost/);
    expect(src).toMatch(/buildPenCollectionFeedTileModel/);
    expect(src).toMatch(/!isPenFeedPost/);
  });
});
