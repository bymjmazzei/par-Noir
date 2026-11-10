/**
 * Gate: opening a post on a creator feed (Discover, Search, shared link) uses a dedicated
 * pending target resolved against the rendered list, and FullScreenFeed actually scrolls there.
 * Falsifies: post opens landing on the top of the creator feed; share copying a second time.
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

describe('creator feed open-to-post', () => {
  it('App routes post opens and post links through pendingCreatorFileId, not visibleFileId', () => {
    const src = read('App.tsx');
    const opener = src.match(/const openPostOnCreatorFeed = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] ?? '';
    expect(opener).toMatch(/setPendingCreatorFileId\(fileId\)/);
    expect(opener).not.toMatch(/setVisibleFileId/);
    expect(src).toMatch(/openPostOnCreatorFeed\(creatorParam, fileParam\)/);
    expect(src).not.toMatch(/isNavigatingToFileRef|lastNavigatedFileIdRef/);
  });

  it('useMePageData resolves the target index from filteredMeFiles', () => {
    const src = read('hooks/useMePageData.ts');
    expect(src).toMatch(/filteredMeFiles\.findIndex\(\(f\) => f\.metadata\.fileId === pendingCreatorFileId\)/);
    expect(src).not.toMatch(/visibleFileId/);
  });

  it('FullScreenFeed commits prev index only after the scroll runs', () => {
    const src = read('components/FullScreenFeed.tsx');
    const effect = src.match(/\/\/ Scroll to current index when it changes[\s\S]*?\}, \[currentIndex, files/)?.[0] ?? '';
    const scrollAt = effect.indexOf('scrollIntoView(');
    const commitAt = effect.indexOf('prevIndexRef.current = currentIndex');
    expect(scrollAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(scrollAt);
  });
});

describe('post share links', () => {
  it('only utils/postLink.ts builds post links or opens a share sheet', () => {
    const offenders = sourceFiles(root)
      .filter((p) => !p.endsWith('postLink.ts'))
      .filter((p) => {
        const src = readFileSync(p, 'utf8');
        return /\?file=\$\{/.test(src) || /navigator\.share\(|Share\.share\(/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
