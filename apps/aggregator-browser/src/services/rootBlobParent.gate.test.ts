/**
 * Browse uploads name a content child folder. They do not use the pN root.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('browse blob parents', () => {
  it('uploadProcessor sends notes, media, and collections under content/', () => {
    const src = readFileSync(resolve(here, 'uploadProcessor.ts'), 'utf8');
    expect(src).toContain("blobClass: 'notes'");
    expect(src).toContain("blobClass: 'collections'");
    expect(src).toContain('parents: [parentId]');
    expect(src).not.toContain('finalParents = [index.pnFolderId]');
  });

  it('lists Me from content class folders', () => {
    const src = readFileSync(resolve(here, 'storageApiClient.ts'), 'utf8');
    expect(src).toContain('contentNotesFolderId');
    expect(src).toContain('contentMediaFolderId');
    expect(src).toContain('contentCollectionsFolderId');
  });
});
