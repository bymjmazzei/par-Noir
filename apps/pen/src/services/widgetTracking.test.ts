import { describe, expect, it, vi } from 'vitest';
import type { PenPageLayer, PenSectionContent } from '@par-noir/pen-protocol';
import type { LocalDocBundle } from './penLocalStore';
import type { PenSession } from './penSession';
import { ensureBundleTrackingSheets } from './widgetTracking';

const session = { pnIdentifier: 'pn-owner' } as PenSession;
const button = (id: string, extra: Partial<PenPageLayer>): PenPageLayer => ({
  id,
  kind: 'interactive',
  x: 0,
  y: 0,
  w: 40,
  h: 20,
  zIndex: 2,
  ...extra
});
const section = (slug: string, layers: PenPageLayer[]): PenSectionContent => ({
  slug,
  doc: { type: 'doc', content: [] },
  layers
});
const bundle = (sections: PenSectionContent[]) =>
  ({ manifest: { docId: 'doc-12345678', toc: sections.map((s) => s.slug) }, sections }) as unknown as LocalDocBundle;

describe('ensureBundleTrackingSheets taps', () => {
  it('mints one Taps sheet at publish for a post whose only buttons jump or open', async () => {
    const mint = vi.fn(async () => 'sheet-taps');
    const b = bundle([
      section('cover', [button('go', { behavior: 'page.go', goTo: 'slug:menu' })]),
      section('menu', [button('shop', { behavior: 'cta.open', openUrl: 'https://shop.example' })])
    ]);
    const ready = await ensureBundleTrackingSheets({ session, bundle: b, mintSheet: mint, taps: true });
    expect(ready.manifest.tapSpreadsheetId).toBe('sheet-taps');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'taps', title: 'Taps doc-1234' }));

    const again = await ensureBundleTrackingSheets({ session, bundle: ready, mintSheet: mint, taps: true });
    expect(again.manifest.tapSpreadsheetId).toBe('sheet-taps');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('reuses the post widget sheet, and skips taps outside publish', async () => {
    const mint = vi.fn(async () => 'sheet-new');
    const group: PenPageLayer = { id: 'g', kind: 'group', x: 0, y: 0, w: 100, h: 100, zIndex: 1, spreadsheetId: 'sheet-poll' };
    const b = bundle([
      section('cover', [
        group,
        button('v', { behavior: 'poll.vote', parentGroupId: 'g' }),
        button('go', { behavior: 'page.go', goTo: 'next' })
      ])
    ]);
    const ready = await ensureBundleTrackingSheets({ session, bundle: b, mintSheet: mint, taps: true });
    expect(ready.manifest.tapSpreadsheetId).toBe('sheet-poll');
    expect(mint).not.toHaveBeenCalled();

    const clone = await ensureBundleTrackingSheets({ session, bundle: b, mintSheet: mint });
    expect(clone.manifest.tapSpreadsheetId).toBeUndefined();
  });
});
