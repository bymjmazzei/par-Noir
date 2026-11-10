/**
 * Gate: opening a post on a creator feed uses a dedicated pending target resolved
 * against the rendered list — never visibleFileId, which the autoplay observer overwrites.
 * Falsifies: Discover/Search post opens landing on the top of the creator feed.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);

describe('creator feed open-to-post', () => {
  it('App routes post opens through pendingCreatorFileId, not visibleFileId', () => {
    const src = readFileSync(resolve(root, 'App.tsx'), 'utf8');
    const handler = src.match(/const openFileOnCreatorFeed = useCallback\([\s\S]*?\}, \[\]\);/)?.[0] ?? '';
    expect(handler).toMatch(/setPendingCreatorFileId\(file\.metadata\.fileId\)/);
    expect(handler).not.toMatch(/setVisibleFileId/);
    expect(src).not.toMatch(/isNavigatingToFileRef|lastNavigatedFileIdRef/);
  });

  it('useMePageData resolves the target index from filteredMeFiles', () => {
    const src = readFileSync(resolve(root, 'hooks/useMePageData.ts'), 'utf8');
    expect(src).toMatch(/filteredMeFiles\.findIndex\(\(f\) => f\.metadata\.fileId === pendingCreatorFileId\)/);
    expect(src).not.toMatch(/visibleFileId/);
  });
});
