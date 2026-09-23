import { describe, expect, it } from 'vitest';
import {
  clampLayerRect,
  contentBoxSize,
  isFlowWorkspaceOpen,
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
  it('pageSheetDims: open flow fills; fixed flow has width; letter/a4 are paged', () => {
    const open = pageSheetDims('flow', { widthPx: null, heightPx: null });
    expect(open.fillWidth).toBe(true);
    expect(open.pageWidthPx).toBeNull();
    expect(open.paged).toBe(false);

    const fixed = pageSheetDims('flow', { widthPx: 640, heightPx: 800 });
    expect(fixed.fillWidth).toBe(false);
    expect(fixed.pageWidthPx).toBe(640);
    expect(fixed.pageHeightPx).toBe(800);

    const letter = pageSheetDims('letter');
    expect(letter.paged).toBe(true);
    expect(letter.pageWidthPx).toBe(LETTER_WIDTH_PX);
    expect(letter.pageHeightPx).toBe(LETTER_HEIGHT_PX);
  });

  it('isFlowWorkspaceOpen treats null/undefined as open', () => {
    expect(isFlowWorkspaceOpen(null)).toBe(true);
    expect(isFlowWorkspaceOpen(undefined)).toBe(true);
    expect(isFlowWorkspaceOpen(640)).toBe(false);
  });

  it('legacy % migrate is stable across page layouts (same px)', () => {
    const pct = { x: 20, y: 10, w: 40, h: 30 };
    const px = legacyPercentToContentPx(pct, 40);
    const letterBox = contentBoxSize(pageSheetDims('letter'), 40, 200);
    const flowBox = contentBoxSize(
      pageSheetDims('flow', { widthPx: 640 }),
      40,
      200
    );
    expect(px.w).toBe(Math.round(0.4 * (LETTER_WIDTH_PX - 80)));
    expect(clampLayerRect(px, letterBox.width, letterBox.height).w).toBe(px.w);
    expect(clampLayerRect(px, flowBox.width, flowBox.height).w).toBe(px.w);
  });

  it('open flow contentBoxSize uses measured width', () => {
    const sheet = pageSheetDims('flow', { widthPx: null });
    const box = contentBoxSize(sheet, 40, 200, 900);
    expect(box.width).toBe(820);
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
  });

  it('wrapSideFromGeom uses content midline in px', () => {
    expect(wrapSideFromGeom(10, 80, 700)).toBe('left');
    expect(wrapSideFromGeom(400, 80, 700)).toBe('right');
  });
});
