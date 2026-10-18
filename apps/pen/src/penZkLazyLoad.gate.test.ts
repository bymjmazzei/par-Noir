/**
 * Gate: genSTARK (via zk-protocol-v2) reads __dirname at module load. Pen home must not
 * load it eagerly, and the browser bundle must shim the Node globals for when it does.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), 'utf8');

describe('ZK v2 lazy load', () => {
  it('shims __dirname and __filename in the browser bundle', () => {
    const config = read('../vite.config.ts');
    expect(config).toContain("__dirname: JSON.stringify('/')");
    expect(config).toContain("__filename: JSON.stringify('/index.js')");
  });

  it('keeps zk-protocol-v2 off the home page import graph', () => {
    const license = read('services/licensePurchase.ts');
    const publish = read('services/penPublish.ts');
    expect(license).not.toMatch(/from ['"]@par-noir\/zk-protocol-v2['"]/);
    expect(publish).not.toMatch(/from ['"]\.\/openContractProofs['"]/);
    expect(license).toContain("await import('@par-noir/zk-protocol-v2')");
    expect(publish).toContain("await import('./openContractProofs')");
  });
});
