/**
 * Gate: Pen feed fixed-rail CSS + public-only engagement client.
 * Falsifies: sticky-only rail; engagement used for library docs.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);

describe('pen feed UX chrome', () => {
  it('CSS pins class rail fixed under feed-mode heading', () => {
    const css = readFileSync(resolve(root, 'index.css'), 'utf8');
    expect(css).toMatch(/\.pen-doc-feed-rail-fixed/);
    expect(css).toMatch(/position:\s*fixed/);
    expect(css).toMatch(/\.pen-library-page\.pen-feed-mode/);
    expect(css).toMatch(/scroll-snap-type:\s*y mandatory/);
  });

  it('DocFeedScroller never imports engagement client', () => {
    const src = readFileSync(resolve(root, 'components/DocFeedScroller.tsx'), 'utf8');
    expect(src).not.toMatch(/penEngagementClient|TemplateEngagementRail/);
    expect(src).toMatch(/SocialPhoneFrame/);
    expect(src).toMatch(/SnapFeedShell/);
  });

  it('TemplatesCdnFeedScroller wires live engagement for public fileId', () => {
    const src = readFileSync(resolve(root, 'components/TemplatesCdnFeedScroller.tsx'), 'utf8');
    expect(src).toMatch(/TemplateEngagementRail/);
    expect(src).toMatch(/entry\.fileId/);
    expect(src).toMatch(/hideEngagementRail/);
  });
});
