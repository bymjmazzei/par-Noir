import {
  encryptOwnerVaultShare,
  serializeOwnerVaultShare,
  type ShamirShare,
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import {
  assignRecoveryCustodian,
  resendRecoveryCustodianInvitation,
} from './recoveryApiService';
import { issueCustodianshipCredential } from './recoveryZkService';
import { pickLowestPendingShareIndex, getPendingRecoverySharesBuffer, setPendingRecoverySharesBuffer } from './recoveryVaultService';
import { resolveRecoveryShares } from './recoveryShareResolver';

export async function assignCustodianVaultAndIssueCredential(params: {
  custodianId: string;
  custodianName: string;
  custodianType: string;
  identityId: string;
  encryptedIdentity: EncryptedIdentity;
  invitationId: string;
  threshold: number;
  apiToken?: string | null;
  userPnIdentifier?: string;
  shareIndex?: number;
  unrevokable?: boolean;
  pnName?: string;
  passcode?: string;
  resendExisting?: boolean;
}): Promise<{
  custodianshipZkp: string;
  shareIndex: number;
  encryptedShare: string;
  share?: ShamirShare;
}> {
  const { VolumeIdGenerator } = await import('../utils/crypto/volumeIdGenerator');
  const pnId =
    params.userPnIdentifier
    || (await VolumeIdGenerator.generateCanonicalVolumeId(params.encryptedIdentity.publicKey));

  if (params.resendExisting && params.apiToken) {
    const existing = await resendRecoveryCustodianInvitation(pnId, params.apiToken, params.custodianId);
    return {
      custodianshipZkp: existing.custodianshipCredential,
      shareIndex: existing.shareIndex,
      encryptedShare: '',
    };
  }

  let shareIndex = params.shareIndex;
  let encryptedShare = '';
  let share: ShamirShare | undefined;

  if (params.apiToken) {
    if (shareIndex == null) {
      shareIndex = (await pickLowestPendingShareIndex(pnId, params.apiToken)) ?? undefined;
    }
    if (shareIndex == null) {
      const buffer = getPendingRecoverySharesBuffer();
      if (buffer?.shares?.length) {
        share = buffer.shares.shift()!;
        setPendingRecoverySharesBuffer(buffer);
        shareIndex = share.index;
        const encrypted = await encryptOwnerVaultShare(share, params.encryptedIdentity.publicKey);
        encryptedShare = serializeOwnerVaultShare(encrypted);
      }
    }
    if (shareIndex == null && params.pnName && params.passcode) {
      const shares = await resolveRecoveryShares({
        encryptedIdentity: params.encryptedIdentity,
        pnName: params.pnName,
        passcode: params.passcode,
      });
      share = shares[0];
      shareIndex = share.index;
      const encrypted = await encryptOwnerVaultShare(share, params.encryptedIdentity.publicKey);
      encryptedShare = serializeOwnerVaultShare(encrypted);
    }
    if (shareIndex == null) {
      throw new Error('No recovery shares available to assign. Set up recovery vault on Drive first.');
    }
  } else {
    const buffer = getPendingRecoverySharesBuffer();
    if (!buffer?.shares?.length) {
      throw new Error('No recovery shares available to assign. Create identity with recovery enabled first.');
    }
    share = buffer.shares.shift()!;
    setPendingRecoverySharesBuffer(buffer);
    shareIndex = share.index;
    const encrypted = await encryptOwnerVaultShare(share, params.encryptedIdentity.publicKey);
    encryptedShare = serializeOwnerVaultShare(encrypted);
  }

  const custodianshipZkp = await issueCustodianshipCredential({
    identityId: params.identityId,
    encryptedIdentity: params.encryptedIdentity,
    custodianId: params.custodianId,
    shareIndex: shareIndex!,
    invitationId: params.invitationId,
    threshold: params.threshold,
    unrevokable: params.unrevokable === true,
  });

  if (params.apiToken) {
    await assignRecoveryCustodian(pnId, params.apiToken, {
      custodianId: params.custodianId,
      name: params.custodianName,
      custodianType: params.custodianType,
      shareIndex: shareIndex!,
      custodianshipCredential: custodianshipZkp,
      encryptedShare,
      unrevokable: params.unrevokable === true,
    });
  }

  return {
    custodianshipZkp,
    shareIndex: shareIndex!,
    encryptedShare,
    share,
  };
}
