/**
 * Gate: device-cloud owners index via Postgres without server Drive companion sync.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('metadata-index device-cloud companion', () => {
  it('does not fail PUT when companion sync is skipped on device-cloud', () => {
    const src = readFileSync(resolve(__dirname, './aggregatorRoutes.ts'), 'utf8');
    expect(src).toContain('Device-cloud Google owner — companion create skipped');
    expect(src).toContain('Companion field sync failed (non-blocking)');
    expect(src).not.toContain(
      'Companion metadata update failed. This is the source of truth, so the update cannot proceed.'
    );
  });
});
