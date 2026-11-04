/**
 * Held proofs come from the pN's Pen Knowledge claim docs (library index is newest-first).
 */
jest.mock('../modules/knowledgeProofsDrive', () => ({
  listKnowledgeProofs: jest.fn(),
}));

import { listKnowledgeProofs } from '../modules/knowledgeProofsDrive';
import { ZKPDataPointsService } from '../modules/zkpDataPointsService';

const listMock = listKnowledgeProofs as jest.Mock;
const bundle = { pnIdentifier: 'pn-abc', pnFolderId: 'pn-folder', token: { access_token: 'drive-token' } };
const proof = (dataPointId: string, zkpProof: string, expiresAt?: string) => ({
  dataPointId,
  proofType: 'age_verification',
  zkpProof,
  verifiedAt: '2026-01-01T00:00:00.000Z',
  expiresAt,
  verificationLevel: 'basic',
  provider: 'user_attested',
});

describe('ZKPDataPointsService held proofs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads Knowledge docs with the forwarded Drive token, newest doc wins, expired proofs drop', async () => {
    listMock.mockResolvedValue([
      proof('over_18', 'newer'),
      proof('over_18', 'older'),
      proof('over_21', 'stale', '2000-01-01T00:00:00.000Z'),
    ]);
    const held = await ZKPDataPointsService.getHeldProofs(bundle);
    expect(listMock).toHaveBeenCalledWith({
      token: bundle.token,
      pnFolderId: 'pn-folder',
      pnIdentifier: 'pn-abc',
      accountId: undefined,
    });
    expect(held.map((p) => [p.dataPointId, p.zkpProof])).toEqual([['over_18', 'newer']]);
    expect(await ZKPDataPointsService.getDataPointProof(bundle, 'over_21')).toBeNull();
    const available = await ZKPDataPointsService.getAvailableDataPoints(bundle);
    expect(available[0]).not.toHaveProperty('zkpProof');
  });

  it('reads nothing without a forwarded Drive token', async () => {
    expect(await ZKPDataPointsService.getHeldProofs({ ...bundle, token: undefined })).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });
});
