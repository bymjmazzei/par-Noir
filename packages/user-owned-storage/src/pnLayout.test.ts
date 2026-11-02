import { describe, expect, it } from 'vitest';
import { PN_DRIVE_ROOT_PROPERTY, pnDriveRootFolderName, pnRootFolderName } from './pnLayout.js';

const HEX = '3f9a1c2e' + '0'.repeat(56);

describe('pN root names', () => {
  it('Drive root shows the first 8 hex; portable prefixes keep the full id', () => {
    expect(pnDriveRootFolderName(`pn-${HEX}`)).toBe('par Noir 3f9a1c2e');
    expect(pnDriveRootFolderName(HEX)).toBe('par Noir 3f9a1c2e');
    expect(pnRootFolderName(HEX)).toBe(`par-noir-pn-${HEX}`);
    expect(PN_DRIVE_ROOT_PROPERTY).toBe('pnId');
  });
});
