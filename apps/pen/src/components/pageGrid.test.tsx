/** The grid is an editor positioning aid. It never reaches a publish capture. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, PAGE_LAYER_ID, type PenDocManifest } from '@par-noir/pen-protocol';
import { EditablePagePreview } from './EditablePagePreview';
import { PAGE_GRID_PX, PageGrid } from './PageGrid';

const manifest: PenDocManifest = {
  docId: 'pen_grid',
  title: 'Grid',
  docType: 'note',
  classId: 'social.note',
  templateId: 'note',
  templateVersion: '1',
  toc: ['body'],
  createdAt: '2026-11-03T00:00:00.000Z',
  updatedAt: '2026-11-03T00:00:00.000Z',
  pageLayout: 'flow',
  pageSize: 'ratio-9-16',
  flowWorkspaceWidthPx: 360,
  flowWorkspaceHeightPx: 640,
  showPageGrid: true
};

describe('page grid', () => {
  it('paints a 24px grid that ignores the pointer', () => {
    const html = renderToStaticMarkup(<PageGrid />);
    expect(PAGE_GRID_PX).toBe(24);
    expect(html).toContain('data-pen-page-grid');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('background-size:24px 24px');
  });

  it('the Grid toggle sits beside Snap and reflects the doc setting', () => {
    const html = renderToStaticMarkup(
      <EditablePagePreview
        manifest={manifest}
        section={emptySection('body')}
        activeLayerId={PAGE_LAYER_ID}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
        onSnapChange={() => undefined}
        onGridChange={() => undefined}
        showToolbar
      />
    );
    const grid = html.indexOf('>Grid<');
    const snap = html.indexOf('>Snap<');
    expect(grid).toBeGreaterThan(-1);
    expect(snap).toBeGreaterThan(grid);
    expect(html.slice(html.lastIndexOf('<button', grid), grid)).toContain('aria-pressed="true"');
    expect(html).not.toContain('data-pen-page-grid');
  });

  it('renders on the page wrapper, outside the compose export root', () => {
    const shell = readFileSync(resolve(__dirname, '../pages/docEditor/DocEditorShell.tsx'), 'utf8');
    const preview = shell.indexOf('<EditablePagePreview');
    const grid = shell.indexOf('<PageGrid />');
    expect(grid).toBeGreaterThan(preview);
    expect(shell.slice(preview, grid)).toMatch(/\/>\s*<\/div>\s*\{bundle\.manifest\.showPageGrid/);
    const page = readFileSync(resolve(__dirname, 'EditablePagePreview.tsx'), 'utf8');
    expect(page).not.toContain('<PageGrid');
  });
});
