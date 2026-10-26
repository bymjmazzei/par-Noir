import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  fetchRecoveryCustodianSummary,
  registerRecoveryCustodian,
  setupRecoveryEpoch,
} from './recoveryApiService';
import { issueCustodianshipCredential } from './recoveryZkService';
import { resolveRecoveryShares } from './recoveryShareResolver';
import { lowestFreeShareIndex } from './recoveryRelayFlows';

/**
 * Register a custodian invite on the relay and issue their custodianship credential.
 * The share itself is sent later, sealed to the key the custodian publishes on accept.
 */
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
  unrevokable?: boolean;
  /** Omit when shares come from the in-memory migration buffer. */
  pnName?: string;
  passcode?: string;
  resendExisting?: boolean;
}): Promise<{ custodianshipZkp: string; shareIndex: number }> {
  if (!params.apiToken) throw new Error('Sign in to the par Noir API before inviting custodians.');
  const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
  const pnId =
    params.userPnIdentifier
    || (await VolumeIdGenerator.generateCanonicalVolumeId(params.encryptedIdentity.publicKey));

  let summary = await fetchRecoveryCustodianSummary(pnId, params.apiToken);
  const existing = summary?.custodians.find((c) => c.custodianId === params.custodianId);
  if (params.resendExisting && existing) {
    return { custodianshipZkp: existing.custodianshipCredential, shareIndex: existing.shareIndex };
  }

  const shares = await resolveRecoveryShares({
    encryptedIdentity: params.encryptedIdentity,
    pnName: params.pnName,
    passcode: params.passcode,
  });
  if (!summary?.configured) {
    await setupRecoveryEpoch(params.apiToken, {
      ownerPublicKey: params.encryptedIdentity.publicKey,
      threshold: params.threshold,
      totalShares: shares.length,
    });
    summary = await fetchRecoveryCustodianSummary(pnId, params.apiToken);
  }
  const shareIndex = lowestFreeShareIndex(shares, summary);
  if (shareIndex == null) throw new Error('Every recovery share already has a custodian.');

  const custodianshipZkp = await issueCustodianshipCredential({
    identityId: params.identityId,
    encryptedIdentity: params.encryptedIdentity,
    custodianId: params.custodianId,
    shareIndex,
    invitationId: params.invitationId,
    threshold: params.threshold,
    unrevokable: params.unrevokable === true,
  });
  await registerRecoveryCustodian(params.apiToken, {
    custodianId: params.custodianId,
    name: params.custodianName,
    custodianType: params.custodianType,
    shareIndex,
    custodianshipCredential: custodianshipZkp,
    unrevokable: params.unrevokable === true,
  });
  return { custodianshipZkp, shareIndex };
}
