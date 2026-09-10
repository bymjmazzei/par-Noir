/**
 * Falsify: preferCachedAccounts identity churn must not re-fetch /api/storage/accounts.
 * (Regression for the unlock accounts storm.)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE_SRC = resolve(HERE, 'useCloudReconnectGate.ts');

describe('useCloudReconnectGate source contracts', () => {
  const src = readFileSync(GATE_SRC, 'utf8');

  it('holds preferCachedAccounts in a ref (not refresh deps)', () => {
    expect(src).toMatch(/preferCachedAccountsRef/);
    expect(src).toMatch(/preferCachedAccountsRef\.current = preferCachedAccounts/);
    // refresh deps must not list preferCachedAccounts
    expect(src).toMatch(
      /}, \[enabled, authToken, pnIdentifier, apiEndpoint, isDismissed\]\);/
    );
  });

  it('exposes non-force refresh and refreshForced', () => {
    expect(src).toMatch(/refreshStable = useCallback\(\(\) => refresh\(\{ force: false \}\)/);
    expect(src).toMatch(/refreshForced = useCallback\(\(\) => refresh\(\{ force: true \}\)/);
  });

  it('reassesses local envelope when fetchKey is unchanged and !force', () => {
    expect(src).toMatch(/lastFetchKeyRef\.current === fetchKey/);
    expect(src).toMatch(/assessCloudSessionReadiness/);
  });

  it('does not auto-open prompt on linkedInactive (hydrate may still succeed)', () => {
    expect(src).not.toMatch(
      /if \(next === 'linkedInactive' && !isDismissed\(\)\) \{\s*setPromptOpen\(true\)/
    );
  });
});
