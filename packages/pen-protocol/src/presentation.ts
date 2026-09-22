import type { PenPagePresentation } from './types.js';

/** Default Note card chrome (browse / Pen Mini). */
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

export function mergePagePresentation(
  base?: PenPagePresentation | null,
  override?: Partial<PenPagePresentation> | null
): PenPagePresentation {
  return { ...defaultPagePresentation(), ...(base || {}), ...(override || {}) };
}
