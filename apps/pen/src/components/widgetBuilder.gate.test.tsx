/** A widget's editor is the side pane. The preview stays the other half. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, placeWidgetLayer, setButtonTrigger } from '@par-noir/pen-protocol';
import { PreviewAddMenu } from './PreviewAddMenu';
import { WidgetEditorPanel } from './WidgetEditorPanel';

const root = resolve(__dirname);

describe('widget preview builder', () => {
  it('puts the widget editor in the side pane beside the preview', () => {
    const page = readFileSync(resolve(root, '../pages/DocEditorPage.tsx'), 'utf8');
    const side = page.slice(page.indexOf('activeMediaLayer && section'));
    const widget = side.indexOf('<WidgetEditorPanel');
    const prose = side.indexOf('<PageCanvas');
    expect(widget).toBeGreaterThan(-1);
    expect(widget).toBeLessThan(prose);
    expect(page).toMatch(/showPreview && !showHistory && !sidePanel/);
    expect(page).not.toMatch(/data-widget-editor=\{isWidgetDoc \? 'preview'/);
    const html = renderToStaticMarkup(
      <WidgetEditorPanel
        layer={null}
        section={{ ...emptySection('card'), layers: [] }}
        onSectionChange={() => undefined}
      />
    );
    expect(html).toContain('data-widget-editor="panel"');
    expect(html).toContain('flex min-h-0 flex-1 flex-col');
    expect(html).toContain('Button');
    expect(html).toContain('Text');
  });

  it('puts Button in the preview add menu, outside the Layers dialog', () => {
    const html = renderToStaticMarkup(<PreviewAddMenu onAdd={() => undefined} />);
    expect(html).toContain('Add layer menu');
    expect(html).toContain('Button');
    expect(html).toContain('Text');
    expect(html).toContain('HTML snippet');
    const preview = readFileSync(resolve(root, 'EditablePagePreview.tsx'), 'utf8');
    const layers = readFileSync(resolve(root, 'LayersPanel.tsx'), 'utf8');
    expect(preview).toMatch(/<PreviewAddMenu/);
    expect(layers).not.toMatch(/overflow-hidden rounded-lg/);
  });

  it('keeps dropped buttons apart and leaves a new button without a vote trigger', () => {
    let section = emptySection('card');
    const image = placeWidgetLayer(section, null, 'image');
    section = image.section;
    const first = placeWidgetLayer(section, null, 'button');
    section = {
      ...first.section,
      layers: first.section.layers?.map((layer) =>
        layer.id === first.layerId ? { ...layer, x: 8, y: 12 } : layer
      )
    };
    const second = placeWidgetLayer(section, null, 'button');
    section = {
      ...second.section,
      layers: second.section.layers?.map((layer) =>
        layer.id === second.layerId ? { ...layer, x: 160, y: 40 } : layer
      )
    };
    const a = section.layers?.find((layer) => layer.id === first.layerId);
    const b = section.layers?.find((layer) => layer.id === second.layerId);
    expect(a?.x).toBe(8);
    expect(b?.x).toBe(160);
    expect(a?.behavior).toBeUndefined();
    expect(b?.behavior).toBeUndefined();
    const voted = setButtonTrigger(section, first.layerId, 'poll.vote');
    expect(voted.layers?.find((layer) => layer.id === first.layerId)?.behavior).toBe('poll.vote');
    expect(voted.layers?.find((layer) => layer.id === second.layerId)?.behavior).toBeUndefined();
  });
});
