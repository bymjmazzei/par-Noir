/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('owner-catalog route gate', () => {
  it('registers GET /api/aggregator/owner-catalog with owner self gate', () => {
    const src = readFileSync(resolve(__dirname, 'aggregatorRoutes.ts'), 'utf8');
    expect(src).toContain("app.get('/api/aggregator/owner-catalog'");
    expect(src).toContain('gateOwnerSelfRoute');
    expect(src).toContain('listOwnerCatalog');
  });

  it('listOwnerCatalog filters collection parts via aggregator-domain', () => {
    const src = readFileSync(resolve(__dirname, 'aggregatorMetadataServiceDB.ts'), 'utf8');
    expect(src).toContain('isAggregatorCollectionPart');
    expect(src).toContain('async listOwnerCatalog');
  });
});
