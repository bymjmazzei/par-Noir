import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LETTER_HEIGHT_PX } from '@par-noir/pen-protocol';
import { PageSheetColumn } from './PageSheetColumn';

describe('preview page sheet', () => {
  it('fills the fitted slot instead of the natural paper height', () => {
    const html = renderToStaticMarkup(
      <PageSheetColumn pageLayout="letter" contentOuterHeightPx={4000} containInParent>
        <span>page</span>
      </PageSheetColumn>
    );
    expect(html).toContain('height:100%');
    expect(html).not.toContain(`height:${LETTER_HEIGHT_PX}`);
  });
});
