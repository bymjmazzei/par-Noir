import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createTextLayer,
  defaultEditorPagePresentation,
  emptySection
} from '@par-noir/pen-protocol';
import { ScreenLayerStage } from './ScreenLayerStage';

describe('screen layer stage', () => {
  it('places every page layer in one strip, including the page margin', () => {
    const page0 = emptySection('body');
    const edge = { ...createTextLayer({ x: -40, y: 0, w: 40, h: 20 }), id: 'edge' };
    page0.layers = [edge];
    const page1 = emptySection('page-2');
    const across = { ...createTextLayer({ x: 10, y: 4, w: 40, h: 20 }), id: 'across' };
    page1.layers = [across];

    const html = renderToStaticMarkup(
      <ScreenLayerStage
        sections={[page0, page1]}
        pageWidth={200}
        pageHeight={300}
        pad={40}
        presentation={defaultEditorPagePresentation()}
        activeLayerId={null}
        onSelectLayer={() => {}}
        onSectionsChange={() => {}}
      />
    );

    expect(html).toContain('left:0;');
    expect(html).toContain('left:250px');
    expect(html).toContain('top:44px');
  });
});
