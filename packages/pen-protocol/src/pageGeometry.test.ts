import { describe, expect, it } from 'vitest';
import {
  clampLayerRect,
  contentBoxSize,
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
