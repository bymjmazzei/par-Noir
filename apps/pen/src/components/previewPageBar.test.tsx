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
  PreviewPageBar,
  PreviewPageStrip
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
