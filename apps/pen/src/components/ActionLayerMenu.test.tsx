import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ActionLayerMenu', () => {
  it('lists quick presets in the widget picker via placePageWidget', () => {
    const src = readFileSync(resolve(__dirname, 'ActionLayerMenu.tsx'), 'utf8');
    expect(src).toMatch(/LAYERS_PAGE_WIDGET_PRESETS/);
    expect(src).toMatch(/placePageWidget/);
    expect(src).toMatch(/pickPreset/);
    expect(src).toMatch(/Add widget/);
    expect(src).toMatch(/shownPresets/);
    const presets = readFileSync(resolve(__dirname, 'layersAddMenu.ts'), 'utf8');
    for (const label of ['Poll', 'Countdown', 'Link']) {
      expect(presets).toContain(label);
    }
  });
});
