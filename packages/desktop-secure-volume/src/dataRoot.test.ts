import { describe, expect, it } from 'vitest';
import os from 'os';
import path from 'path';
import {
  defaultApplicationSupportRoot,
  PN_DESKTOP_DATA_DIR_NAME,
  resolvePnDesktopDataRoot
} from './dataRoot';
import {
  isPathUnderPenTree,
  penDraftPath,
  penTreeRoot,
  PEN_TREE_DIR
} from './penTree';

describe('resolvePnDesktopDataRoot', () => {
  it('uses PN_DATA_ROOT when set', () => {
    const root = resolvePnDesktopDataRoot({
      env: { PN_DATA_ROOT: '/tmp/pn-test-root' } as NodeJS.ProcessEnv,
      mkdir: false
    });
    expect(root).toBe(path.resolve('/tmp/pn-test-root'));
  });

  it('defaults under Application Support named par Noir', () => {
    const def = defaultApplicationSupportRoot();
    expect(def.endsWith(PN_DESKTOP_DATA_DIR_NAME)).toBe(true);
    expect(def.startsWith(os.homedir())).toBe(true);
  });
});

describe('penTree paths', () => {
  it('nests under par-noir-pen', () => {
    expect(penTreeRoot('/Volumes/pn')).toBe(path.join('/Volumes/pn', PEN_TREE_DIR));
    expect(penDraftPath('/Volumes/pn', 'doc1')).toBe(
      path.join('/Volumes/pn', PEN_TREE_DIR, 'doc1', 'draft.enc')
    );
  });

  it('allows only paths under the pen tree', () => {
    const mount = '/Volumes/pn';
    expect(isPathUnderPenTree(mount, path.join(mount, PEN_TREE_DIR, 'a'))).toBe(true);
    expect(isPathUnderPenTree(mount, path.join(mount, 'other'))).toBe(false);
    expect(isPathUnderPenTree(mount, path.join(mount, PEN_TREE_DIR, '..', 'escape'))).toBe(false);
  });
});
