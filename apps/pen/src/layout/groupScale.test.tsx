import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutSurface } from './LayoutSurface';
import { scaleGroupItems } from './types';

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(resolve(src, rel), 'utf8');

describe('group resize scales the widget', () => {
  it('members scale about the group corner and their faces zoom with them', () => {
    const group = { id: 'g', x: 16, y: 16, w: 360, h: 360, zIndex: 1 };
    const out = scaleGroupItems(group, { ...group, w: 180, h: 300 }, {
      art: { id: 'art', x: 16, y: 16, w: 360, h: 360, zIndex: 2 },
      btn: { id: 'btn', x: 40, y: 146, w: 312, h: 36, zIndex: 3, contentScale: 0.8 }
    });
    expect(out.g).toMatchObject({ w: 180, h: 180 });
    expect(out.art).toMatchObject({ x: 16, y: 16, w: 180, h: 180, contentScale: 0.5 });
    expect(out.btn).toMatchObject({ x: 28, y: 81, w: 156, h: 18, contentScale: 0.4 });
  });

  it('a scaled layer draws its face zoomed inside the frame', () => {
    const html = renderToStaticMarkup(
      <LayoutSurface
        items={[{ id: 'a', x: 0, y: 0, w: 180, h: 90, zIndex: 1, contentScale: 0.5 }]}
        onChange={() => {}}
        renderItem={() => <span>face</span>}
      />
    );
    expect(html).toContain('zoom:0.5');
    expect(html).toContain('width:360px;height:180px');
  });

  it('groups are resizable in the page editor and the scale is saved', () => {
    const editor = read('components/EditablePagePreview.tsx');
    expect(editor).not.toMatch(/resizeDisabledIds=\{groupIds\}/);
    expect(editor).toMatch(/patchLayerStyle\(next, item\.id, \{ contentScale: item\.contentScale \}\)/);
    expect(read('components/ScreenLayerStage.tsx')).toMatch(/moved\.contentScale = hit\.layout\.contentScale/);
  });
});

describe('layers list and picker tiles', () => {
  it('groups collapse like folders', () => {
    const panel = read('components/LayersPanel.tsx');
    expect(panel).toMatch(/aria-label=\{open \? 'Collapse group' : 'Expand group'\}/);
    expect(panel).toMatch(/if \(open\) rows\.push\(\{ kind: 'layer', layer: kid/);
  });

  it('picker tiles leave room under the poster', () => {
    expect(read('index.css')).toMatch(
      /\.pen-action-layer-gallery\.pen-templates-gallery \.pen-gallery-tile-preview \{\s*padding: 0 8px 8px;/
    );
  });
});
