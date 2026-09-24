/**
 * Gate: Pen feed notebook-aligned rail + public-only engagement client.
 * Falsifies: fixed dark overlay rail; engagement used for library docs;
 * public CDN feed missing reachable /templates route.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);

describe('pen feed UX chrome', () => {
  it('CSS pins class rail on first blue line (notebook geometry)', () => {
    const css = readFileSync(resolve(root, 'index.css'), 'utf8');
    expect(css).toMatch(/\.pen-doc-feed-rail\b/);
    expect(css).not.toMatch(/\.pen-doc-feed-rail-fixed/);
    expect(css).toMatch(/\.pen-library-page\.pen-feed-mode/);
    expect(css).toMatch(/scroll-snap-type:\s*y mandatory/);
    expect(css).toMatch(/\.pen-class-feed-rail-tab\.is-active[\s\S]*?color:\s*#000/);
    expect(css).toMatch(/\.pen-class-feed-rail-tab\s*\{[\s\S]*?color:\s*#a3a3a3/);
  });

  it('DocFeedScroller never imports engagement client', () => {
    const src = readFileSync(resolve(root, 'components/DocFeedScroller.tsx'), 'utf8');
    expect(src).not.toMatch(/penEngagementClient|TemplateEngagementRail/);
    expect(src).toMatch(/SocialPhoneFrame/);
    expect(src).toMatch(/SnapFeedShell/);
  });

  it('TemplatesCdnFeedScroller wires live engagement for CDN rows only', () => {
    const src = readFileSync(resolve(root, 'components/TemplatesCdnFeedScroller.tsx'), 'utf8');
    expect(src).toMatch(/TemplateEngagementRail/);
    expect(src).toMatch(/entry\.fileId/);
    expect(src).toMatch(/hideEngagementRail/);
    expect(src).toMatch(/pen-doc-feed-slide-stage/);
    expect(src).toMatch(/listConsumerStarterTemplates/);
    expect(src).toMatch(/kind: 'platform'/);
  });

  it('public templates feed is routed at /templates', () => {
    const app = readFileSync(resolve(root, 'App.tsx'), 'utf8');
    const page = readFileSync(resolve(root, 'pages/PublicTemplatesFeedPage.tsx'), 'utf8');
    const verified = readFileSync(resolve(root, 'services/penVerified.ts'), 'utf8');
    expect(app).toMatch(/path="\/templates"/);
    expect(app).toMatch(/PublicTemplatesFeedPage/);
    expect(app).toMatch(/ensurePlatformTemplateRoots/);
    expect(page).toMatch(/TemplatesCdnFeedScroller/);
    expect(verified).toMatch(/VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST/);
  });
});
