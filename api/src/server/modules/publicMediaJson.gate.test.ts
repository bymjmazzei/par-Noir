/**
 * Gate: public-media must return JSON signed URL by default (not 302).
 * Browse cannot follow 302 with metering headers onto R2 without CORS breakage.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('public-media response shape', () => {
  it('returns JSON url by default; redirect only with ?redirect=1', () => {
    const src = readFileSync(resolve(__dirname, './feedMediaRoutes.ts'), 'utf8');
    expect(src).toMatch(/redirect=1/);
    expect(src).toMatch(/url:\s*signed\.url/);
    const redirectIdx = src.indexOf('res.redirect(302, signed.url)');
    expect(redirectIdx).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, redirectIdx - 200), redirectIdx);
    expect(before).toMatch(/redirect/);
  });
});
