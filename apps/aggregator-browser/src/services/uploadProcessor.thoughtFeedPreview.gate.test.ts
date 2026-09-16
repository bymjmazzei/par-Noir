/**
 * Gate: public single-page thoughts must publish CDN feedPoster before metadata create.
 * Fails closed on feed_poster_required if this wire-up is removed.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, 'uploadProcessor.ts'), 'utf8');

function sliceBetween(haystack: string, startMarker: string, endMarker: string): string {
  const start = haystack.indexOf(startMarker);
  const end = haystack.indexOf(endMarker, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return haystack.slice(start, end);
}

describe('single-page thought feed preview wire-up', () => {
  it('processTextPostUpload calls publishFeedPreviews for public thoughts', () => {
    const body = sliceBetween(
      src,
      'async function processTextPostUpload(',
      'async function processMultiPageUpload('
    );
    expect(body).toContain('publishFeedPreviews(');
    expect(body).toContain("mimeType: 'image/png'");
    expect(body).toContain('file: thumbnailBlob');
    expect(body).toContain('...feedPreviewFields');
    expect(body).toMatch(/if\s*\(\s*isPublic\s*\)/);
  });

  it('processMultiPageUpload still publishes feed previews (regression)', () => {
    const body = sliceBetween(
      src,
      'async function processMultiPageUpload(',
      'async function processPDFUpload('
    );
    expect(body).toContain('publishFeedPreviews(');
    expect(body).toContain('...feedPreviewFields');
  });
});
