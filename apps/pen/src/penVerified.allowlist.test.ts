/**
 * Unit: public template allowlist bypass (VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('penVerified allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('fails closed when allowlist empty', async () => {
    vi.stubEnv('VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST', '');
    const { canPublishPublicTemplate } = await import('./services/penVerified');
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: 'did:key:abc' })
    ).toBe(false);
  });

  it('allows listed pnIdentifier only', async () => {
    vi.stubEnv(
      'VITE_PEN_PUBLIC_TEMPLATE_ALLOWLIST',
      'did:key:system-a, did:key:system-b'
    );
    const { canPublishPublicTemplate, isVerifiedAuthor } = await import(
      './services/penVerified'
    );
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: 'did:key:system-a' })
    ).toBe(true);
    expect(isVerifiedAuthor({ accessToken: 't', pnIdentifier: 'did:key:system-b' })).toBe(
      true
    );
    expect(
      canPublishPublicTemplate({ accessToken: 't', pnIdentifier: 'did:key:other' })
    ).toBe(false);
  });
});
