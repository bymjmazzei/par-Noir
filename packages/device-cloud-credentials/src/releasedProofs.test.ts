import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./knowledgeClaimDoc.js', () => ({ listDeviceKnowledgeClaims: vi.fn() }));
vi.mock('./deviceDriveFind.js', () => ({ findPnRootFolderId: vi.fn() }));

import { listDeviceKnowledgeClaims } from './knowledgeClaimDoc.js';
import { findPnRootFolderId } from './deviceDriveFind.js';
import { grantedDataPointIds, heldProofsFor } from './releasedProofs.js';

const claim = (dataPointId: string, extra: Record<string, unknown> = {}) => ({
  docId: 'd',
  templateId: 't',
  sourceDataPointId: dataPointId,
  dataPointId,
  proofType: 'zk',
  zkpProof: `proof-${dataPointId}`,
  verificationLevel: 'verified' as const,
  provider: 'p',
  verifiedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('grantedDataPointIds', () => {
  it('unions data points across active grants only', () => {
    const ids = grantedDataPointIds({
      a: { status: 'active', dataPoints: ['over_21'], requiredDataPoints: ['email_verified'] },
      b: { status: 'revoked', dataPoints: ['phone'] },
    });
    expect([...ids].sort()).toEqual(['email_verified', 'over_21']);
  });
});

describe('heldProofsFor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('releases only granted, unexpired proofs and never the source answers', async () => {
    vi.mocked(findPnRootFolderId).mockResolvedValue('root');
    vi.mocked(listDeviceKnowledgeClaims).mockResolvedValue([
      claim('over_21'),
      claim('phone'),
      claim('email_verified', { expiresAt: '2000-01-01T00:00:00.000Z' }),
    ]);

    const proofs = await heldProofsFor({
      accessToken: 'at',
      pnIdentifier: 'pn-releasetest',
      dataPointIds: ['over_21', 'email_verified'],
    });

    expect(proofs).toEqual([
      {
        dataPointId: 'over_21',
        proofType: 'zk',
        zkpProof: 'proof-over_21',
        verifiedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: undefined,
        verificationLevel: 'verified',
        provider: 'p',
      },
    ]);
    expect(listDeviceKnowledgeClaims).toHaveBeenCalledWith({ accessToken: 'at', pnFolderId: 'root' });
  });

  it('reads nothing when no data point is granted', async () => {
    await expect(
      heldProofsFor({ accessToken: 'at', pnIdentifier: 'pn-releasetest', dataPointIds: [] })
    ).resolves.toEqual([]);
    expect(findPnRootFolderId).not.toHaveBeenCalled();
  });

  it('returns nothing before the pN has a cloud root', async () => {
    vi.mocked(findPnRootFolderId).mockResolvedValue(null);
    await expect(
      heldProofsFor({ accessToken: 'at', pnIdentifier: 'pn-releasetest', dataPointIds: ['over_21'] })
    ).resolves.toEqual([]);
    expect(listDeviceKnowledgeClaims).not.toHaveBeenCalled();
  });
});
