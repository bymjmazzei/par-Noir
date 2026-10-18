/** A widget's editor is the side pane. The preview stays the other half. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  defaultPagePresentation,
  emptySection,
  placeWidgetLayer,
  setButtonTrigger,
  setWidgetHtml
} from '@par-noir/pen-protocol';
import { WidgetEditorPanel } from './WidgetEditorPanel';
import { LayerObjectToolbar } from './LayerObjectToolbar';
import { GradientPicker } from './GradientPicker';

const root = resolve(__dirname);

describe('widget preview builder', () => {
  it('puts the widget editor in the side pane beside the preview', () => {
    const page = readFileSync(resolve(root, '../pages/docEditor/DocEditorShell.tsx'), 'utf8');
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
    expect(html).toContain('Widget layers');
    expect(html).toContain('Button');
    expect(html).toContain('Text');
    expect(html).toContain('data-media-timeline');
    expect(html).toContain('aria-label="Keyframe"');
    expect(page).toMatch(/layerOpensWidgetEditor/);
    expect(page).toMatch(/isWidgetDoc \|\| widgetEditorLayer/);
    expect(page).toMatch(/hideActionBind=\{isWidgetDoc \|\| Boolean\(widgetEditorLayer\)\}/);
    const strip = readFileSync(resolve(root, 'ActionBindStrip.tsx'), 'utf8');
    expect(strip).not.toMatch(/Time mode|Clock time|HTML snippet|Field name/);
    expect(page).toMatch(/hideObjectTools=\{isWidgetDoc\}/);
    const toolbar = readFileSync(resolve(root, 'LayerObjectToolbar.tsx'), 'utf8');
    expect(toolbar).toMatch(/title="Layer"/);
    expect(toolbar).toMatch(/data-layer-menu/);
    expect(toolbar).toMatch(/label="Background"/);
    expect(toolbar).toMatch(/LayerTitleControl/);
    const titleControl = readFileSync(resolve(root, 'LayerTitleControl.tsx'), 'utf8');
    expect(titleControl).toMatch(/Rename layer/);
    expect(titleControl).toMatch(/Save layer name/);
    expect(toolbar).toMatch(/AlignIcon/);
    expect(toolbar).not.toMatch(/title="Blend"/);
    expect(toolbar).toMatch(/hideObjectTools/);
    const blend = renderToStaticMarkup(
      <LayerObjectToolbar
        hideObjectTools
        target={{
          kind: 'layer',
          layer: {
            id: 'b',
            kind: 'interactive',
            x: 0,
            y: 0,
            w: 40,
            h: 20,
            zIndex: 1,
            label: 'Go'
          }
        }}
        presentation={defaultPagePresentation()}
        section={emptySection('card')}
        onSectionChange={() => undefined}
      />
    );
    expect(blend).toContain('title="Layer"');
    expect(blend).not.toContain('title="Blend"');
    expect(blend).not.toContain('title="Shadow"');
    expect(blend).not.toContain('title="Opacity"');
    const collab = readFileSync(resolve(root, '../services/penCollab.ts'), 'utf8');
    expect(collab).toMatch(/openEnvelope/);
  });

  it('lets Art use structured fill or HTML in the widget side pane', () => {
    const panel = readFileSync(resolve(root, 'WidgetEditorPanel.tsx'), 'utf8');
    const artEditor = readFileSync(resolve(root, 'WidgetArtFillEditor.tsx'), 'utf8');
    const preview = readFileSync(resolve(root, 'EditablePagePreview.tsx'), 'utf8');
    expect(panel).toMatch(/WidgetArtFillEditor/);
    expect(artEditor).toMatch(/Art background/);
    expect(preview).toMatch(/WidgetArtLayerFace/);
    const placed = placeWidgetLayer(emptySection('card'), null, 'html');
    const section = setWidgetHtml(placed.section, placed.layerId, '<b>x</b>');
    const art = section.layers?.find((layer) => layer.id === placed.layerId)!;
    const html = renderToStaticMarkup(
      <WidgetEditorPanel layer={art} section={section} onSectionChange={() => undefined} />
    );
    expect(html).toContain('data-widget-art-editor');
    expect(html).toContain('HTML');
    expect(html).toContain('Gradient');
    expect(html).not.toContain('aria-label="Fill"');
    expect(artEditor).toMatch(/<ColorBox/);
    expect(artEditor).toMatch(/<GradientPicker/);
    expect(artEditor).not.toMatch(/ColorSwatchButton|Gradient CSS/);
    const toolbar = readFileSync(resolve(root, 'LayerObjectToolbar.tsx'), 'utf8');
    expect(toolbar).toMatch(/<GradientPicker/);
    expect(toolbar).not.toMatch(/aria-label="Gradient"/);
  });

  it('edits gradients with stops and an angle dial, not a text field', () => {
    const html = renderToStaticMarkup(
      <GradientPicker value="linear-gradient(45deg, #ff0000 0%, #0000ff 100%)" onChange={() => undefined} />
    );
    expect(html).toContain('data-gradient-picker');
    expect(html).toContain('aria-label="Gradient stop 1"');
    expect(html).toContain('aria-label="Gradient stop 2"');
    expect(html).toContain('aria-label="Gradient stop color"');
    expect(html).toContain('type="color"');
    expect(html).toContain('aria-valuenow="45"');
    expect(html).not.toContain('type="text"');
  });

  it('keeps widget add and trigger controls off the preview toolbar', () => {
    const preview = readFileSync(resolve(root, 'EditablePagePreview.tsx'), 'utf8');
    const layers = readFileSync(resolve(root, 'LayersPanel.tsx'), 'utf8');
    expect(preview).not.toMatch(/PreviewAddMenu/);
    expect(preview).toMatch(/hideActionBind/);
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
