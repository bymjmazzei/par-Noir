/** How an embedded post handles a button press. */

import type { PenActionEffect } from '@par-noir/pen-protocol';

/**
 * Votes and widget rows are signed by the viewer's pN. An embed on another site has
 * no signed-in viewer, so those open the post on par Noir; every other effect runs in place.
 */
export function embedEffectNeedsSignIn(effect: PenActionEffect, signedIn: boolean): boolean {
  if (signedIn) return false;
  return effect.kind === 'vote' || effect.kind === 'widget_row';
}

export function openPostInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
