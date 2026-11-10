/**
 * Gate: share buttons open ShareMenu (Copy link, Send to connections, More options) instead of
 * copying on click; only a sent DM or a completed system share is counted; one toast display.
 * Falsifies: share counted on click, silent copy with no options, invisible "Link copied" toast.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : [];
  });
}

describe('share menu', () => {
  it.each([
    'components/FeedEngagementSidebar.tsx',
    'components/EngagementActions.tsx',
    'components/EngagementOverlay.tsx',
  ])('%s opens ShareMenu and does not share directly', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/<ShareMenu/);
    expect(src).not.toMatch(/sharePostLink/);
  });

  it('copying a link does not count as a share', () => {
    const src = read('components/ShareMenu.tsx');
    const copy = src.match(/const handleCopy = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(copy).toMatch(/sharePostLink\(file, 'copy'\)/);
    expect(copy).not.toMatch(/onShared/);
    const sheet = src.match(/const handleSheet = async \(\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(sheet).toMatch(/result === 'shared'\) \{\s*onShared\(\)/);
  });

  it('a single ToastContainer renders all toasts', () => {
    const renderers = sourceFiles(root)
      .filter((p) => /<ToastContainer/.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(root.length + 1));
    expect(renderers).toEqual(['contexts/ToastContext.tsx']);
  });
});
