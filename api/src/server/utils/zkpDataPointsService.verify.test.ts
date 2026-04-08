jest.mock('@par-noir/zk-protocol-v1', () => ({
  verifyZkProofEnvelopeV1: jest.fn(),
  decodeEnvelopeFromProofString: jest.fn(),
  isZkProofEnvelopeV1: jest.fn(),
  ageBucketMeetsMinimum: jest.fn(),
}));

jest.mock('@par-noir/zk-protocol-v2', () => ({
  verifyZkProofEnvelopeV2: jest.fn(),
  isZkProofEnvelopeV2: jest.fn(),
}));

import {
  verifyZkProofEnvelopeV1,
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV1,
  ageBucketMeetsMinimum,
} from '@par-noir/zk-protocol-v1';
import { verifyZkProofEnvelopeV2, isZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import { ZKPDataPointsService } from '../modules/zkpDataPointsService';

const verifyMock = verifyZkProofEnvelopeV1 as jest.Mock;
const verifyV2Mock = verifyZkProofEnvelopeV2 as jest.Mock;
const decodeMock = decodeEnvelopeFromProofString as jest.Mock;
const isEnvMock = isZkProofEnvelopeV1 as jest.Mock;
const isEnvV2Mock = isZkProofEnvelopeV2 as jest.Mock;
const ageMock = ageBucketMeetsMinimum as jest.Mock;

const v1EnvBase = {
  format_version: 1,
  zk_proof_version: 1,
  zk_proof_type: 'modp_fs_nizk_ml_dsa_binding_v1',
  hash_policy: 'SHA3-384',
  context: 'c',
  nonce: 'n',
  expires_at_ms: Date.now() + 10000,
  public_inputs: {},
  sigma: { group: 'rfc5114_modp_1024_160', y_hex: '1', t_hex: '1', s_hex: '1', challenge_hex: '1' },
  ml_dsa_public_key_b64: 'a',
  ml_dsa_signature_b64: 'b',
};

describe('ZKPDataPointsService.verifyProof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isEnvV2Mock.mockReturnValue(false);
  });

  it('rejects crypto-invalid proofs (v1)', async () => {
    decodeMock.mockReturnValue({ ...v1EnvBase, public_inputs: { zkp_type: 'age_verification', age_bucket: '30_39' } });
    isEnvMock.mockReturnValue(true);
    verifyMock.mockReturnValue({ ok: false, reason: 'verify_failed' });
    const r = await ZKPDataPointsService.verifyProof('bad-proof', 'age >= 18');
    expect(r.isValid).toBe(false);
    expect(r.error).toBe('verify_failed');
  });

  it('rejects proof type mismatch for age condition', async () => {
    verifyMock.mockReturnValue({ ok: true });
    decodeMock.mockReturnValue({
      ...v1EnvBase,
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
      ...v1EnvBase,
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
      ...v1EnvBase,
      public_inputs: { zkp_type: 'age_verification', age_bucket: '30_39' },
    });
    isEnvMock.mockReturnValue(true);
    ageMock.mockReturnValue(true);
    const r = await ZKPDataPointsService.verifyProof('proof', 'age >= 18');
    expect(r.isValid).toBe(true);
  });

  it('verifies v2 envelope when format is v2', async () => {
    const v2Env = {
      format_version: 2,
      zk_proof_version: 2,
      zk_proof_type: 'stark_genstark_sha256_ml_dsa_binding_v2',
      hash_policy: 'SHA3-384',
      stark_iop_hash: 'sha256',
      context: 'c',
      nonce: 'n',
      expires_at_ms: Date.now() + 10000,
      public_inputs: { zkp_type: 'age_verification', age_bucket: '30_39' },
      stark_binding_sha3_384_b64: 'eA==',
      stark_final_r0_decimal: '1',
      stark_proof_b64: 'AA',
      ml_dsa_public_key_b64: 'a',
      ml_dsa_signature_b64: 'b',
    };
    decodeMock.mockReturnValue(v2Env);
    isEnvV2Mock.mockReturnValue(true);
    isEnvMock.mockReturnValue(false);
    verifyV2Mock.mockReturnValue({ ok: true });
    ageMock.mockReturnValue(true);
    const r = await ZKPDataPointsService.verifyProof('proof', 'age >= 18');
    expect(r.isValid).toBe(true);
    expect(verifyV2Mock).toHaveBeenCalled();
  });
});
