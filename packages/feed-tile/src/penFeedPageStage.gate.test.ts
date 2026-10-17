import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));

describe('PenFeedPageStage overlay clock', () => {
  it('uses videoTime for still pages', () => {
    const src = readFileSync(resolve(root, 'PenFeedPageStage.tsx'), 'utf8');
    expect(src).toMatch(/externalClockSec != null \? externalClockSec : videoTime/);
    expect(src).not.toMatch(/mediaKind === 'video' \? videoTime : 0/);
  });
});
