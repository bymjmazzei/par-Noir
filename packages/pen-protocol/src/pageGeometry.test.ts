import { describe, expect, it } from 'vitest';
import {
  A4_HEIGHT_PX,
  A4_WIDTH_PX,
  clampLayerRect,
  contentBoxSize,
  fittedPreviewPagePx,
  measureToPx,
  pxToMeasure,
  snapLayoutToContentCenter,
  pageLayerToSheet,
  sheetLayerToPage,
  openFlowDragHeightPx,
  fitAspectInBox,
  fitMediaLayerIntoContainer,
  isFlowWorkspaceOpen,
  legacyPercentToContentPx,
  LETTER_HEIGHT_PX,
  LETTER_WIDTH_PX,
  MEDIA_ATTACH_MIN_SIDE_PX,
  migrateSectionLayerGeomToPx,
  pageSheetDims,
  resizeSeKeepAspect,
  sectionNeedsLegacyGeomMigrate,
  sizeMediaLayerForAttach,
  wrapSideFromGeom
} from './pageGeometry.js';
import { emptyTipTapDoc } from './richDoc.js';
import type { PenSectionContent } from './types.js';
import { attachMediaToLayer, createTextLayer, upsertLayer } from './layers.js';

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

  it('letter and A4 keep paper aspect when fitted to the panel', () => {
    const letter = fittedPreviewPagePx('letter', 900, 1000);
    const a4 = fittedPreviewPagePx('a4', 900, 1000);
    expect(letter.height).toBeLessThanOrEqual(1000);
    expect(letter.width).toBeLessThanOrEqual(900);
    expect(letter.width / letter.height).toBeCloseTo(LETTER_WIDTH_PX / LETTER_HEIGHT_PX, 2);
    expect(a4.width / a4.height).toBeCloseTo(A4_WIDTH_PX / A4_HEIGHT_PX, 2);
    expect(a4.width).not.toBe(letter.width);
    expect(fittedPreviewPagePx('flow', 800, 600, { widthPx: null })).toEqual({
      width: 800,
      height: 600
    });
    const fixed = fittedPreviewPagePx('flow', 1000, 1000, { widthPx: 640, heightPx: 800 });
    expect(fixed.width / fixed.height).toBeCloseTo(640 / 800, 2);
  });

  it('screen layers use one strip and can sit in the page margin', () => {
    expect(pageLayerToSheet({ x: 0, y: 0 }, 0, 200, 40)).toEqual({ x: 40, y: 40 });
    expect(pageLayerToSheet({ x: 10, y: 4 }, 1, 200, 40)).toEqual({ x: 250, y: 44 });
    expect(sheetLayerToPage({ x: 0, y: 0 }, 0, 200, 40)).toEqual({ x: -40, y: -40 });
    const display = pageLayerToSheet({ x: -40, y: 12 }, 2, 200, 40);
    expect(sheetLayerToPage(display, 2, 200, 40)).toEqual({ x: -40, y: 12 });
  });

  it('converts page measurements and snaps to guides', () => {
    expect(measureToPx(1, 'in')).toBe(96);
    expect(pxToMeasure(96, 'in')).toBe(1);
    expect(measureToPx(2.54, 'cm')).toBe(96);
    const snapped = snapLayoutToContentCenter(
      { x: 48, y: 10, w: 40, h: 20 },
      400,
      300,
      { guides: { x: [50], y: [] } }
    );
    expect(snapped.snappedX).toBe(true);
    expect(snapped.x).toBe(50);
  });

  it('open flow drag height fills the visible panel', () => {
    expect(openFlowDragHeightPx(320, 1000, 40)).toBe(920);
    expect(openFlowDragHeightPx(1200, 1000, 40)).toBe(1200);
    expect(openFlowDragHeightPx(320, 0, 40)).toBe(320);
  });

  it('open flow contentBoxSize uses measured width', () => {
    const sheet = pageSheetDims('flow', { widthPx: null });
    const box = contentBoxSize(sheet, 40, 200, 900);
    expect(box.width).toBe(820);
  });

  it('letter contentBoxSize follows measured width when CSS constrains the sheet', () => {
    const sheet = pageSheetDims('letter');
    const full = contentBoxSize(sheet, 40, 200);
    expect(full.width).toBe(LETTER_WIDTH_PX - 80);
    const constrained = contentBoxSize(sheet, 40, 200, 600);
    expect(constrained.width).toBe(520);
    // Measured wider than nominal must not inflate past print width.
    const wide = contentBoxSize(sheet, 40, 200, 1200);
    expect(wide.width).toBe(LETTER_WIDTH_PX - 80);
  });

  it('wrapSideFromGeom floats toward the tighter edge so prose gets the wider gutter', () => {
    expect(wrapSideFromGeom(10, 80, 700)).toBe('left');
    expect(wrapSideFromGeom(400, 80, 700)).toBe('right');
    expect(wrapSideFromGeom(280, 200, 700)).toBe('right');
    expect(wrapSideFromGeom(220, 200, 700)).toBe('left');
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

  it('fitAspectInBox contains 16:9 inside a tall skewed box', () => {
    const fitted = fitAspectInBox(16 / 9, 100, 400);
    expect(fitted.w).toBe(100);
    expect(fitted.h).toBeCloseTo(100 / (16 / 9), 5);
  });

  it('fitMediaLayerIntoContainer keeps aspect and stays on page', () => {
    const next = fitMediaLayerIntoContainer(
      { x: 10, y: 10, w: 80, h: 300 },
      16 / 9,
      500,
      400
    );
    expect(next.w / next.h).toBeCloseTo(16 / 9, 5);
    expect(next.x + next.w).toBeLessThanOrEqual(500);
    expect(next.y + next.h).toBeLessThanOrEqual(400);
  });

  it('sizeMediaLayerForAttach grows a 50×24 stub to a usable portrait frame', () => {
    const next = sizeMediaLayerForAttach(
      { x: 12, y: 12, w: 50, h: 24 },
      9 / 16,
      500,
      700
    );
    expect(Math.min(next.w, next.h)).toBeGreaterThanOrEqual(MEDIA_ATTACH_MIN_SIDE_PX);
    expect(next.w / next.h).toBeCloseTo(9 / 16, 5);
    expect(next.w).toBeGreaterThan(50);
    expect(next.h).toBeGreaterThan(24);
  });

  it('resizeSeKeepAspect locks proportions', () => {
    const sized = resizeSeKeepAspect({ x: 0, y: 0, w: 160, h: 90 }, 40, 0);
    expect(sized.w / sized.h).toBeCloseTo(160 / 90, 5);
  });

  it('attachMediaToLayer reshapes text object to media aspect', () => {
    let section: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [],
      layerGeom: 'px'
    };
    const text = createTextLayer({ x: 20, y: 20, w: 100, h: 300 });
    section = upsertLayer(section, text);
    section = attachMediaToLayer(
      section,
      text.id,
      { kind: 'video', src: 'https://example.com/v.mp4' },
      { aspectRatio: 16 / 9, pageWidth: 500, pageHeight: 400 }
    );
    const layer = section.layers!.find((l) => l.id === text.id)!;
    expect(layer.kind).toBe('video');
    expect(layer.w / layer.h).toBeCloseTo(16 / 9, 5);
  });

  it('attachMediaToLayer grows a tiny text stub instead of staying line-height', () => {
    let section: PenSectionContent = {
      slug: 'body',
      doc: emptyTipTapDoc(),
      layers: [],
      layerGeom: 'px'
    };
    const text = createTextLayer({ x: 12, y: 12, w: 50, h: 24 });
    section = upsertLayer(section, text);
    section = attachMediaToLayer(
      section,
      text.id,
      { kind: 'video', src: 'https://example.com/v.mp4' },
      { aspectRatio: 9 / 16, pageWidth: 500, pageHeight: 700 }
    );
    const layer = section.layers!.find((l) => l.id === text.id)!;
    expect(layer.kind).toBe('video');
    expect(Math.min(layer.w, layer.h)).toBeGreaterThanOrEqual(MEDIA_ATTACH_MIN_SIDE_PX);
    expect(layer.w / layer.h).toBeCloseTo(9 / 16, 5);
  });
});
