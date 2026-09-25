/**
 * Gate: shared PenNotebookPage chrome for Library + Templates.
 * Falsifies: dual page chrome; TemplatesBrowse owning density/footer;
 * red rail under feed paper; /templates not using shared notebook.
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
    expect(css).not.toMatch(
      /\.pen-library-page\.pen-feed-mode\s+\.pen-library-footer\s*\{[^}]*display:\s*none/
    );
    expect(css).toMatch(
      /\.pen-library-page\.pen-feed-mode\s+\.pen-doc-feed\s*\{[\s\S]*?repeating-linear-gradient/
    );
    // Red margin rail must paint above sheet / feed paper
    expect(css).toMatch(/\.pen-explorer-rail\s*\{[^}]*z-index:\s*40/);
  });

  it('PenNotebookPage is the single unlocked notebook chrome', () => {
    const notebook = readFileSync(resolve(root, 'components/PenNotebookPage.tsx'), 'utf8');
    const list = readFileSync(resolve(root, 'pages/DocListPage.tsx'), 'utf8');
    const app = readFileSync(resolve(root, 'App.tsx'), 'utf8');
    const templates = readFileSync(resolve(root, 'components/TemplatesBrowse.tsx'), 'utf8');
    expect(notebook).toMatch(/pen-library-page/);
    expect(notebook).toMatch(/pen-explorer-rail/);
    expect(notebook).toMatch(/PenBrandingFooter/);
    expect(notebook).toMatch(/Browse density/);
    expect(list).toMatch(/PenNotebookPage/);
    expect(app).toMatch(/PenNotebookPage/);
    expect(app).toMatch(/path="\/templates"/);
    expect(list).toMatch(/navigate\(['"]\/templates['"]\)/);
    // Templates body must not own a second page chrome
    expect(templates).not.toMatch(/pen-library-page/);
    expect(templates).not.toMatch(/PenBrandingFooter/);
    expect(templates).not.toMatch(/PenNotebookPage/);
    expect(templates).not.toMatch(/aria-label="Browse density"/);
    expect(templates).not.toMatch(/onDensity/);
  });

  it('shared branding footer is used outside the editor', () => {
    const footer = readFileSync(resolve(root, 'components/PenBrandingFooter.tsx'), 'utf8');
    const locked = readFileSync(resolve(root, 'components/PenLockedLanding.tsx'), 'utf8');
    const notebook = readFileSync(resolve(root, 'components/PenNotebookPage.tsx'), 'utf8');
    expect(footer).toMatch(/Par-Noir-Pen\.png/);
    expect(footer).toMatch(/pen-library-footer-logo/);
    expect(locked).toMatch(/PenBrandingFooter/);
    expect(notebook).toMatch(/PenBrandingFooter/);
  });

  it('DocListPage keeps trash; DocFeedScroller never imports engagement', () => {
    const list = readFileSync(resolve(root, 'pages/DocListPage.tsx'), 'utf8');
    const src = readFileSync(resolve(root, 'components/DocFeedScroller.tsx'), 'utf8');
    expect(list).toMatch(/MinusIcon/);
    expect(list).toMatch(/toggleBulkMode/);
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

  it('TemplatesBrowse is catalog body with Social rail and modal Build', () => {
    const src = readFileSync(resolve(root, 'components/TemplatesBrowse.tsx'), 'utf8');
    expect(src).toMatch(/buildSocialTemplateRailItems/);
    expect(src).toMatch(/TemplatesFeedScroller/);
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
