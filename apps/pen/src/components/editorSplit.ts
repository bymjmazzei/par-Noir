/** Neither the editor nor the preview may collapse when the divider moves. */
export const EDITOR_PANE_MIN_PX = 240;

export function clampEditorPanePx(width: number, rowPx: number, min = EDITOR_PANE_MIN_PX): number {
  const row = Math.max(0, Math.round(rowPx));
  if (row <= min * 2) return Math.round(row / 2);
  const next = Math.round(width);
  return Math.min(row - min, Math.max(min, next));
}
