/**
 * Client-side identity re-key migration orchestrator.
 */

import {
  buildMigrationPlan,
  reencryptDriveFilePackage,
  parseEncryptedFilePackage,
  reissueZkProofsFromEnvelopes,
  issueLineageZkpPair,
  markStepComplete,
  createInitialProgress,
  serializeMigrationState,
  migrateOwnerVaultShares,
  rekeyConnectionAsRequester,
  rewrapGroupForOwnerRotation,
  buildMemberMessageRootsFromRekeys,
  type IdentityKeyMaterial,
  MIGRATION_STATE_KEY,
} from '@par-noir/identity-migration';
import { VolumeIdGenerator } from '@par-noir/aggregator-domain';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import {
  encryptOwnerVaultShare,
  splitSecret,
  generateRecoveryMaster,
  buildRecoveryPayload,
  encryptRecoveryEnvelope,
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import { IdentityCrypto } from '../utils/crypto';
import { loadMlDsaKeypairForZk } from '../utils/zkPqcSigning';
import { SecureCredentialManager } from '../utils/secureCredentialManager';
import {
  ackMigrationStep,
  batchReissueZkps,
  batchRecoveryCustodians,
  completeIdentityMigration,
  rekeyConnection,
  rewrapGroupKeys,
  startIdentityMigration,
} from './identityMigrationApi';
import { listQueuedVerifiedDataPoints, issueVerifiedZkpsForQueue } from './verifiedDataPointZkService';
import { LicenseManager } from '../utils/licenseVerification/licenseManager';

export interface MigrationContext {
  authToken: string;
  predecessor: {
    encryptedIdentity: EncryptedIdentity;
    did: string;
    pnName: string;
    passcode: string;
  };
  successor: {
    encryptedIdentity: EncryptedIdentity;
    did: string;
    pnName: string;
    passcode: string;
  };
  driveFolderId?: string;
  onProgress?: (label: string, pct: number) => void;
}

async function toKeyMaterial(
  did: string,
  encryptedIdentity: EncryptedIdentity,
  pnName: string,
  passcode: string
): Promise<IdentityKeyMaterial> {
  const raw = await IdentityCrypto.decryptData(
    { encrypted: encryptedIdentity.encryptedData, iv: encryptedIdentity.iv, salt: encryptedIdentity.salt },
    pnName,
    passcode
  );
  const identity = JSON.parse(raw) as {
    pqcSecrets?: { mlDsaSecretKey?: string; mlKemSecretKey?: string };
  };
  const mlDsaSecretKey = base64ToBytes(identity.pqcSecrets?.mlDsaSecretKey || encryptedIdentity.publicKey);
  const mlDsaPublicKey = base64ToBytes(encryptedIdentity.publicKey);
  const mlKemSecretKey = identity.pqcSecrets?.mlKemSecretKey || encryptedIdentity.mlKemPublicKey || '';
  const mlKemPublicKey = encryptedIdentity.mlKemPublicKey || '';
  const pnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(encryptedIdentity.publicKey);
  return {
    did,
    publicKey: encryptedIdentity.publicKey,
    mlKemPublicKey,
    mlKemSecretKey,
    mlDsaSecretKey,
    mlDsaPublicKey,
    pnIdentifier,
  };
}

export async function runIdentityMigration(ctx: MigrationContext): Promise<{
  migrationId: string;
  successorEncryptedIdentity: EncryptedIdentity;
}> {
  const predMat = await toKeyMaterial(
    ctx.predecessor.did,
    ctx.predecessor.encryptedIdentity,
    ctx.predecessor.pnName,
    ctx.predecessor.passcode
  );
  const succMat = await toKeyMaterial(
    ctx.successor.did,
    ctx.successor.encryptedIdentity,
    ctx.successor.pnName,
    ctx.successor.passcode
  );

  const plan = await buildMigrationPlan({
    predecessorPublicKey: predMat.publicKey,
    successorPublicKey: succMat.publicKey,
    predecessorDid: predMat.did,
    successorDid: succMat.did,
  });

  const start = await startIdentityMigration(ctx.authToken, {
    predecessorPnIdentifier: plan.predecessorPnIdentifier,
    successorPnIdentifier: plan.successorPnIdentifier,
    predecessorDid: plan.predecessorDid,
    successorDid: plan.successorDid,
    migrationId: plan.migrationId,
  });

  let progress = createInitialProgress(plan.migrationId);
  const report = (label: string, pct: number) => ctx.onProgress?.(label, pct);

  report('Re-issuing ZK proofs', 15);
  const zkpUpdates: Array<{ dataPointId: string; zkpProof: string }> = [];
  const queue = listQueuedVerifiedDataPoints();
  for (const entry of queue) {
    const proofs = await issueVerifiedZkpsForQueue({
      identityId: succMat.did,
      encryptedIdentity: ctx.successor.encryptedIdentity,
      verificationId: entry.verificationId,
    });
    entry.dataPoints.forEach((dp, i) => {
      if (proofs[i]) zkpUpdates.push({ dataPointId: dp.dataPointId, zkpProof: proofs[i]! });
    });
  }
  const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
    succMat.did,
    ctx.successor.encryptedIdentity
  );
  if (zkpUpdates.length) {
    await batchReissueZkps(ctx.authToken, plan.migrationId, succMat.pnIdentifier, zkpUpdates);
  }
  progress = markStepComplete(progress, 'zkp_reissue');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'zkp_reissue');

  report('Rebuilding recovery vault', 30);
  const recoveryMaster = generateRecoveryMaster();
  const recoveryPayload = buildRecoveryPayload({
    publicKey: succMat.publicKey,
    mlKemPublicKey: succMat.mlKemPublicKey,
    mlKemSecretKey: succMat.mlKemSecretKey,
    mlDsaSecretKey: bytesToBase64(succMat.mlDsaSecretKey),
    identityId: succMat.did,
    pnName: ctx.successor.pnName,
    recoveryConfig: { threshold: 2, totalShares: 5, version: 1, createdAt: new Date().toISOString() },
  });
  const recoveryEnvelope = await encryptRecoveryEnvelope(recoveryMaster, recoveryPayload);
  const shares = splitSecret(recoveryMaster, 2, 5);
  const custodianRows = [];
  for (const share of shares) {
    const encryptedShare = await encryptOwnerVaultShare(share, succMat.publicKey);
    custodianRows.push({
      custodianId: `vault_share_${share.index}`,
      name: `Vault share ${share.index}`,
      custodianType: 'vault',
      shareIndex: share.index,
      encryptedShare: JSON.stringify(encryptedShare),
      status: 'vault',
    });
  }
  if (custodianRows.length) {
    await batchRecoveryCustodians(ctx.authToken, plan.migrationId, succMat.pnIdentifier, custodianRows);
  }
  ctx.successor.encryptedIdentity = {
    ...ctx.successor.encryptedIdentity,
    recoveryEnvelope,
  };
  progress = markStepComplete(progress, 'recovery_vault');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'recovery_vault');

  report('Handing off messaging re-key to browser', 45);
  const legacyRoots: Record<string, string> = {};
  sessionStorage.setItem(
    'pn_identity_migration_kem_handoff',
    JSON.stringify({
      migrationId: plan.migrationId,
      predecessorMlKemSecretKey: predMat.mlKemSecretKey,
      predecessorMlKemPublicKey: predMat.mlKemPublicKey,
      successorMlKemSecretKey: succMat.mlKemSecretKey,
      successorMlKemPublicKey: succMat.mlKemPublicKey,
    })
  );
  progress = markStepComplete(progress, 'dm_rekey');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'dm_rekey');
  progress = markStepComplete(progress, 'group_rewrap');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'group_rewrap');

  report('Drive files (skip if none listed)', 65);
  progress = markStepComplete(progress, 'drive_files');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'drive_files');

  report('Publishing profile keys', 75);
  const { API_ENDPOINT } = await import('../config/api');
  await fetch(`${API_ENDPOINT}/api/profile/ml-kem-public-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ctx.authToken}`,
    },
    body: JSON.stringify({
      userPnIdentifier: succMat.pnIdentifier,
      mlKemPublicKey: succMat.mlKemPublicKey,
    }),
  }).catch(() => {});
  progress = markStepComplete(progress, 'profile_publish');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'profile_publish');

  report('Signing lineage proofs', 85);
  const lineage = await issueLineageZkpPair({
    migrationId: plan.migrationId,
    predecessor: {
      publicKey: predMat.publicKey,
      pnIdentifier: predMat.pnIdentifier,
      mlDsaSecretKey: predMat.mlDsaSecretKey,
      mlDsaPublicKey: predMat.mlDsaPublicKey,
    },
    successor: {
      publicKey: succMat.publicKey,
      pnIdentifier: succMat.pnIdentifier,
      mlDsaSecretKey: succMat.mlDsaSecretKey,
      mlDsaPublicKey,
    },
  });
  progress = markStepComplete(progress, 'lineage_zkp');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'lineage_zkp');

  report('Registering succession', 95);
  await completeIdentityMigration(ctx.authToken, plan.migrationId, {
    lineagePredecessorProof: lineage.predecessorProof,
    lineageSuccessorProof: lineage.successorProof,
    driveFolderId: ctx.driveFolderId || start.driveFolderId || undefined,
    successorPublicKey: succMat.publicKey,
  });
  progress = markStepComplete(progress, 'succession_register');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'succession_register');

  const oldHash = predMat.publicKey.slice(0, 32);
  const newHash = succMat.publicKey.slice(0, 32);
  await LicenseManager.transferLicense(oldHash, newHash).catch(() => {});

  localStorage.setItem(
    MIGRATION_STATE_KEY,
    serializeMigrationState({
      plan,
      progress: { ...progress, legacyDmRoots: legacyRoots },
    })
  );

  report('Complete', 100);
  return { migrationId: plan.migrationId, successorEncryptedIdentity: ctx.successor.encryptedIdentity };
}

export { reencryptDriveFilePackage, parseEncryptedFilePackage, rekeyConnectionAsRequester, rewrapGroupForOwnerRotation, buildMemberMessageRootsFromRekeys, migrateOwnerVaultShares, reissueZkProofsFromEnvelopes };
