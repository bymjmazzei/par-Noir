/**
 * Gate: the metadata index is Postgres-only. Owner files and their companion
 * metadata live in the owner's cloud and are written by the owner's device.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('metadata-index never touches the owner cloud', () => {
  it('has no Drive client, companion sync, or forwarded cloud token', () => {
    const src = readFileSync(resolve(__dirname, './aggregatorRoutes.ts'), 'utf8');
    for (const forbidden of [
      'googleapis',
      'googleDriveProxy',
      'CompanionMetadata',
      'createStorageRequestContext',
      'X-PN-Cloud-Access-Token',
      'resolveOwnerDriveToken',
    ]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
