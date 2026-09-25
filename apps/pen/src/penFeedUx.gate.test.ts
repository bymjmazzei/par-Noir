/**
 * Gate: shared PenNotebookPage chrome for Library + Templates.
 * Falsifies: dual page chrome; unstable snap windowing; display-only aside;
 * red rail covering footer; divergent rails; /templates not using shared notebook.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { buildTemplateFileIdMap } from './services/templateEngagementFileId';
import { libraryDocMatchesRailSelection } from './services/classFeedRailItems';

const root = resolve(__dirname);

describe('pen feed UX chrome', () => {
  it('CSS pins class rail, sticky shell, footer above red', () => {
    const css = readFileSync(resolve(root, 'index.css'), 'utf8');
    expect(css).toMatch(/\.pen-doc-feed-rail\b/);
    expect(css).not.toMatch(/\.pen-doc-feed-rail-fixed/);
    expect(css).toMatch(/\.pen-library-page\.pen-feed-mode/);
    expect(css).toMatch(/scroll-snap-type:\s*y mandatory/);
    expect(css).not.toMatch(/^\s*scroll-behavior:\s*smooth/m);
    expect(css).toMatch(/\.pen-class-feed-rail-tab\.is-active[\s\S]*?color:\s*#000/);
    expect(css).toMatch(/\.pen-class-feed-rail-tab\s*\{[\s\S]*?color:\s*#a3a3a3/);
    expect(css).not.toMatch(
      /\.pen-library-page\.pen-feed-mode\s+\.pen-library-footer\s*\{[^}]*display:\s*none/
    );
    expect(css).toMatch(
      /\.pen-library-page\.pen-feed-mode\s+\.pen-doc-feed\s*\{[\s\S]*?repeating-linear-gradient/
    );
    expect(css).toMatch(/\.pen-doc-feed-rail\s*\{[^}]*background:\s*#fff/);
    // Red margin above sheet; footer covers red at bottom
    expect(css).toMatch(/\.pen-explorer-rail\s*\{[^}]*z-index:\s*40/);
    expect(css).toMatch(/\.pen-library-footer\s*\{[\s\S]*?z-index:\s*50/);
    expect(css).toMatch(/\.pen-library-page\s*\{[\s\S]*?height:\s*calc\(100dvh - 2\.5rem\)/);
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

  it('Library and Templates share Social rail; Library keeps trash; no double gallery head', () => {
    const list = readFileSync(resolve(root, 'pages/DocListPage.tsx'), 'utf8');
    const feed = readFileSync(resolve(root, 'components/DocFeedScroller.tsx'), 'utf8');
    expect(list).toMatch(/MinusIcon/);
    expect(list).toMatch(/toggleBulkMode/);
    expect(list).toMatch(/buildSocialTemplateRailItems/);
    expect(list).toMatch(/libraryDocMatchesRailSelection/);
    expect(list).not.toMatch(/pen-gallery-head/);
    expect(list).not.toMatch(/buildClassFeedRailItems/);
    expect(feed).toMatch(/buildSocialTemplateRailItems/);
    expect(feed).toMatch(/PenFeedSlideStage/);
    expect(feed).toMatch(/SnapFeedShell/);
    expect(feed).toMatch(/publishedFileId/);
  });

  it('Templates feed merges public fileIds; slide stage has live aside + overlay split', () => {
    const scroller = readFileSync(resolve(root, 'components/TemplatesFeedScroller.tsx'), 'utf8');
    const browse = readFileSync(resolve(root, 'components/TemplatesBrowse.tsx'), 'utf8');
    const stage = readFileSync(resolve(root, 'components/PenFeedSlideStage.tsx'), 'utf8');
    expect(browse).toMatch(/fetchPublicPenTemplates/);
    expect(browse).toMatch(/buildTemplateFileIdMap/);
    expect(scroller).toMatch(/PenFeedSlideStage/);
    expect(scroller).toMatch(/fileIdByTemplateId/);
    expect(scroller).toMatch(/pen-templates-feed-build/);
    expect(scroller).toMatch(/Build/);
    expect(scroller).toMatch(/slideKeys/);
    expect(stage).toMatch(/placement="overlay"/);
    expect(stage).toMatch(/placement="aside"/);
    expect(stage).toMatch(/hideEngagementRail/);
    expect(stage).toMatch(/engagementOverlay/);
  });

  it('TemplateEngagementRail wires live mutations on aside when fileId present', () => {
    const src = readFileSync(resolve(root, 'components/TemplateEngagementRail.tsx'), 'utf8');
    expect(src).toMatch(/pen-template-engagement-creator|pen-template-engagement-avatar/);
    expect(src).toMatch(/USES/);
    expect(src).toMatch(/getTemplateUseCount/);
    expect(src).toMatch(/toggleLikePublic/);
    expect(src).toMatch(/recordSharePublic/);
    expect(src).toMatch(/placement === 'overlay'/);
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

  it('SnapFeedShell always renders slides and pins height from ResizeObserver', () => {
    const src = readFileSync(resolve(root, 'components/SnapFeedShell.tsx'), 'utf8');
    expect(src).toMatch(/IntersectionObserver/);
    expect(src).toMatch(/ResizeObserver/);
    expect(src).toMatch(/slidePx/);
    expect(src).not.toMatch(/Math\.round\(el\.scrollTop/);
    expect(src).not.toMatch(/inWindow\s*\?/);
    expect(src).not.toMatch(/windowStart|windowEnd/);
    expect(src).toMatch(/renderSlide\(i,\s*i === activeIndex\)/);
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

describe('template engagement fileId map', () => {
  it('maps templateId / basedOnTemplateId / penDocId to fileId', () => {
    const map = buildTemplateFileIdMap([
      {
        fileId: 'cdn-1',
        submittedAt: '',
        metadata: {
          fileId: 'cdn-1',
          backend: 'r2',
          backendFileId: 'cdn-1',
          uploadDate: '',
          fileType: 'image/jpeg',
          isPublic: true,
          templateId: 'note.basic.portrait.v1'
        } as never
      },
      {
        fileId: 'cdn-2',
        submittedAt: '',
        metadata: {
          fileId: 'cdn-2',
          backend: 'r2',
          backendFileId: 'cdn-2',
          uploadDate: '',
          fileType: 'image/jpeg',
          isPublic: true,
          basedOnTemplateId: 'social.post.portrait.v1',
          penDocId: 'doc-xyz'
        } as never
      }
    ]);
    expect(map.get('note.basic.portrait.v1')).toBe('cdn-1');
    expect(map.get('social.post.portrait.v1')).toBe('cdn-2');
    expect(map.get('doc-xyz')).toBe('cdn-2');
  });
});

describe('libraryDocMatchesRailSelection', () => {
  it('ALL shows every doc; chips filter Social/Projects', () => {
    expect(libraryDocMatchesRailSelection('library.book', 'all')).toBe(true);
    expect(libraryDocMatchesRailSelection('social.note', 'all')).toBe(true);
    expect(libraryDocMatchesRailSelection('social.note', 'social.note')).toBe(true);
    expect(libraryDocMatchesRailSelection('library.book', 'social.note')).toBe(false);
    expect(libraryDocMatchesRailSelection('projects.journal', 'projects')).toBe(true);
  });
});
