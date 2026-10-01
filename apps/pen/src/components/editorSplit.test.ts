import { describe, expect, it } from 'vitest';
import { clampEditorPanePx } from './editorSplit';

describe('editor preview split', () => {
  it('keeps both panels usable while the divider moves', () => {
    expect(clampEditorPanePx(10, 1000)).toBe(240);
    expect(clampEditorPanePx(900, 1000)).toBe(760);
    expect(clampEditorPanePx(400, 1000)).toBe(400);
    expect(clampEditorPanePx(100, 300)).toBe(150);
  });
});
