import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PenPageLayer } from '@par-noir/pen-protocol';
import { textEditorSurface } from './components/WidgetEditorPanel';

const src = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

function textLayer(color: string, over: Partial<PenPageLayer> = {}): PenPageLayer {
  return {
    id: 't',
    kind: 'text',
    widgetElement: 'text',
    x: 0,
    y: 0,
    w: 100,
    h: 40,
    zIndex: 1,
    backgroundColor: 'transparent',
    textDoc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hi', marks: [{ type: 'textStyle', attrs: { color } }] }]
        }
      ]
    },
    ...over
  } as PenPageLayer;
}

describe('toolbar popups escape clipped columns', () => {
  it('ribbon menus, color buttons and panel popovers portal to the body', () => {
    expect(src('components/AnchoredPanel.tsx')).toMatch(/createPortal\([\s\S]*document\.body/);
    const ribbon = src('components/ribbon/RibbonChrome.tsx');
    expect(ribbon.match(/<AnchoredPanel/g)?.length).toBe(2);
    expect(src('components/PanelValueControls.tsx')).toMatch(/<AnchoredPanel/);
    expect(src('components/DocItemMenu.tsx')).toMatch(/<AnchoredPanel/);
    expect(src('index.css')).not.toMatch(/\.pen-ribbon-menu-panel \{[^}]*position: absolute/);
  });
});

describe('color picker', () => {
  it('uses the full picker with opacity, not a hue-only slider', () => {
    const controls = src('components/PanelValueControls.tsx');
    expect(controls).not.toMatch(/ColorSliders/);
    expect(controls).not.toMatch(/max=\{360\}/);
    const picker = controls.slice(
      controls.indexOf('export function ColorOpacityPicker'),
      controls.indexOf('const RANGE_CLASS')
    );
    expect(picker).toMatch(/<ColorBox\s+label="Color"/);
    expect(picker).toMatch(/<ValueRow\s+label="Opacity"/);
    expect(picker).not.toMatch(/type="range"/);
    expect(src('components/LayerObjectToolbar.tsx')).toMatch(/import \{ ColorBox, ValueRow \} from '\.\/PanelValueControls'/);
    expect(src('components/ribbon/RibbonChrome.tsx')).toMatch(/<ColorOpacityPicker/);
  });
});

describe('side text editor surface', () => {
  it('puts light text on a dark surface and dark text on white', () => {
    expect(textEditorSurface(textLayer('#fff7ed'))).toBe('#1c1917');
    expect(textEditorSurface(textLayer('#1c1917'))).toBe('#ffffff');
  });

  it('uses the layer fill when it is solid', () => {
    expect(textEditorSurface(textLayer('#fff7ed', { backgroundColor: '#7c2d12' }))).toBe('#7c2d12');
    expect(
      textEditorSurface(textLayer('#fff7ed', { backgroundColor: 'rgba(255,247,237,0.12)' }))
    ).toBe('#1c1917');
  });
});

describe('playhead', () => {
  it('selecting a layer settles it instead of rewinding and auto-playing', () => {
    const controller = src('pages/docEditor/useDocEditorController.ts');
    expect(controller).toMatch(/if \(!bundle \|\| !section \|\| !isWidgetDoc\) return;\s*const key/);
    expect(controller).toMatch(/const settled = layerSettledSec\(section, layer\);/);
    expect(controller).toMatch(/if \(getPlayheadSec\(\) < settled\) setPlayheadSec\(settled\);/);
  });

  it('publish and download leave the editor playhead where it was', () => {
    const encode = src('services/encodePageVideo.ts');
    expect(encode).not.toMatch(/setPlayheadSec\(0\)/);
    expect(encode.match(/setPlayheadSec\(editorPlayhead\)/g)?.length).toBe(2);
  });
});

describe('vertical alignment', () => {
  it('ribbon offers top, middle and bottom for text layers and the page body', () => {
    expect(src('components/WidgetEditorPanel.tsx')).toMatch(/textVerticalAlign: next/);
    expect(src('pages/docEditor/DocEditorShell.tsx')).toMatch(
      /onVerticalAlign=\{canVerticalAlign \? setActiveVerticalAlign : undefined\}/
    );
    const controller = src('pages/docEditor/useDocEditorController.ts');
    expect(controller).toMatch(/!flowsBody && isPageLayerId\(activeLayerId\)/);
    expect(controller).toMatch(/bodyVerticalAlign: next === 'top' \? undefined : next/);
  });

  it('page body renders its vertical alignment in the baked DOM', () => {
    const preview = src('components/EditablePagePreview.tsx');
    expect(preview).toMatch(/data-pen-page-body[\s\S]*flex flex-col/);
    expect(preview).toMatch(/<div style=\{bodyVerticalAlignStyle\(bodyVerticalAlign\)\}>/);
  });
});
