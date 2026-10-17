import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const surface = readFileSync(resolve(root, 'FeedTileSurface.tsx'), 'utf8');
const stage = readFileSync(resolve(root, 'PenFeedPageStage.tsx'), 'utf8');

describe('FeedTileSurface feed layout', () => {
  it('contain-fits the size container instead of the 22rem phone mock', () => {
    expect(surface).toMatch(/layout\?: 'preview' \| 'feed'/);
    expect(surface).toMatch(/min\(100cqw, calc\(100cqh \* \$\{ratio\}\)\)/);
    expect(surface).toMatch(/feed\s*\?\s*''\s*:\s*compact/);
  });

  it('never crops media in feed layout', () => {
    expect(surface).toMatch(/const fit: MediaFit = feed \? 'contain' : 'cover'/);
    expect(surface).not.toMatch(/className="h-full w-full \[&_video\]:object-cover"/);
    expect(surface).not.toMatch(/className="absolute inset-0 h-full w-full object-cover"/);
    expect(stage).toMatch(/fit === 'contain'/);
    expect(stage).not.toMatch(/className="absolute inset-0 h-full w-full object-cover"/);
  });

  it('leaves the caption to the host in feed layout', () => {
    expect(surface).toMatch(/\{feed \? null : \(\s*<div className="pen-feed-tile-caption/);
  });
});
