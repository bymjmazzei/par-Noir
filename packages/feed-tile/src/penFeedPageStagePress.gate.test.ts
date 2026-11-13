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

  it('paints revealed targets through the face shared with the Pen editor', () => {
    expect(stage).toMatch(/<PenLayerFace/);
    expect(stage).toMatch(/buildActionOverlayAtTime\(\s*actionSection,\s*overlayTime,/);
  });

  it('samples action layers on the same clock the loop wraps on', () => {
    expect(stage).toMatch(/\.\.\.penFeedPage\.actionSection,\s*timelineDurationSec: duration/);
  });

  it('surface exposes onEffect, not the raw message', () => {
    expect(surface).toMatch(/onEffect\?: \(effect: PenActionEffect\) => void/);
    expect(surface).not.toMatch(/onAction/);
  });
});
