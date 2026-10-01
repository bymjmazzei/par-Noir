import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  appendDocPage,
  defaultPagePresentation,
  defaultPageView,
  emptySection,
  SCREEN_PAGE_WIDTH_PX,
  screenStripWidthPx
} from '@par-noir/pen-protocol';
import {
  OrientationChoices,
  pageTileAxis,
  PageFinderTiles,
  PreviewOrientationMenu,
  clampPreviewZoom,
  PreviewPageBar,
  previewStripLayout,
  PreviewPageStrip,
  previewWorkspaceLayout,
  PreviewZoomControl
} from './PreviewPageBar';

describe('preview page toolbar', () => {
  it('add page appends a section and selects it', () => {
    const added = appendDocPage([emptySection('body')], ['body']);
    expect(added.slug).toBe('page-2');
    expect(added.toc).toEqual(['body', 'page-2']);
    expect(added.sections.map((section) => section.slug)).toEqual(['body', 'page-2']);
    expect(added.toc[added.toc.length - 1]).toBe(added.slug);
  });

  it('vertical is the letter default and horizontal is the social default', () => {
    expect(defaultPageView('letter')).toBe('vertical');
    expect(defaultPageView('a4')).toBe('vertical');
    expect(defaultPageView('flow')).toBe('horizontal');
  });

  it('screen width is page count times page width with a single background', () => {
    expect(screenStripWidthPx(3, SCREEN_PAGE_WIDTH_PX)).toBe(3 * SCREEN_PAGE_WIDTH_PX);
    const html = renderToStaticMarkup(
      <PreviewPageStrip
        pageView="screen"
        pageCount={3}
        pageWidthPx={SCREEN_PAGE_WIDTH_PX}
        background={{ backgroundColor: '#112233' }}
      >
        <div>one</div>
        <div>two</div>
        <div>three</div>
      </PreviewPageStrip>
    );
    expect(html).toContain(`width:${3 * SCREEN_PAGE_WIDTH_PX}px`);
    expect(html).toContain('background-color:#112233');
    expect(html.match(/data-screen-background/g)?.length).toBe(1);
    expect(html.match(/data-page-seam/g)?.length).toBe(2);
  });

  it('vertical stacks pages in a column', () => {
    const html = renderToStaticMarkup(
      <PreviewPageStrip pageView="vertical" pageCount={2}>
        <div>one</div>
        <div>two</div>
      </PreviewPageStrip>
    );
    expect(html).toContain('data-page-view="vertical"');
    expect(html).toContain('flex-col');
    expect(html).toContain('w-max');
    expect(html).toContain('items-center');
    expect(html).not.toContain('flex-row');
    expect(html).not.toContain('data-page-seam');
  });

  it('shows a page field and the active page in the corner', () => {
    const html = renderToStaticMarkup(
      <PreviewPageBar
        pages={[
          { slug: 'body', title: 'Page 1', section: emptySection('body') },
          { slug: 'page-2', title: 'Page 2', section: emptySection('page-2') }
        ]}
        activeSlug="body"
        pageView="horizontal"
        presentation={defaultPagePresentation()}
        onSelect={() => undefined}
        onAddPage={() => undefined}
        onDeletePage={() => undefined}
        onReorder={() => undefined}
        onFlip={() => undefined}
      />
    );
    expect(html).toContain('of ');
    expect(html).toContain('Page number');
    expect(html).toContain('Previous page');
    expect(html).toContain('Next page');
    expect(html).toContain('Page 1');
    expect(html).not.toContain('Page 2');
    expect(html).not.toContain('data-page-view');
    expect(pageTileAxis('vertical')).toBe('vertical');
    expect(pageTileAxis('horizontal')).toBe('horizontal');
    expect(pageTileAxis('screen')).toBe('horizontal');
  });

  it('screen page tiles sit flush with a dotted cut and no gap', () => {
    const pages = [
      { slug: 'body', title: 'Page 1', section: emptySection('body') },
      { slug: 'page-2', title: 'Page 2', section: emptySection('page-2') },
      { slug: 'page-3', title: 'Page 3', section: emptySection('page-3') }
    ];
    const screen = renderToStaticMarkup(
      <PageFinderTiles
        pageView="screen"
        pages={pages}
        activeSlug="body"
        presentation={defaultPagePresentation()}
        onDeletePage={() => undefined}
        onSelect={() => undefined}
        onDragStart={() => undefined}
        onDrop={() => undefined}
      />
    );
    expect(screen).toContain('data-page-tiles="screen"');
    expect(screen).toContain('gap-0');
    expect(screen).not.toContain('gap-1');
    expect(screen.match(/data-page-seam/g)?.length).toBe(2);
    const horizontal = renderToStaticMarkup(
      <PageFinderTiles
        pageView="horizontal"
        pages={pages}
        activeSlug="body"
        presentation={defaultPagePresentation()}
        onDeletePage={() => undefined}
        onSelect={() => undefined}
        onDragStart={() => undefined}
        onDrop={() => undefined}
      />
    );
    expect(horizontal).toContain('data-page-tiles="horizontal"');
    expect(horizontal).toContain('gap-1');
    expect(horizontal).not.toContain('data-page-seam');
  });

  it('orientation shows the active icon and keeps the choices closed', () => {
    const html = renderToStaticMarkup(
      <PreviewOrientationMenu
        pageOrientation="landscape"
        pageView="horizontal"
        onPageOrientation={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('data-page-orientation="landscape"');
    expect(html).toContain('data-page-view="horizontal"');
    expect(html).toContain('aria-label="Landscape"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Lock view');
    expect(html).not.toContain('aria-label="Portrait"');
    expect(html).not.toContain('Scroll vertically');
  });

  it('workspace zoom stays centered on the page', () => {
    expect(clampPreviewZoom(0)).toBe(0.25);
    expect(clampPreviewZoom(9)).toBe(4);
    expect(clampPreviewZoom(1.234)).toBe(1.23);
    const fitted = previewWorkspaceLayout({
      docW: 200,
      docH: 400,
      focusX: 100,
      focusY: 200,
      extents: { left: 0, right: 0, top: 0, bottom: 0 },
      zoom: 1,
      viewW: 800,
      viewH: 600
    });
    expect(fitted.contentW).toBe(800);
    expect(fitted.contentH).toBe(600);
    expect(fitted.scrollLeft).toBe(0);
    expect(fitted.scrollTop).toBe(0);
    expect(fitted.padLeft + fitted.docW / 2).toBe(400);
    const zoomed = previewWorkspaceLayout({
      docW: 200,
      docH: 400,
      focusX: 100,
      focusY: 200,
      extents: { left: 0, right: 0, top: 0, bottom: 0 },
      zoom: 2,
      viewW: 800,
      viewH: 600
    });
    expect(zoomed.docH).toBe(800);
    expect(zoomed.scrollTop).toBe(100);
    expect(zoomed.scrollTop + 300).toBe(zoomed.padTop + zoomed.overTop + zoomed.docH / 2);
    const hung = previewWorkspaceLayout({
      docW: 200,
      docH: 400,
      focusX: 100,
      focusY: 200,
      extents: { left: 500, right: 0, top: 0, bottom: 0 },
      zoom: 1,
      viewW: 800,
      viewH: 600
    });
    expect(hung.scrollLeft + 400).toBe(hung.padLeft + hung.overLeft + hung.docW / 2);
    expect(hung.scrollLeft + 400).not.toBe(hung.contentW / 2);
    expect(hung.contentW).toBe(1000);
    expect(hung.scrollLeft).toBe(200);
    const inside = previewWorkspaceLayout({
      docW: 200,
      docH: 400,
      focusX: 100,
      focusY: 200,
      extents: { left: 0, right: 40, top: 0, bottom: 0 },
      zoom: 1,
      viewW: 800,
      viewH: 600
    });
    expect(inside.contentW).toBe(800);
    expect(inside.scrollLeft).toBe(0);
    const strip = previewStripLayout({
      pageView: 'horizontal',
      pageCount: 2,
      pageW: 100,
      pageH: 200,
      activeIndex: 1,
      screenAllPages: false,
      screenFit: 1
    });
    expect(strip.docW).toBe(212);
    expect(strip.focusX).toBe(162);
    const html = renderToStaticMarkup(<PreviewZoomControl zoom={1} onZoom={() => undefined} />);
    expect(html).toContain('aria-label="Workspace zoom"');
    expect(html).toContain('data-preview-zoom');
    expect(html).not.toContain('Zoom preview');
  });

  it('a horizontal page strip centers in the pane and keeps its width', () => {
    const html = renderToStaticMarkup(
      <PreviewPageStrip pageView="horizontal" pageCount={1}>
        <div>page</div>
      </PreviewPageStrip>
    );
    expect(html).toContain('mx-auto');
    expect(html).toContain('w-max');
    expect(html).toContain('shrink-0');
  });

  it('flow vertical draws a page break between pages', () => {
    const html = renderToStaticMarkup(
      <PreviewPageStrip pageView="vertical" pageCount={2} pageBreak>
        <div>one</div>
        <div>two</div>
      </PreviewPageStrip>
    );
    expect(html.match(/data-page-break/g)?.length).toBe(1);
    expect(html).not.toContain('data-page-seam');
  });

  it('a locked orientation popup disables the other views', () => {
    const html = renderToStaticMarkup(
      <OrientationChoices
        pageOrientation="portrait"
        pageView="vertical"
        viewLocked
        onPageOrientation={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('Unlock view');
    expect(html).toContain('Orientation');
    expect(html).toContain('Scroll');
    expect(html).toMatch(/aria-label="Landscape"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Scroll horizontally"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Screen"[^>]*disabled=""/);
  });

  it('the orientation menu keeps portrait, landscape, and the three scroll views', () => {
    const html = renderToStaticMarkup(
      <OrientationChoices
        pageOrientation="portrait"
        pageView="screen"
        onPageOrientation={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('aria-label="Portrait"');
    expect(html).toContain('aria-label="Landscape"');
    expect(html).toContain('aria-label="Scroll vertically"');
    expect(html).toContain('aria-label="Scroll horizontally"');
    expect(html).toContain('aria-label="Screen"');
    expect(html).not.toContain('All pages');
  });

  it('puts view all in the footer only for screen', () => {
    const pages = [
      { slug: 'body', title: 'Page 1', section: emptySection('body') },
      { slug: 'page-2', title: 'Page 2', section: emptySection('page-2') }
    ];
    const shared = {
      pages,
      activeSlug: 'body',
      presentation: defaultPagePresentation(),
      onSelect: () => undefined,
      onAddPage: () => undefined,
      onDeletePage: () => undefined,
      onReorder: () => undefined,
      onFlip: () => undefined,
      onToggleScreenPages: () => undefined
    };
    const horizontal = renderToStaticMarkup(<PreviewPageBar {...shared} pageView="horizontal" />);
    const screen = renderToStaticMarkup(
      <PreviewPageBar {...shared} pageView="screen" screenAllPages={false} />
    );
    const all = renderToStaticMarkup(
      <PreviewPageBar {...shared} pageView="screen" screenAllPages />
    );
    expect(horizontal).not.toContain('View all');
    expect(screen).toContain('View all');
    expect(screen).not.toContain('All pages');
    expect(all).toContain('Current page');
  });

  it('a locked orientation menu stays closed until it is opened', () => {
    const html = renderToStaticMarkup(
      <PreviewOrientationMenu
        pageOrientation="portrait"
        pageView="vertical"
        viewLocked
        onPageOrientation={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('data-page-view="vertical"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Unlock view');
  });
});
