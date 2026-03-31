jest.mock('@par-noir/zk-protocol-v1', () => ({
  verifyZkProofEnvelopeV1: jest.fn(),
  decodeEnvelopeFromProofString: jest.fn(),
  isZkProofEnvelopeV1: jest.fn(),
  ageBucketMeetsMinimum: jest.fn(),
}));

import {
  verifyZkProofEnvelopeV1,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  ageBucketMeetsMinimum,
} from '@par-noir/zk-protocol-v1';
import { ZKPDataPointsService } from '../modules/zkpDataPointsService';

const verifyMock = verifyZkProofEnvelopeV1 as jest.Mock;
const decodeMock = decodeEnvelopeFromProofString as jest.Mock;
const isEnvMock = isZkProofEnvelopeV1 as jest.Mock;
const ageMock = ageBucketMeetsMinimum as jest.Mock;

describe('ZKPDataPointsService.verifyProof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects crypto-invalid proofs', async () => {
    verifyMock.mockReturnValue({ ok: false, reason: 'verify_failed' });
    const r = await ZKPDataPointsService.verifyProof('bad-proof', 'age >= 18');
    expect(r.isValid).toBe(false);
    expect(r.error).toBe('verify_failed');
  });

  it('rejects proof type mismatch for age condition', async () => {
    verifyMock.mockReturnValue({ ok: true });
    decodeMock.mockReturnValue({
      type: 'modp_fs_nizk_ml_dsa_binding_v1',
      expires_at_ms: Date.now() + 10000,
      public_inputs: { zkp_type: 'identity_verification', age_bucket: '30_39' },
    });
    isEnvMock.mockReturnValue(true);
    const r = await ZKPDataPointsService.verifyProof('proof', 'age >= 18');
    expect(r.isValid).toBe(false);
    expect(r.error).toBe('proof_type_mismatch');
  });

  it('rejects malformed age condition', async () => {
    verifyMock.mockReturnValue({ ok: true });
    decodeMock.mockReturnValue({
      type: 'modp_fs_nizk_ml_dsa_binding_v1',
      expires_at_ms: Date.now() + 10000,
      public_inputs: { zkp_type: 'age_verification', age_bucket: '30_39' },
    });
    isEnvMock.mockReturnValue(true);
    const r = await ZKPDataPointsService.verifyProof('proof', 'age >= nope');
    expect(r.isValid).toBe(false);
    expect(r.error).toBe('invalid_condition');
  });

  it('accepts valid age bucket when threshold passes', async () => {
    verifyMock.mockReturnValue({ ok: true });
    decodeMock.mockReturnValue({
      type: 'modp_fs_nizk_ml_dsa_binding_v1',
      expires_at_ms: Date.now() + 10000,
      public_inputs: { zkp_type: 'age_verification', age_bucket: '30_39' },
    });
    isEnvMock.mockReturnValue(true);
    ageMock.mockReturnValue(true);
    const r = await ZKPDataPointsService.verifyProof('proof', 'age >= 18');
    expect(r.isValid).toBe(true);
  });
});

