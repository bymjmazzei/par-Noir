/**
 * Gate: feed videos loop gaplessly, pause on tap, and share one feed-wide mute.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const feed = readFileSync(resolve(root, 'components/FullScreenFeed.tsx'), 'utf8');
const companion = readFileSync(resolve(root, 'components/CompanionAudioMix.tsx'), 'utf8');

describe('feed video controls gate', () => {
  it('plays feed video through FeedLoopVideo, never a native loop', () => {
    expect(feed).toMatch(/<FeedLoopVideo/);
    expect(feed).not.toMatch(/<video\b/);
    expect(feed).not.toMatch(/\bloop\b\s*\n/);
  });

  it('wires feed-wide mute, tap-to-pause, and loop restarts', () => {
    expect(feed).toMatch(/const \[feedMuted, setFeedMuted\] = useState\(true\)/);
    expect(feed).toMatch(/<FeedMuteButton muted=\{feedMuted\}/);
    expect(feed).toMatch(/useTapToggle\(/);
    expect(feed).toMatch(/<FeedPausedGlyph/);
    expect(feed).toMatch(/loopEpoch=\{loopEpoch\}/);
  });

  it('companion audio follows play, mute, and loop', () => {
    expect(companion).toMatch(/playing = true/);
    expect(companion).toMatch(/el\.muted = muted/);
    expect(companion).toMatch(/clock\.epoch !== loopEpoch/);
  });
});
