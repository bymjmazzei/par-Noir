import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAYERS_ADD_TOP_ROWS,
  LAYERS_TEXT_LOOK_PRESETS
} from './layersAddMenu';

describe('layersAddMenu', () => {
  it('exposes text presets without label', () => {
    const looks = LAYERS_TEXT_LOOK_PRESETS.map((row) => row.look);
    expect(looks).toEqual(['title', 'caption', 'quote']);
    expect(looks).not.toContain('label');
  });

  it('LayersPanel add menu uses accordion sections and Blank', () => {
    const panel = readFileSync(resolve(__dirname, 'LayersPanel.tsx'), 'utf8');
    for (const row of LAYERS_ADD_TOP_ROWS) {
      expect(panel).toContain(row);
    }
    expect(panel).toContain('Blank');
    expect(panel).not.toMatch(/addLook\('label'\)/);
    expect(panel).not.toMatch(/\['label', 'Label'\]/);
    expect(panel).not.toContain('New text layer');
    expect(panel).toContain('LayerTitleControl');
  });
});
