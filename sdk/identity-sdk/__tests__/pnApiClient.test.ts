import {
  PN_INTEGRATOR_SCOPES,
  SCOPE_CLOUD_APP,
  SCOPE_OPENID,
  integratorAuthHeaders
} from '../src/integrator/pnApiClient';

describe('pnApiClient scopes', () => {
  it('exports integrator scopes', () => {
    expect(SCOPE_CLOUD_APP).toBe('cloud:app');
    expect(SCOPE_OPENID).toBe('openid');
    expect(PN_INTEGRATOR_SCOPES).toContain('cloud:app');
  });
});

describe('integratorAuthHeaders', () => {
  it('accepts access token string for back compat', () => {
    const headers = integratorAuthHeaders('tok-1') as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-1');
    expect(headers['X-PN-Cloud-Access-Token']).toBeUndefined();
  });

  it('adds cloud token when present on context', () => {
    const headers = integratorAuthHeaders({
      accessToken: 'tok-1',
      cloudAccessToken: 'cloud-1'
    }) as Record<string, string>;
    expect(headers['X-PN-Cloud-Access-Token']).toBe('cloud-1');
  });
});
