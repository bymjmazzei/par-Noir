import {
  RECOVERY_APPROVAL_CONTEXT,
  RECOVERY_CUSTODIAN_CONTEXT,
  RECOVERY_ZKP_TYPES,
  parseApprovalBinding,
  verifyRecoveryApprovalBinding,
  type RecoveryZkApprovalPayload,
} from '@par-noir/recovery-crypto';
import { decodeEnvelopeFromProofString, verifyZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';

export interface VerifiedCustodianship {
  identityPublicKey: string;
  custodianId: string;
  shareIndex: number;
  invitationId: string;
  threshold: number;
}

export function verifyCustodianshipCredential(zkp: string): { ok: boolean; reason?: string; data?: VerifiedCustodianship } {
  const env = decodeEnvelopeFromProofString(zkp);
  if (!env || typeof env !== 'object') return { ok: false, reason: 'invalid_envelope' };
  const context = (env as { context?: string }).context;
  if (context !== RECOVERY_CUSTODIAN_CONTEXT) return { ok: false, reason: 'wrong_context' };

  const verified = verifyZkProofEnvelopeV2(zkp);
  if (!verified.ok) return verified;

  const publicInputs = (env as { public_inputs?: Record<string, unknown> }).public_inputs || {};
  if (publicInputs.zkp_type !== RECOVERY_ZKP_TYPES.custodianship) {
    return { ok: false, reason: 'wrong_zkp_type' };
  }

  const identityPublicKey = String(publicInputs.identity_public_key || '');
  const custodianId = String(publicInputs.custodian_id || '');
  const shareIndex = Number(publicInputs.share_index);
  const invitationId = String(publicInputs.invitation_id || '');
  const threshold = Number(publicInputs.threshold);

  if (!identityPublicKey || !custodianId || !Number.isFinite(shareIndex) || shareIndex < 1) {
    return { ok: false, reason: 'invalid_public_inputs' };
  }

  return {
    ok: true,
    data: { identityPublicKey, custodianId, shareIndex, invitationId, threshold },
  };
}

export async function verifyRecoveryApprovalPayload(
  payload: RecoveryZkApprovalPayload,
  custodianPasscode?: string
): Promise<{ ok: boolean; reason?: string; requestId?: string }> {
  const cust = verifyCustodianshipCredential(payload.custodianshipZkp);
  if (!cust.ok || !cust.data) return { ok: false, reason: cust.reason || 'invalid_custodianship' };
  if (cust.data.custodianId !== payload.custodianId) return { ok: false, reason: 'custodian_id_mismatch' };
  if (cust.data.shareIndex !== payload.shareIndex) return { ok: false, reason: 'share_index_mismatch' };

  const approvalEnv = decodeEnvelopeFromProofString(payload.approvalZkp);
  if (approvalEnv && typeof approvalEnv === 'object' && (approvalEnv as { context?: string }).context === RECOVERY_APPROVAL_CONTEXT) {
    const verified = verifyZkProofEnvelopeV2(payload.approvalZkp);
    if (!verified.ok) return verified;
    const publicInputs = (approvalEnv as { public_inputs?: Record<string, unknown> }).public_inputs || {};
    if (publicInputs.zkp_type !== RECOVERY_ZKP_TYPES.approval) {
      return { ok: false, reason: 'wrong_approval_zkp_type' };
    }
    if (String(publicInputs.custodian_id) !== payload.custodianId) {
      return { ok: false, reason: 'approval_custodian_mismatch' };
    }
    if (Number(publicInputs.share_index) !== payload.shareIndex) {
      return { ok: false, reason: 'approval_share_index_mismatch' };
    }
    return { ok: true, requestId: String(publicInputs.request_id || '') };
  }

  try {
    const binding = parseApprovalBinding(payload.approvalZkp);
    if (binding.custodianId !== payload.custodianId) return { ok: false, reason: 'binding_custodian_mismatch' };
    if (binding.shareIndex !== payload.shareIndex) return { ok: false, reason: 'binding_share_index_mismatch' };
    if (binding.custodianshipZkp !== payload.custodianshipZkp) return { ok: false, reason: 'binding_custodianship_mismatch' };
    if (custodianPasscode) {
      const ok = await verifyRecoveryApprovalBinding(binding, custodianPasscode);
      if (!ok) return { ok: false, reason: 'binding_verify_failed' };
    }
    return { ok: true, requestId: binding.requestId };
  } catch {
    return { ok: false, reason: 'invalid_approval' };
  }
}
