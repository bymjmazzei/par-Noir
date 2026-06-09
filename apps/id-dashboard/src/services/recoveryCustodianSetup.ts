import {
  encryptOwnerVaultShare,
  serializeOwnerVaultShare,
  type ShamirShare
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import { takeShareForCustodianAssignment } from './recoveryService';
import { issueCustodianshipCredential } from './recoveryZkService';
import { persistCustodianVault } from './recoveryApiService';

export async function assignCustodianVaultAndIssueCredential(params: {
  custodianId: string;
  custodianName: string;
  custodianType: string;
  identityId: string;
  encryptedIdentity: EncryptedIdentity;
  invitationId: string;
  threshold: number;
  apiToken?: string | null;
}): Promise<{
  custodianshipZkp: string;
  shareIndex: number;
  encryptedShare: string;
  share: ShamirShare;
}> {
  const taken = takeShareForCustodianAssignment();
  if (!taken) {
    throw new Error('No recovery shares available to assign. Create identity with recovery enabled first.');
  }

  const encrypted = await encryptOwnerVaultShare(taken.share, params.encryptedIdentity.publicKey);
  const encryptedShare = serializeOwnerVaultShare(encrypted);

  const custodianshipZkp = await issueCustodianshipCredential({
    identityId: params.identityId,
    encryptedIdentity: params.encryptedIdentity,
    custodianId: params.custodianId,
    shareIndex: taken.shareIndex,
    invitationId: params.invitationId,
    threshold: params.threshold
  });

  if (params.apiToken) {
    const { VolumeIdGenerator } = await import('../utils/crypto/volumeIdGenerator');
    const pnId = await VolumeIdGenerator.generateCanonicalVolumeId(params.encryptedIdentity.publicKey);
    await persistCustodianVault(pnId, params.apiToken, {
      custodianId: params.custodianId,
      name: params.custodianName,
      custodianType: params.custodianType,
      encryptedShare,
      shareIndex: taken.shareIndex,
      custodianshipCredential: custodianshipZkp
    }).catch(() => undefined);
  }

  return {
    custodianshipZkp,
    shareIndex: taken.shareIndex,
    encryptedShare,
    share: taken.share
  };
}
