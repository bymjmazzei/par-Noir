/**
 * @jest-environment node
 */
import { normalizePnIdentifier } from '../modules/driveMetadataHelper';

describe('driveMetadataHelper', () => {
  it('normalizePnIdentifier adds pn- prefix', () => {
    expect(normalizePnIdentifier('abc123')).toBe('pn-abc123');
    expect(normalizePnIdentifier('pn-abc123')).toBe('pn-abc123');
  });
});

describe('integratorDataPointService BLOCKED list', () => {
  it('blocks sensitive data point ids', async () => {
    const { fetchGrantedZkpProofs } = await import('../modules/integratorDataPointService');
    const proofs = await fetchGrantedZkpProofs({
      userPnIdentifier: 'pn-nonexistent-user-xyz',
      clientId: 'test-client',
      dataPointIds: ['pn_name', 'passcode', 'age_attestation']
    });
    expect(proofs).toEqual([]);
  });
});
