import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const stage = readFileSync(resolve(root, 'PenFeedPageStage.tsx'), 'utf8');
const surface = readFileSync(resolve(root, 'FeedTileSurface.tsx'), 'utf8');

describe('PenFeedPageStage press path', () => {
  it('runs every press through the shared engine and hands the effect to the host', () => {
    expect(stage).toMatch(/pressPenAction\(/);
    expect(stage).toMatch(/onEffect\?\.\(result\.effect\)/);
    expect(stage).not.toMatch(/type: 'pen-action'/);
  });

  it('paints inputs and revealed targets', () => {
    expect(stage).toMatch(/widgetElement === 'input'/);
    expect(stage).toMatch(/buildActionOverlayAtTime\(penFeedPage\.actionSection, overlayTime, viewer\.revealed\)/);
  });

  it('surface exposes onEffect, not the raw message', () => {
    expect(surface).toMatch(/onEffect\?: \(effect: PenActionEffect\) => void/);
    expect(surface).not.toMatch(/onAction/);
  });
});
