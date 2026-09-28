import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, placeWidgetLayer } from '@par-noir/pen-protocol';
import { WidgetEditorPanel } from './WidgetEditorPanel';

function panel(element: 'text' | 'button' | 'html') {
  let section = emptySection('card');
  const placed = placeWidgetLayer(section, null, element);
  section = placed.section;
  const layer = section.layers?.find((item) => item.id === placed.layerId) || null;
  return renderToStaticMarkup(
    <WidgetEditorPanel layer={layer} section={section} onSectionChange={() => undefined} />
  );
}

describe('widget text editor', () => {
  it('shows font, size, and bold for a text layer and a button', () => {
    for (const html of [panel('text'), panel('button')]) {
      expect(html).toContain('data-widget-text-editor');
      expect(html).toContain('title="Font"');
      expect(html).toContain('title="Size"');
      expect(html).toContain('title="Bold"');
    }
  });

  it('keeps the button type field in the trigger form, above the trigger', () => {
    const html = panel('button');
    expect(html.indexOf('>Label<')).toBeGreaterThan(-1);
    expect(html.indexOf('data-widget-text-editor')).toBeLessThan(html.indexOf('Button trigger'));
    const beforeEditor = html.slice(0, html.indexOf('data-widget-text-editor'));
    expect(beforeEditor).not.toContain('<label');
  });

  it('lets a short widget label stay one line tall', () => {
    const canvas = readFileSync(resolve(__dirname, 'PageCanvas.tsx'), 'utf8');
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(canvas).toMatch(/pen-compact-prose/);
    const compact = css.slice(
      css.indexOf('.pen-compact-prose .ProseMirror'),
      css.indexOf('.pen-compact-prose .pen-word-prose p')
    );
    expect(compact).toMatch(/min-height:\s*1\.75rem/);
    expect(compact).not.toMatch(/18rem/);
  });

  it('leaves an HTML snippet as code', () => {
    const html = panel('html');
    expect(html).toContain('HTML snippet');
    expect(html).not.toContain('data-widget-text-editor');
    expect(html).not.toContain('title="Bold"');
  });
});
