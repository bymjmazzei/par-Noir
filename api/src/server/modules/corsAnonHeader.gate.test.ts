/**
 * Gate: browse public-media sends X-PN-Anon-Id; CORS must allow it in preflight.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CORS allowedHeaders for feed metering', () => {
  it('allows X-PN-Anon-Id (browse fetchPublicMediaBlob)', () => {
    const src = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');
    const start = src.indexOf('allowedHeaders:');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('exposedHeaders:', start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toMatch(/['"]X-PN-Anon-Id['"]/);
  });
});
