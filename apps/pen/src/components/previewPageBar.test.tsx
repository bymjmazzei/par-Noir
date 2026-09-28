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
import { PreviewPageBar, PreviewPageStrip } from './PreviewPageBar';

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

  it('shows add page, a tile per page, and the three views', () => {
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
        onFlip={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('Add page');
    expect(html).toContain('Delete page');
    expect(html).toContain('Previous page');
    expect(html).toContain('Next page');
    expect(html).toContain('Page 1');
    expect(html).toContain('Page 2');
    expect(html).toContain('Vertical');
    expect(html).toContain('Horizontal');
    expect(html).toContain('Screen');
    expect(html).toContain('Lock view');
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

  it('a locked view disables the other view buttons', () => {
    const html = renderToStaticMarkup(
      <PreviewPageBar
        pages={[{ slug: 'body', title: 'Page 1', section: emptySection('body') }]}
        activeSlug="body"
        pageView="vertical"
        viewLocked
        presentation={defaultPagePresentation()}
        onSelect={() => undefined}
        onAddPage={() => undefined}
        onDeletePage={() => undefined}
        onFlip={() => undefined}
        onPageView={() => undefined}
        onToggleViewLock={() => undefined}
      />
    );
    expect(html).toContain('Unlock view');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Delete page');
  });
});
