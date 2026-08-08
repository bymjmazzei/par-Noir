/**
 * Guardrail: caller Drive tokens must not be built from empty custody shells.
 * Prefer resolveOwnerDriveToken / requireOwnerDriveContextFromReq.
 */

import { describe, expect, it } from '@jest/globals';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const MODULES_DIR = join(__dirname);
const ALLOWLIST = new Set([
  // Helper itself documents the pattern; implementations use resolveOwnerDriveToken.
  'ownerDriveToken.ts',
  'ownerDriveContext.ts',
  // Storage layout / migration may still read shell shapes for stripping — not request handlers.
  'storageCredentialsService.ts',
  'deviceCloudCustody.ts'
]);

/** Matches the classic broken pattern in route handlers. */
const SHELL_TOKEN_RE =
  /access_token:\s*account\??\.(?:access_token|accessToken)\s*\|\|\s*account\??\.(?:accessToken|access_token)\s*\|\|\s*['"]['"]/;

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.test.ts') || name.endsWith('.test.js')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walkTsFiles(p));
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

describe('owner Drive token custody guardrail', () => {
  it('does not introduce new empty-shell access_token constructions in route modules', () => {
    const files = walkTsFiles(MODULES_DIR).filter((f) => {
      const base = f.split(/[/\\]/).pop() || '';
      return !ALLOWLIST.has(base) && (base.endsWith('Routes.ts') || base.includes('Routes/'));
    });
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (SHELL_TOKEN_RE.test(text)) {
        offenders.push(file.replace(MODULES_DIR + '/', ''));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('storageIndexRoutes uses resolveOwnerDriveToken (no empty-shell builder)', () => {
    const file = join(MODULES_DIR, 'storage', 'storageIndexRoutes.ts');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/resolveOwnerDriveToken/);
    expect(text).not.toMatch(/function buildDriveTokenFromAccount/);
    expect(SHELL_TOKEN_RE.test(text)).toBe(false);
  });

  it('recoveryDriveContext refuses empty access tokens (throws CLOUD_TOKEN_REQUIRED)', () => {
    const file = join(MODULES_DIR, 'recoveryDriveContext.ts');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/CLOUD_TOKEN_REQUIRED/);
    expect(SHELL_TOKEN_RE.test(text)).toBe(false);
  });
});
