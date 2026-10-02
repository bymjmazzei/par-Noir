import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { engagementRailLayout } from '@par-noir/feed-tile';
import { PenPhoneBrowseChrome } from './PenPhoneBrowseChrome';

describe('engagementRailLayout', () => {
  it('fills the lower half of a tall frame, with icons and gaps scaling together', () => {
    const frame = 900;
    const layout = engagementRailLayout(frame);
    expect(layout.stackPx + layout.bottomPx).toBeCloseTo(frame / 2, 0);
    expect(layout.iconPx).toBeGreaterThan(40);
    const narrower = engagementRailLayout(600);
    expect(narrower.iconPx).toBeLessThan(layout.iconPx);
    expect(narrower.gapPx / narrower.iconPx).toBeCloseTo(layout.gapPx / layout.iconPx);
    expect(narrower.stackPx + narrower.bottomPx).toBeCloseTo(300, 0);
  });

  it('a short frame stays on the midpoint with smaller icons, not looser gaps', () => {
    const frame = 320;
    const layout = engagementRailLayout(frame);
    const tall = engagementRailLayout(900);
    expect(layout.stackPx + layout.bottomPx).toBeCloseTo(frame / 2, 0);
    expect(layout.iconPx).toBeLessThan(tall.iconPx);
    expect(layout.gapPx / layout.iconPx).toBeCloseTo(tall.gapPx / tall.iconPx);
  });

  it('uses one size for the profile circle and the action icons', () => {
    const layout = engagementRailLayout(800);
    expect(layout.iconPx).toBeGreaterThan(0);
    expect(layout).not.toHaveProperty('avatarPx');
    const guide = readFileSync(
      resolve(__dirname, '../../../../packages/feed-tile/src/PublishedEngagementBar.tsx'),
      'utf8'
    );
    expect(guide).toMatch(/layout\.iconPx/);
    expect(guide).not.toMatch(/md:h-7|md:h-14|h-12 w-12/);
  });
});

describe('phone caption chrome', () => {
  it('renders mock title and caption outside the compose root', () => {
    const html = renderToStaticMarkup(<PenPhoneBrowseChrome />);
    expect(html).toContain('Morning light');
    expect(html).toContain('A quiet frame from the feed, the way it will read once this post is live.');
    expect(html).toContain('data-pen-phone-caption');

    const tile = readFileSync(
      resolve(__dirname, '../../../../packages/feed-tile/src/FeedTileSurface.tsx'),
      'utf8'
    );
    expect(tile).toContain('data-pen-compose-export-root');
    expect(tile).not.toContain('pen-phone-caption');

    const phone = readFileSync(resolve(__dirname, 'SocialPhoneFrame.tsx'), 'utf8');
    const poster = phone.indexOf('pen-feed-phone-poster');
    const chrome = phone.indexOf('pen-feed-phone-chrome');
    expect(poster).toBeGreaterThan(-1);
    expect(chrome).toBeGreaterThan(poster);
  });
});
