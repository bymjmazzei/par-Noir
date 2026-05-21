import { PN_INTEGRATOR_SCOPES, SCOPE_CLOUD_APP, SCOPE_OPENID } from '../src/integrator/pnApiClient';

describe('pnApiClient scopes', () => {
  it('exports integrator scopes', () => {
    expect(SCOPE_CLOUD_APP).toBe('cloud:app');
    expect(SCOPE_OPENID).toBe('openid');
    expect(PN_INTEGRATOR_SCOPES).toContain('cloud:app');
  });
});
