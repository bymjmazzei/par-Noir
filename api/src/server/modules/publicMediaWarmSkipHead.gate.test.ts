/**
 * Gate: public-media warm path must not R2-Head when metadata says warm.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('public-media warm path skips Head', () => {
  it('signs when r2Warm without awaiting feedR2Head on that branch', () => {
    const src = readFileSync(resolve(__dirname, './feedMediaRoutes.ts'), 'utf8');
    const handlerStart = src.indexOf("app.get('/api/aggregator/public-media/:fileId'");
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    const handlerEnd = src.indexOf("app.post('/api/aggregator/feed-media/:fileId/revoke'", handlerStart);
    const handler = src.slice(handlerStart, handlerEnd > handlerStart ? handlerEnd : undefined);
    expect(handler).toMatch(/ref\.r2Warm !== false/);
    expect(handler).toMatch(/Trust metadata warm flag/);
    // Head may still exist for confirm-upload; must not appear as warm-path probe before sign.
    const warmBlock = handler.slice(
      handler.indexOf('Trust metadata warm flag'),
      handler.indexOf('const key = ref.r2Key')
    );
    expect(warmBlock).not.toMatch(/feedR2Head/);
  });
});
