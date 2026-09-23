import { describe, expect, it } from 'vitest';
import {
  clampLayerRect,
  contentBoxSize,
  legacyPercentToContentPx,
  LETTER_HEIGHT_PX,
  LETTER_WIDTH_PX,
  migrateSectionLayerGeomToPx,
  pageSheetDims,
  sectionNeedsLegacyGeomMigrate,
  wrapSideFromGeom
} from './pageGeometry.js';
import { emptyTipTapDoc } from './richDoc.js';
import type { PenSectionContent } from './types.js';

describe('pageGeometry', () => {
  it('pageSheetDims: flow has no fixed height; letter/a4 are paged', () => {
    const flow = pageSheetDims('flow', 640);
    expect(flow.paged).toBe(false);
    expect(flow.pageWidthPx).toBe(640);
    expect(flow.pageHeightPx).toBeNull();

    const letter = pageSheetDims('letter');
    expect(letter.paged).toBe(true);
    expect(letter.pageWidthPx).toBe(LETTER_WIDTH_PX);
    expect(letter.pageHeightPx).toBe(LETTER_HEIGHT_PX);

    const a4 = pageSheetDims('a4');
    expect(a4.paged).toBe(true);
    expect(a4.pageWidthPx).toBeGreaterThan(700);
  });

  it('legacy % migrate is stable across page layouts (same px)', () => {
    const pct = { x: 20, y: 10, w: 40, h: 30 };
    const px = legacyPercentToContentPx(pct, 40);
    const letterBox = contentBoxSize(pageSheetDims('letter'), 40, 200);
    const flowBox = contentBoxSize(pageSheetDims('flow', 640), 40, 200);
    const a4Box = contentBoxSize(pageSheetDims('a4'), 40, 200);
    // Stored geom unchanged; content box width differs but layer rect is absolute px
    expect(px.w).toBe(Math.round(0.4 * (LETTER_WIDTH_PX - 80)));
    expect(px.x).toBe(Math.round(0.2 * (LETTER_WIDTH_PX - 80)));
    // Same layer rect fits all boxes without rescaling the numbers
    expect(clampLayerRect(px, letterBox.width, letterBox.height).w).toBe(px.w);
    expect(clampLayerRect(px, flowBox.width, flowBox.height).w).toBe(px.w);
    expect(clampLayerRect(px, a4Box.width, a4Box.height).w).toBe(px.w);
  });

  it('clamp rejects y past content bottom', () => {
    const clamped = clampLayerRect({ x: 0, y: 900, w: 100, h: 100 }, 500, 400);
    expect(clamped.y).toBe(300);
    expect(clamped.y + clamped.h).toBe(400);
  });

  it('migrateSectionLayerGeomToPx converts once and stamps layerGeom', () => {
    const section: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [
        {
          id: 'a',
          kind: 'image',
          x: 10,
          y: 20,
          w: 40,
          h: 30,
          zIndex: 1,
          imageSrc: 'x'
        }
      ]
    };
    expect(sectionNeedsLegacyGeomMigrate(section)).toBe(true);
    const next = migrateSectionLayerGeomToPx(section, 40);
    expect(next.layerGeom).toBe('px');
    expect(next.layers![0]!.w).toBeGreaterThan(100);
    expect(sectionNeedsLegacyGeomMigrate(next)).toBe(false);
    const again = migrateSectionLayerGeomToPx(next, 40);
    expect(again.layers![0]!.w).toBe(next.layers![0]!.w);
  });

  it('wrapSideFromGeom uses content midline in px', () => {
    expect(wrapSideFromGeom(10, 80, 700)).toBe('left');
    expect(wrapSideFromGeom(400, 80, 700)).toBe('right');
  });
});
