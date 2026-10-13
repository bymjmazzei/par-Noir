/**
 * Gate: browse public-media sends X-PN-Anon-Id; CORS must allow it in preflight.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function corsAllowedHeadersBlock(): string {
  const src = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');
  const start = src.indexOf('allowedHeaders:');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf('exposedHeaders:', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('CORS allowedHeaders for feed metering', () => {
  it('allows X-PN-Anon-Id (browse fetchPublicMediaBlob)', () => {
    const block = corsAllowedHeadersBlock();
    expect(block).toMatch(/['"]X-PN-Anon-Id['"]/);
  });
});

describe('CORS allowedHeaders for device cloud custody', () => {
  it('allows X-PN-Cloud-Access-Token (dashboard/browse POST storage/initialize)', () => {
    const block = corsAllowedHeadersBlock();
    expect(block).toMatch(/['"]X-PN-Cloud-Access-Token['"]/);
  });
});
