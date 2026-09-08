/**
 * @jest-environment jsdom
 *
 * Gate: dashboard must use owner inventory reconcile, not the removed
 * public-aggregator-only client path.
 */
import fs from 'fs';
import path from 'path';

describe('owner inventory reconcile client gate', () => {
  const dashboardSrc = path.join(__dirname, '..');

  function walkTsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkTsFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('does not import removed ownerPublicReconcile module', () => {
    const files = walkTsFiles(dashboardSrc).filter(
      (f) => !f.includes(`${path.sep}__tests__${path.sep}`)
    );
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('ownerPublicReconcile') || text.includes('reconcileOwnerPublicAggregator')) {
        offenders.push(path.relative(dashboardSrc, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('wires reconcileOwnerInventory from ownerInventoryReconcile', () => {
    const layoutInit = fs.readFileSync(
      path.join(dashboardSrc, 'components/storage/hooks/useDriveLayoutInit.ts'),
      'utf8'
    );
    const loadFiles = fs.readFileSync(
      path.join(dashboardSrc, 'components/storage/hooks/useLoadAggregatedFiles.ts'),
      'utf8'
    );
    expect(layoutInit).toContain('ownerInventoryReconcile');
    expect(layoutInit).toContain('reconcileOwnerInventory');
    expect(loadFiles).toContain('reconcileOwnerInventory');
  });
});
