import type { PenPagePresentation } from './types.js';

/** Default Note card chrome (browse / Pen Mini social compile). */
export function defaultPagePresentation(): PenPagePresentation {
  return {
    fontFamily: 'Georgia',
    fontSize: 48,
    textColor: '#FFFFFF',
    textStyle: 'plain',
    dropShadowColor: '#000000',
    dropShadowBlur: 10,
    dropShadowOffsetX: 2,
    dropShadowOffsetY: 2,
    backgroundColor: '#000000',
    textAlign: 'center',
    padding: 40
  };
}

/** Editor page surface (letter/A4/flow preview) — no fill until the user sets one. */
export function defaultEditorPagePresentation(): PenPagePresentation {
  return {
    fontFamily: 'Georgia',
    fontSize: 16,
    textColor: '#000000',
    textStyle: 'plain',
    dropShadowColor: '#000000',
    dropShadowBlur: 0,
    dropShadowOffsetX: 0,
    dropShadowOffsetY: 0,
    backgroundColor: 'transparent',
    textAlign: 'left',
    padding: 40
  };
}

export function mergePagePresentation(
  base?: PenPagePresentation | null,
  override?: Partial<PenPagePresentation> | null
): PenPagePresentation {
  return { ...defaultPagePresentation(), ...(base || {}), ...(override || {}) };
}
