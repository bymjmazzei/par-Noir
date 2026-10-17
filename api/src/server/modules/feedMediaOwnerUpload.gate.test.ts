/**
 * Gate: Pen and other browser clients can warm R2 without cross-origin PUT.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('feed-media owner-upload', () => {
  it('registers authenticated server-side R2 upload route', () => {
    const src = readFileSync(resolve(__dirname, './feedMediaRoutes.ts'), 'utf8');
    expect(src).toContain("app.post('/api/aggregator/feed-media/owner-upload'");
    expect(src).toContain('feedR2Put(key, buffer, contentType)');
  });
});
