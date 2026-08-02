/**
 * Authorization-based recovery handlers (owner vault + ZK custodian approvals).
 */
import {
  type RecoveryEnvelope,
  type RecoveryZkApprovalPayload,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  appendApprovalToRecoveryRequest,
  completeRecoveryWithShares,
  decryptVaultSharesForRecovery,
  saveRecoveryRequest,
  type StoredRecoveryRequest
} from '../../services/recoveryService';
import { parseRecoveryPnFile } from './parseRecoveryPnFile';
import {
  persistRecoveryRequest,
  submitRecoveryApproval,
  fetchVaultShares,
  fetchRecoveryRequest
} from '../../services/recoveryApiService';
import { issueRecoveryApproval } from '../../services/recoveryZkService';
import { getCustodianshipCredential } from '../../services/recoveryCredentialStorage';

export interface InitiateRecoveryFromPnInput {
  file: File;
  claimantName: string;
  emailOrPhone: string;
  threshold: number;
  authToken?: string | null;
}

export async function initiateRecoveryFromPnFile(input: InitiateRecoveryFromPnInput): Promise<StoredRecoveryRequest> {
  const text = await input.file.text();
  const parsed = parseRecoveryPnFile(JSON.parse(text));

  if (input.authToken) {
    const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
    const { fetchRecoveryCustodianSummary } = await import('../../services/recoveryApiService');
    const ownerPn = await VolumeIdGenerator.generateCanonicalVolumeId(parsed.publicKey);
    const summary = await fetchRecoveryCustodianSummary(ownerPn, input.authToken);
    if (!summary || summary.counts.acceptedUnrevokable < 1) {
      throw new Error(
        'Recovery is blocked: the identity owner must add and accept at least one protected custodian (e.g. an alt pN they control) before recovery can complete.'
      );
    }
    if (summary.counts.accepted < input.threshold) {
      throw new Error(
        `Recovery is not ready: only ${summary.counts.accepted} accepted custodian(s); ${input.threshold} required.`
      );
    }
  }

  const requestId = `recovery-${Date.now()}`;
  const req: StoredRecoveryRequest = {
    id: requestId,
    status: 'pending',
    approvalCount: 0,
    requiredThreshold: input.threshold,
    publicKey: parsed.publicKey,
    createdAt: new Date().toISOString()
  };
  saveRecoveryRequest(req);
  sessionStorage.setItem(`pn_recovery_envelope_${requestId}`, JSON.stringify(parsed.envelope));
  sessionStorage.setItem(`pn_recovery_identity_${requestId}`, JSON.stringify(parsed.identity));

  if (input.authToken) {
    try {
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const pnId = await VolumeIdGenerator.generateCanonicalVolumeId(parsed.publicKey);
      await persistRecoveryRequest(pnId, input.authToken, {
        requestId,
        publicKey: parsed.publicKey,
        threshold: input.threshold,
        claimantName: input.claimantName
      });
    } catch {
      /* Drive optional at initiate */
    }
  }
  return req;
}

export interface ApproveRecoveryInput {
  requestId: string;
  custodianId: string;
  identityPublicKey: string;
  custodianPasscode: string;
  threshold: number;
  authToken?: string | null;
  userPnIdentifier?: string;
  custodianIdentityId?: string;
  custodianEncryptedIdentity?: EncryptedIdentity;
}

export async function approveRecoveryWithZkp(input: ApproveRecoveryInput): Promise<{
  stored: StoredRecoveryRequest | null;
  thresholdMet: boolean;
}> {
  const cred = getCustodianshipCredential(input.identityPublicKey, input.custodianId);
  if (!cred) {
    throw new Error('No custodianship credential found. Accept the custodian invitation first.');
  }

  const approvalZkp = await issueRecoveryApproval({
    identityPublicKey: input.identityPublicKey,
    requestId: input.requestId,
    custodianId: input.custodianId,
    shareIndex: cred.shareIndex,
    custodianshipZkp: cred.custodianshipZkp,
    custodianPasscode: input.custodianPasscode || cred.custodianPasscode,
    custodianIdentityId: input.custodianIdentityId,
    custodianEncryptedIdentity: input.custodianEncryptedIdentity
  });

  const approval: RecoveryZkApprovalPayload = {
    custodianId: input.custodianId,
    shareIndex: cred.shareIndex,
    approvalZkp,
    custodianshipZkp: cred.custodianshipZkp,
    approvedAt: new Date().toISOString()
  };

  const stored = appendApprovalToRecoveryRequest(input.requestId);
  if (input.authToken && input.userPnIdentifier) {
    const result = await submitRecoveryApproval(
      input.userPnIdentifier,
      input.authToken,
      input.requestId,
      approval,
      input.threshold
    );
    if (stored) {
      stored.status = result.status === 'ready' ? 'ready' : 'pending';
      stored.approvalCount = result.approvalCount;
      saveRecoveryRequest(stored);
    }
    return {
      stored,
      thresholdMet: result.status === 'ready'
    };
  }

  return {
    stored,
    thresholdMet: Boolean(stored && stored.approvalCount >= stored.requiredThreshold)
  };
}

export async function fetchSharesAfterThreshold(params: {
  userPnIdentifier: string;
  authToken: string;
  requestId: string;
  identityPublicKey: string;
}): Promise<ShamirShare[]> {
  const remote = await fetchRecoveryRequest(params.userPnIdentifier, params.authToken, params.requestId);
  if (!remote || remote.status !== 'ready') {
    throw new Error('Recovery threshold not met yet');
  }
  const vault = await fetchVaultShares(params.userPnIdentifier, params.authToken, params.requestId);
  if (!vault.includesUnrevokableShare) {
    throw new Error('Recovery requires at least one protected custodian approval');
  }
  return decryptVaultSharesForRecovery(vault.vaultShares, params.identityPublicKey);
}

export async function completeRecoveryPasscodeStep(params: {
  envelope: RecoveryEnvelope;
  shares: ShamirShare[];
  newPasscode: string;
  existingIdentity: EncryptedIdentity;
}) {
  return completeRecoveryWithShares(params);
}

export { parseRecoveryPnFile };
