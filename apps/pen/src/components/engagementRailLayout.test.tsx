import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ENGAGEMENT_RAIL_GAP_PX,
  ENGAGEMENT_RAIL_ICON_PX,
  engagementRailLayout
} from '@par-noir/feed-tile';
import { PenPhoneBrowseChrome } from './PenPhoneBrowseChrome';

describe('engagementRailLayout', () => {
  it('keeps a tall frame at the compact size under the midpoint', () => {
    const frame = 900;
    const layout = engagementRailLayout(frame);
    expect(layout.iconPx).toBe(ENGAGEMENT_RAIL_ICON_PX);
    expect(layout.gapPx).toBe(ENGAGEMENT_RAIL_GAP_PX);
    expect(layout.stackPx + layout.bottomPx).toBeLessThanOrEqual(frame / 2);
  });

  it('shrinks a short frame so the stack and offset stay at the midpoint', () => {
    const frame = 220;
    const layout = engagementRailLayout(frame);
    expect(layout.iconPx).toBeLessThan(ENGAGEMENT_RAIL_ICON_PX);
    expect(layout.gapPx).toBeLessThan(ENGAGEMENT_RAIL_GAP_PX);
    expect(layout.iconPx / ENGAGEMENT_RAIL_ICON_PX).toBeCloseTo(layout.gapPx / ENGAGEMENT_RAIL_GAP_PX);
    expect(layout.stackPx + layout.bottomPx).toBeLessThanOrEqual(frame / 2 + 0.01);
  });

  it('uses one size for the profile circle and the action icons', () => {
    const layout = engagementRailLayout(800);
    expect(layout.iconPx).toBe(ENGAGEMENT_RAIL_ICON_PX);
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
