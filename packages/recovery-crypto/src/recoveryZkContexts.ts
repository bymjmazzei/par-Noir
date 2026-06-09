/** ZK v2 context strings for recovery authorization proofs. */
export const RECOVERY_CUSTODIAN_CONTEXT = 'par-noir.zkp.recovery_custodian';
export const RECOVERY_APPROVAL_CONTEXT = 'par-noir.zkp.recovery_approval';

export const RECOVERY_ZKP_TYPES = {
  custodianship: 'recovery_custodian',
  approval: 'recovery_approval',
} as const;

export interface RecoveryCustodianshipPublicInputs {
  zkp_type: typeof RECOVERY_ZKP_TYPES.custodianship;
  identity_public_key: string;
  custodian_id: string;
  share_index: number;
  invitation_id: string;
  threshold: number;
  /** Present on credentials issued after protected-custodian support; omitted = revokable (legacy). */
  unrevokable?: boolean;
}

export interface RecoveryApprovalPublicInputs {
  zkp_type: typeof RECOVERY_ZKP_TYPES.approval;
  identity_public_key: string;
  request_id: string;
  custodian_id: string;
  share_index: number;
}

export interface RecoveryZkApprovalPayload {
  custodianId: string;
  shareIndex: number;
  /** ZK v2 envelope (custodian-signed approval or passcode-bound binding). */
  approvalZkp: string;
  /** Owner-issued custodianship credential presented with approval. */
  custodianshipZkp: string;
  approvedAt: string;
}
