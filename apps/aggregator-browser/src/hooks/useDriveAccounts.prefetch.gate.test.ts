/**
 * Gate: useDriveAccounts must retry when unlock prefetch completes (hard-reload race).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, 'useDriveAccounts.ts'), 'utf8');

describe('useDriveAccounts prefetch retry', () => {
  it('listens for pn_unlock_prefetch_complete and reloads accounts', () => {
    expect(src).toContain("addEventListener('pn_unlock_prefetch_complete'");
    expect(src).toContain('isUnlockPrefetchComplete');
    expect(src).toContain('loadAccounts');
  });
});
