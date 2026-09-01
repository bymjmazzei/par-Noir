/**
 * Falsification: publish/feed clients could exist in src/ but stay off the public
 * SDK entrypoint, breaking l5-community-starter and external integrators.
 */
import * as sdk from './index';

describe('integrator publish exports gate', () => {
  it('IntegratorPublishClient and IntegratorFeedClient are exported from identity-sdk index', () => {
    expect(sdk.IntegratorPublishClient).toBeDefined();
    expect(sdk.IntegratorFeedClient).toBeDefined();
    expect(typeof sdk.createIntegratorPublishClient).toBe('function');
    expect(typeof sdk.createIntegratorFeedClient).toBe('function');
  });
});
