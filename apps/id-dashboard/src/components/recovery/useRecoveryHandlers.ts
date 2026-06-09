/**
 * Recovery tab handlers extracted from App.tsx for maintainability.
 */
import {
  combineShares,
  decryptCustodianShare,
  createShareCommitment,
  proveShareKnowledge,
  serializeEncryptedShare,
  encryptCustodianShare,
  type RecoveryEnvelope,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import {
  appendShareToRecoveryRequest,
  completeRecoveryWithShares,
  getCustodianShare,
  saveRecoveryRequest,
  type StoredRecoveryRequest
} from '../services/recoveryService';
import { parseRecoveryPnFile } from './parseRecoveryPnFile';
import { persistRecoveryRequest, submitRecoveryShare } from '../services/recoveryApiService';

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
  const requestId = `recovery-${Date.now()}`;
  const req: StoredRecoveryRequest = {
    id: requestId,
    status: 'pending',
    shares: [],
    requiredThreshold: input.threshold,
    publicKey: parsed.publicKey,
    createdAt: new Date().toISOString()
  };
  saveRecoveryRequest(req);
  sessionStorage.setItem(`pn_recovery_envelope_${requestId}`, JSON.stringify(parsed.envelope));
  sessionStorage.setItem(`pn_recovery_identity_${requestId}`, JSON.stringify(parsed.identity));
  if (input.authToken) {
    try {
      const { VolumeIdGenerator } = await import('../utils/crypto/volumeIdGenerator');
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

export interface ApproveRecoveryShareInput {
  requestId: string;
  custodianId: string;
  custodianPasscode: string;
  identityPublicKey: string;
  threshold: number;
  authToken?: string | null;
  userPnIdentifier?: string;
}

export async function approveRecoveryWithShare(input: ApproveRecoveryShareInput): Promise<{
  stored: StoredRecoveryRequest | null;
  thresholdMet: boolean;
}> {
  let share = getCustodianShare(input.custodianId);
  if (!share) {
    throw new Error('This custodian has no recovery share. Re-add the custodian after identity creation.');
  }

  const commitment = await createShareCommitment(input.identityPublicKey, share);
  const proof = await proveShareKnowledge(input.identityPublicKey, share, commitment.commitment);
  const encrypted = await encryptCustodianShare(share, input.custodianPasscode, input.identityPublicKey);
  const encryptedShare = serializeEncryptedShare(encrypted);

  const stored = appendShareToRecoveryRequest(input.requestId, share);
  if (input.authToken && input.userPnIdentifier) {
    await submitRecoveryShare(input.userPnIdentifier, input.authToken, input.requestId, share, input.threshold, {
      proof,
      encryptedShare,
      custodianId: input.custodianId
    });
  }

  return {
    stored,
    thresholdMet: Boolean(stored && stored.shares.length >= stored.requiredThreshold)
  };
}

export async function completeRecoveryPasscodeStep(params: {
  envelope: RecoveryEnvelope;
  shares: ShamirShare[];
  newPasscode: string;
  existingIdentity: EncryptedIdentity;
}) {
  return completeRecoveryWithShares(params);
}

export { decryptCustodianShare, parseRecoveryPnFile };
