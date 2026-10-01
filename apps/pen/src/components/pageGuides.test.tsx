import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageGuides } from './PageGuides';

describe('page guides', () => {
  it('runs a vertical guide across the workspace past the page', () => {
    const html = renderToStaticMarkup(
      <PageGuides
        guides={[{ id: 'g', axis: 'vertical', position: 40 }]}
        span={{ left: 0, right: 0, top: 80, bottom: 24 }}
        onMove={() => undefined}
      />
    );
    expect(html).toContain('top:-80px');
    expect(html).toContain('calc(100% + 104px)');
  });
});
