/**
 * Falsification: Drive owner routes would 401/403 when integrator clients omit
 * X-PN-Cloud-Access-Token even though Bearer OAuth is valid.
 */
import { integratorAuthHeaders } from './integrator/pnApiClient';

describe('integratorAuthHeaders gate', () => {
  it('integratorAuthHeaders attaches X-PN-Cloud-Access-Token when cloudAccessToken provided', () => {
    const headers = integratorAuthHeaders({
      accessToken: 'oauth-bearer',
      cloudAccessToken: 'cloud-at-123',
    });

    expect(headers).toMatchObject({
      Authorization: 'Bearer oauth-bearer',
      'X-PN-Cloud-Access-Token': 'cloud-at-123',
    });
  });

  it('integratorAuthHeaders omits cloud header for bare access token string', () => {
    const headers = integratorAuthHeaders('oauth-only');
    expect(headers).toEqual({ Authorization: 'Bearer oauth-only' });
    expect(headers).not.toHaveProperty('X-PN-Cloud-Access-Token');
  });
});
