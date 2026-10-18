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
    expect(src).toMatch(/runFeedPenEffect/);
    expect(src).not.toMatch(/if \(!userState\.isUnlocked \|\| !userState\.pnIdentifier\) return;\s*void runFeedPenEffect/);
  });

  it('FullScreenFeed requests the hd variant first for video', () => {
    const src = readFileSync(resolve(root, 'components/FullScreenFeed.tsx'), 'utf8');
    expect(src).toMatch(/feedPlaybackVariant\(file as FeedPlaybackMetadata, 'hd'\)/);
    expect(src).toMatch(/resolvePublicFeedObjectUrl\(cfId, playbackMeta, \{ variant: 'hd' \}\)/);
    expect(src).not.toMatch(/resolvePublicMediaObjectUrl\(fileId, 'sd'\)/);
  });

  it('PenFeedTilePlayer centers a feed-layout tile in a size container', () => {
    const src = readFileSync(resolve(root, 'components/PenFeedTilePlayer.tsx'), 'utf8');
    expect(src).toMatch(/flex h-full w-full items-center justify-center/);
    expect(src).toMatch(/containerType: 'size'/);
    expect(src).toMatch(/layout="feed"/);
    expect(src).not.toMatch(/compact=/);
    expect(src).not.toMatch(/\bfill\b/);
  });

  it('buildPenCollectionFeedTileModel carries penFeedPage from member meta', () => {
    const src = readFileSync(resolve(root, 'utils/penFeedTileModel.ts'), 'utf8');
    expect(src).toMatch(/penFeedPageFromMetadata/);
  });
});
