/**
 * Unit: public template allowlist bypass (VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('penVerified allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails closed when allowlist empty', async () => {
    vi.stubEnv('VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST', '');
    const { canPublishPublicTemplate } = await import('./services/penVerified');
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: `did:pn:${HASH_A}` })
    ).toBe(false);
  });

  it('allows listed pnIdentifier across pn- / did:pn aliases', async () => {
    vi.stubEnv(
      'VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST',
      `did:pn:${HASH_A}, pn-${HASH_B}`
    );
    const { canPublishPublicTemplate, isVerifiedAuthor } = await import(
      './services/penVerified'
    );
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: `did:pn:${HASH_A}` })
    ).toBe(true);
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: `pn-${HASH_A}` })
    ).toBe(true);
    expect(isVerifiedAuthor({ accessToken: 't', pnIdentifier: `did:pn:${HASH_B}` })).toBe(
      true
    );
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: `pn-${HASH_A.slice(0, 63)}f` })
    ).toBe(false);
  });
});
