/**
 * Falsification gate: demo JWT / mock decryptIdentity must not return to identity-crypto.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IdentityCrypto } from './identityCrypto';

const SRC = join(dirname(fileURLToPath(import.meta.url)), 'identityCrypto.ts');

describe('no demo identity crypto', () => {
  it('source must not contain demo HMAC or mock-did stubs', () => {
    const src = readFileSync(SRC, 'utf8');
    expect(src).not.toMatch(/in production,\s*use proper HMAC/i);
    expect(src).not.toMatch(/simple hash for demo/i);
    expect(src).not.toMatch(/mock-did/);
    expect(src).not.toMatch(/Mock User/);
    expect(src).not.toMatch(/alg:\s*['"]HS256['"]/);
  });

  it('decryptIdentity throws instead of returning mock identity', async () => {
    await expect(IdentityCrypto.decryptIdentity('pk', 'pass')).rejects.toThrow(
      /not supported/
    );
  });

  it('verifyAuthToken throws instead of accepting unsigned JWT payloads', async () => {
    await expect(IdentityCrypto.verifyAuthToken('a.b.c', 'did:key:x')).rejects.toThrow(
      /not supported/
    );
  });
});
