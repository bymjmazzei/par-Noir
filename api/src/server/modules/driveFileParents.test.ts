/**
 * @jest-environment node
 */
import { rejectPnRootFileParent } from './driveFileParents';

describe('rejectPnRootFileParent', () => {
  it('rejects a missing parent', () => {
    expect(rejectPnRootFileParent(undefined, 'pn-root').ok).toBe(false);
    expect(rejectPnRootFileParent([], 'pn-root').ok).toBe(false);
  });

  it('rejects the pN root as a file parent', () => {
    const decided = rejectPnRootFileParent(['pn-root'], 'pn-root');
    expect(decided.ok).toBe(false);
  });

  it('accepts a child folder', () => {
    expect(rejectPnRootFileParent(['files-folder'], 'pn-root')).toEqual({
      ok: true,
      parents: ['files-folder'],
    });
  });
});