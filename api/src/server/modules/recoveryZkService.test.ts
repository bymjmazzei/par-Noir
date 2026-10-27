/**
 * @jest-environment node
 *
 * Approvals must be ZK v2 envelopes bound to the owner identity; MAC bindings are rejected.
 */
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { generateZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import {
  RECOVERY_APPROVAL_CONTEXT,
  RECOVERY_CUSTODIAN_CONTEXT,
  RECOVERY_ZKP_TYPES,
} from '@par-noir/recovery-crypto';
import { verifyRecoveryApprovalPayload } from './recoveryZkService';

const owner = mlDsa65Keygen(new Uint8Array(32).fill(7));
const custodian = mlDsa65Keygen(new Uint8Array(32).fill(8));
const expiresAtMs = Date.now() + 60 * 60 * 1000;

function custodianship(identityPublicKey: string): string {
  return generateZkProofEnvelopeV2({
    mlDsaSecretKey: owner.secretKey,
    mlDsaPublicKey: owner.publicKey,
    context: RECOVERY_CUSTODIAN_CONTEXT,
    public_inputs: {
      zkp_type: RECOVERY_ZKP_TYPES.custodianship,
      identity_public_key: identityPublicKey,
      custodian_id: 'cust-1',
      share_index: 2,
      invitation_id: 'inv-1',
      threshold: 2,
      unrevokable: false,
    },
    expiresAtMs,
  });
}

function approval(identityPublicKey: string, requestId: string): string {
  return generateZkProofEnvelopeV2({
    mlDsaSecretKey: custodian.secretKey,
    mlDsaPublicKey: custodian.publicKey,
    context: RECOVERY_APPROVAL_CONTEXT,
    public_inputs: {
      zkp_type: RECOVERY_ZKP_TYPES.approval,
      identity_public_key: identityPublicKey,
      request_id: requestId,
      custodian_id: 'cust-1',
      share_index: 2,
    },
    expiresAtMs,
  });
}

describe('verifyRecoveryApprovalPayload', () => {
  const custodianshipZkp = custodianship('owner-pk');

  it('accepts a signed approval and returns the bound request and identity', () => {
    const result = verifyRecoveryApprovalPayload({
      custodianId: 'cust-1',
      shareIndex: 2,
      custodianshipZkp,
      approvalZkp: approval('owner-pk', 'req-1'),
      approvedAt: new Date().toISOString(),
    });
    expect(result).toEqual({ ok: true, requestId: 'req-1', identityPublicKey: 'owner-pk' });
  });

  it('rejects a MAC approval binding', () => {
    const binding = JSON.stringify({
      requestId: 'req-1',
      custodianId: 'cust-1',
      shareIndex: 2,
      custodianshipZkp,
      salt: 'aa',
      mac: 'bb',
    });
    const result = verifyRecoveryApprovalPayload({
      custodianId: 'cust-1',
      shareIndex: 2,
      custodianshipZkp,
      approvalZkp: Buffer.from(binding).toString('base64'),
      approvedAt: new Date().toISOString(),
    });
    expect(result).toEqual({ ok: false, reason: 'invalid_approval' });
  });

  it('rejects an approval for a different owner identity', () => {
    const result = verifyRecoveryApprovalPayload({
      custodianId: 'cust-1',
      shareIndex: 2,
      custodianshipZkp,
      approvalZkp: approval('someone-else', 'req-1'),
      approvedAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('approval_identity_mismatch');
  });
});
