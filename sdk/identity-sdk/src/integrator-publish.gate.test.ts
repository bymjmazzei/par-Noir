/**
 * Falsification: publish/feed clients could exist in src/ but stay off the public
 * SDK entrypoint, breaking l5-community-starter and external integrators.
 * Also guards content-expiry fields on PublicMetadataSubmission (re-exported).
 */
import * as sdk from './index';
import type { PublicMetadataSubmission } from '@par-noir/aggregator-domain';

describe('integrator publish exports gate', () => {
  it('IntegratorPublishClient and IntegratorFeedClient are exported from identity-sdk index', () => {
    expect(sdk.IntegratorPublishClient).toBeDefined();
    expect(sdk.IntegratorFeedClient).toBeDefined();
    expect(typeof sdk.createIntegratorPublishClient).toBe('function');
    expect(typeof sdk.createIntegratorFeedClient).toBe('function');
  });

  it('PublicMetadataSubmission accepts ttlSeconds / expiresAt / persistOnDiscover', () => {
    const sample: PublicMetadataSubmission = {
      fileId: 'f',
      backend: 'google_drive',
      backendFileId: 'f',
      name: 'n',
      isPublic: true,
      uploadDate: new Date().toISOString(),
      ttlSeconds: 172800,
      expiresAt: null,
      persistOnDiscover: false
    };
    expect(sample.ttlSeconds).toBe(172800);
    expect(sample.persistOnDiscover).toBe(false);
  });
});
