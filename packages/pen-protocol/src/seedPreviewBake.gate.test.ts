/** Bake + gate Social starter SVG gallery previews (inert flatten). */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  collectActionOverlays,
  getClass,
  listStarterTemplates,
  renderTemplatePreviewSvg,
  sectionWithoutActionLayers
} from './index.js';

const previewsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'starter-assets/previews'
);

describe('social starter gallery preview bake', () => {
  it('writes SVG previews for Social starters and excludes action layers from bake input', () => {
    mkdirSync(previewsDir, { recursive: true });
    const social = listStarterTemplates().filter((t) => {
      const form = getClass(t.classId);
      return form?.parentId === 'social';
    });
    expect(social.length).toBeGreaterThan(10);

    for (const t of social) {
      expect(t.seedGalleryPreviewSrc, t.id).toBeTruthy();
      const svg = renderTemplatePreviewSvg(t);
      expect(svg, t.id).toBeTruthy();
      expect(svg!).toMatch(/^<\?xml/);
      // Action stickers must not appear as interactive labels baked if we strip — poll inert chrome may still say Option A
      const stripped = (t.seedSections || []).map((s) => sectionWithoutActionLayers(s));
      const actionCount = collectActionOverlays(t.seedSections || []).length;
      const strippedAction = collectActionOverlays(stripped).length;
      expect(strippedAction).toBe(0);
      if (t.id === 'poll.basic.v1' || t.id === 'frame.basic.v1') {
        expect(actionCount).toBeGreaterThan(0);
      }
      const file = join(previewsDir, `${t.id}.svg`);
      writeFileSync(file, svg!, 'utf8');
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8').length).toBeGreaterThan(80);
    }
  });
});
