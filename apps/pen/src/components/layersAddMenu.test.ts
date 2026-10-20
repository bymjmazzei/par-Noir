import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LAYERS_ADD_TOP_ROWS,
  LAYERS_TEXT_LOOK_PRESETS,
  LAYERS_WIDGET_ELEMENTS
} from './layersAddMenu';

describe('layersAddMenu', () => {
  it('exposes text presets without label', () => {
    const looks = LAYERS_TEXT_LOOK_PRESETS.map((row) => row.look);
    expect(looks).toEqual(['title', 'caption', 'quote']);
    expect(looks).not.toContain('label');
  });

  it('LayersPanel add menu uses flat media rows and device/cloud picks', () => {
    const panel = readFileSync(resolve(__dirname, 'LayersPanel.tsx'), 'utf8');
    for (const row of LAYERS_ADD_TOP_ROWS) {
      expect(panel).toContain(row);
    }
    expect(panel).toContain('Select from device');
    expect(panel).toContain('Select from cloud');
    expect(panel).toContain('Use licensed audio');
    expect(panel).not.toContain('Blank');
    expect(panel).not.toMatch(/\bMedia\b/);
    expect(panel).not.toMatch(/addLook\('label'\)/);
    expect(panel).not.toMatch(/\['label', 'Label'\]/);
    expect(panel).not.toContain('New text layer');
    expect(panel).toContain('LayerTitleControl');
    const attach = readFileSync(resolve(__dirname, '../services/penAttach.ts'), 'utf8');
    expect(attach).toContain("mimeType contains 'audio/'");
    expect(attach).toContain('pickDeviceAudioFile');
  });

  it('Widgets dropdown opens All widgets then lists each building block', () => {
    const panel = readFileSync(resolve(__dirname, 'LayersPanel.tsx'), 'utf8');
    expect(LAYERS_WIDGET_ELEMENTS.map((row) => row.element)).toEqual([
      'input',
      'button',
      'time',
      'html'
    ]);
    expect(panel).toContain("toggleAddSection('widgets')");
    expect(panel).toContain('All widgets');
    expect(panel).toMatch(/LAYERS_WIDGET_ELEMENTS\.map/);
    expect(panel).toMatch(/placeWidgetLayer\(prepared, groupId, element\)/);
  });
});
