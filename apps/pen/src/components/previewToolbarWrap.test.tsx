/** The live preview bar wraps onto a second row instead of clipping. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emptySection, PAGE_LAYER_ID, type PenDocManifest } from '@par-noir/pen-protocol';
import { EditablePagePreview } from './EditablePagePreview';

const manifest: PenDocManifest = {
  docId: 'pen_wrap',
  title: 'Wrap',
  docType: 'note',
  classId: 'social.note',
  templateId: 'note',
  templateVersion: '1',
  toc: ['body'],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  pageLayout: 'flow',
  pageSize: 'ratio-9-16',
  flowWorkspaceWidthPx: 360,
  flowWorkspaceHeightPx: 640
};

describe('preview toolbar wrap', () => {
  it('wraps the live preview toolbar when the panel cannot hold one row', () => {
    const html = renderToStaticMarkup(
      <EditablePagePreview
        manifest={manifest}
        section={emptySection('body')}
        activeLayerId={PAGE_LAYER_ID}
        onSelectLayer={() => undefined}
        onSectionChange={() => undefined}
        onPageSizeChange={() => undefined}
        showToolbar
      />
    );
    expect(html).toContain('aria-label="Page size"');
    const title = html.indexOf('>Body<');
    const layers = html.indexOf('aria-label="Layers"');
    const adjustments = html.indexOf('title="Layer"');
    expect(title).toBeGreaterThan(-1);
    expect(title).toBeLessThan(layers);
    expect(layers).toBeLessThan(adjustments);
    expect(html).toContain('flex shrink-0 flex-wrap items-center gap-2');
    expect(html).toContain('max-w-full shrink-0 flex-wrap items-center gap-1');
    expect(html).toContain('max-w-full flex-wrap items-center gap-0.5');
    expect(html).not.toContain('flex-nowrap');
  });

  it('places body wrap toggle immediately after Snap on the preview bar', () => {
    const src = readFileSync(resolve(__dirname, 'EditablePagePreview.tsx'), 'utf8');
    const toolbar = src.slice(src.indexOf('{onSnapChange && ('), src.indexOf('className="ml-auto flex'));
    const snap = toolbar.indexOf('\n            Snap\n');
    const wrap = toolbar.indexOf('BodyWrapToolbarButton');
    expect(snap).toBeGreaterThan(-1);
    expect(wrap).toBeGreaterThan(snap);
    expect(wrap - snap).toBeLessThan(1200);
  });
});
