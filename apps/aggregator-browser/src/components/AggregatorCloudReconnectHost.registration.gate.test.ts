/**
 * Gate: browse cloud reconnect must register server layout (not vault-only).
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, 'AggregatorCloudReconnectHost.tsx'), 'utf8');

describe('AggregatorCloudReconnectHost server registration', () => {
  it('calls ensureServerCloudRegistration after vault persist', () => {
    expect(src).toContain('ensureServerCloudRegistration');
    expect(src).toContain('persistConnected');
  });
});
