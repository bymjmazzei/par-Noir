/**
 * Gate: public-media warm path must not R2-Head when metadata says warm.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('public-media warm path skips Head', () => {
  it('signs when r2Warm without awaiting feedR2Head on that branch', () => {
    const src = readFileSync(resolve(__dirname, './feedMediaRoutes.ts'), 'utf8');
    const helperStart = src.indexOf('async function signPublicMediaForFile');
    expect(helperStart).toBeGreaterThanOrEqual(0);
    const helperEnd = src.indexOf('export function registerFeedMediaRoutes', helperStart);
    const helper = src.slice(helperStart, helperEnd > helperStart ? helperEnd : undefined);
    expect(helper).toMatch(/ref\.r2Warm !== false/);
    expect(helper).toMatch(/Trust metadata warm flag/);
    const warmBlock = helper.slice(
      helper.indexOf('Trust metadata warm flag'),
      helper.indexOf('const key = ref.r2Key')
    );
    expect(warmBlock).not.toMatch(/feedR2Head/);
  });

  it('exposes batch-sign for first-screen posters', () => {
    const src = readFileSync(resolve(__dirname, './feedMediaRoutes.ts'), 'utf8');
    expect(src).toMatch(/app\.post\('\/api\/aggregator\/feed-media\/batch-sign'/);
    expect(src).toMatch(/slice\(0,\s*12\)/);
  });
});
