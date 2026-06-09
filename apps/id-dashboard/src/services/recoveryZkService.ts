import {
  RECOVERY_APPROVAL_CONTEXT,
  RECOVERY_CUSTODIAN_CONTEXT,
  RECOVERY_ZKP_TYPES,
  createRecoveryApprovalBinding,
  serializeApprovalBinding,
  type RecoveryCustodianshipPublicInputs,
  type RecoveryApprovalPublicInputs,
} from '@par-noir/recovery-crypto';
import { generateZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import type { EncryptedIdentity } from '../utils/crypto';
import { loadMlDsaKeypairForZk } from '../utils/zkPqcSigning';

const CUSTODIANSHIP_EXPIRY_YEARS = 5;
const APPROVAL_EXPIRY_HOURS = 72;

export async function issueCustodianshipCredential(params: {
  identityId: string;
  encryptedIdentity: EncryptedIdentity;
  custodianId: string;
  shareIndex: number;
  invitationId: string;
  threshold: number;
  unrevokable?: boolean;
}): Promise<string> {
  const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
    params.identityId,
    params.encryptedIdentity
  );
  const public_inputs: RecoveryCustodianshipPublicInputs = {
    zkp_type: RECOVERY_ZKP_TYPES.custodianship,
    identity_public_key: params.encryptedIdentity.publicKey,
    custodian_id: params.custodianId,
    share_index: params.shareIndex,
    invitation_id: params.invitationId,
    threshold: params.threshold,
    ...(params.unrevokable === true ? { unrevokable: true } : {}),
  };
  const expiresAtMs = Date.now() + CUSTODIANSHIP_EXPIRY_YEARS * 365 * 24 * 60 * 60 * 1000;
  return generateZkProofEnvelopeV2({
    mlDsaSecretKey,
    mlDsaPublicKey,
    context: RECOVERY_CUSTODIAN_CONTEXT,
    public_inputs: public_inputs as Record<string, unknown>,
    expiresAtMs,
  });
}

export async function issueRecoveryApprovalZkp(params: {
  identityId: string;
  encryptedIdentity: EncryptedIdentity;
  identityPublicKey: string;
  requestId: string;
  custodianId: string;
  shareIndex: number;
  custodianshipZkp: string;
}): Promise<string> {
  try {
    const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
      params.identityId,
      params.encryptedIdentity
    );
    const public_inputs = {
      zkp_type: RECOVERY_ZKP_TYPES.approval,
      identity_public_key: params.identityPublicKey,
      request_id: params.requestId,
      custodian_id: params.custodianId,
      share_index: params.shareIndex,
    } satisfies RecoveryApprovalPublicInputs;
    const expiresAtMs = Date.now() + APPROVAL_EXPIRY_HOURS * 60 * 60 * 1000;
    return generateZkProofEnvelopeV2({
      mlDsaSecretKey,
      mlDsaPublicKey,
      context: RECOVERY_APPROVAL_CONTEXT,
      public_inputs: public_inputs as Record<string, unknown>,
      expiresAtMs,
    });
  } catch {
    return '';
  }
}

export async function issueRecoveryApproval(params: {
  identityPublicKey: string;
  requestId: string;
  custodianId: string;
  shareIndex: number;
  custodianshipZkp: string;
  custodianPasscode: string;
  /** When custodian has unlocked pN, prefer ML-DSA approval. */
  custodianIdentityId?: string;
  custodianEncryptedIdentity?: EncryptedIdentity;
}): Promise<string> {
  if (params.custodianIdentityId && params.custodianEncryptedIdentity) {
    const zkp = await issueRecoveryApprovalZkp({
      identityId: params.custodianIdentityId,
      encryptedIdentity: params.custodianEncryptedIdentity,
      identityPublicKey: params.identityPublicKey,
      requestId: params.requestId,
      custodianId: params.custodianId,
      shareIndex: params.shareIndex,
      custodianshipZkp: params.custodianshipZkp,
    });
    if (zkp) return zkp;
  }
  const binding = await createRecoveryApprovalBinding({
    identityPublicKey: params.identityPublicKey,
    requestId: params.requestId,
    custodianId: params.custodianId,
    shareIndex: params.shareIndex,
    custodianshipZkp: params.custodianshipZkp,
    custodianPasscode: params.custodianPasscode,
  });
  return serializeApprovalBinding(binding);
}
