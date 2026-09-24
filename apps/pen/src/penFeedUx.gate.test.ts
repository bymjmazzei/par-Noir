/**
 * Gate: Pen feed notebook-aligned rail + templates feed as catalog density.
 * Falsifies: fixed dark overlay rail; engagement used for library docs;
 * /templates not routing to TemplatesBrowse; missing USES / creator / Build.
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

  it('TemplatesFeedScroller is view-only IR feed with Build and USES rail', () => {
    const src = readFileSync(resolve(root, 'components/TemplatesFeedScroller.tsx'), 'utf8');
    expect(src).toMatch(/TemplateEngagementRail/);
    expect(src).toMatch(/readOnly/);
    expect(src).toMatch(/hideEngagementRail/);
    expect(src).toMatch(/pen-templates-feed-build/);
    expect(src).toMatch(/Build/);
    expect(src).toMatch(/slideKeys/);
    expect(src).not.toMatch(/fetchPublicPenTemplates|toggleLikePublic/);
  });

  it('TemplateEngagementRail has creator avatar and USES', () => {
    const src = readFileSync(resolve(root, 'components/TemplateEngagementRail.tsx'), 'utf8');
    expect(src).toMatch(/pen-template-engagement-creator|pen-template-engagement-avatar/);
    expect(src).toMatch(/USES/);
    expect(src).toMatch(/getTemplateUseCount/);
  });

  it('TemplatesBrowse shares Social atom rail and modal Build', () => {
    const src = readFileSync(resolve(root, 'components/TemplatesBrowse.tsx'), 'utf8');
    expect(src).toMatch(/buildSocialTemplateRailItems/);
    expect(src).toMatch(/TemplatesFeedScroller/);
    expect(src).toMatch(/onDensity\('feed'\)/);
    expect(src).toMatch(/TemplateEngagementRail/);
    expect(src).toMatch(/pen-templates-gallery/);
    expect(src).not.toMatch(/navigate\(['"]\/templates['"]\)/);
    expect(src).not.toMatch(/pen-template-use-btn/);
  });

  it('SnapFeedShell uses IntersectionObserver', () => {
    const src = readFileSync(resolve(root, 'components/SnapFeedShell.tsx'), 'utf8');
    expect(src).toMatch(/IntersectionObserver/);
    expect(src).not.toMatch(/Math\.round\(el\.scrollTop/);
  });

  it('DocEditorPage social live preview uses phone + in-preview engagement overlay', () => {
    const src = readFileSync(resolve(root, 'pages/DocEditorPage.tsx'), 'utf8');
    expect(src).toMatch(/pen-social-live-preview/);
    expect(src).toMatch(/SocialPhoneFrame/);
    expect(src).toMatch(/engagementOverlay/);
    expect(src).toMatch(/placement="overlay"/);
  });

  it('public templates feed is routed at /templates via TemplatesBrowse', () => {
    const app = readFileSync(resolve(root, 'App.tsx'), 'utf8');
    const verified = readFileSync(resolve(root, 'services/penVerified.ts'), 'utf8');
    expect(app).toMatch(/path="\/templates"/);
    expect(app).toMatch(/TemplatesBrowse/);
    expect(app).not.toMatch(/PublicTemplatesFeedPage/);
    expect(app).toMatch(/ensurePlatformTemplateRoots/);
    expect(verified).toMatch(/VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST/);
  });
});
