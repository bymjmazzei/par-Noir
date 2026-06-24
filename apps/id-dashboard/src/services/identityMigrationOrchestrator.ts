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
  type MigrationReport,
} from '@par-noir/identity-migration';
import { VolumeIdGenerator } from '@par-noir/aggregator-domain';
import { base64ToBytes, bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import {
  generateRecoveryMaster,
  buildRecoveryPayload,
  encryptRecoveryEnvelope,
  splitSecret,
  sealRecoveryShares,
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '../utils/crypto';
import { IdentityCrypto } from '../utils/crypto';
import { loadMlDsaKeypairForZk } from '../utils/zkPqcSigning';
import { LicenseManager } from '../utils/licenseVerification/licenseManager';
import {
  ackMigrationStep,
  batchReissueZkps,
  completeIdentityMigration,
  fetchZkpsFromDrive,
  startIdentityMigration,
} from './identityMigrationApi';
import { listQueuedVerifiedDataPoints, issueVerifiedZkpsForQueue } from './verifiedDataPointZkService';
import {
  connectDriveBackendForMigration,
  runFullDriveMigration,
} from './driveFileMigrationService';
import { setPendingRecoveryShares } from './recoveryService';
import {
  initializeRecoveryVaultOnDrive,
  setPendingRecoverySharesBuffer,
  flushPendingRecoverySharesToDrive,
} from './recoveryVaultService';
import { ownerGet } from './ownerApiService';
import { republishOwnedAssetsManifest } from './ownedAssetsManifestService';

export interface PredecessorCustodian {
  custodianId: string;
  name: string;
  custodianType?: string;
  status?: string;
}

export interface MigrationContext {
  authToken: string;
  predecessor: {
    encryptedIdentity: EncryptedIdentity;
    did: string;
    pnName: string;
    passcode: string;
    recoveryConfig?: { threshold: number; totalShares: number };
  };
  successor: {
    encryptedIdentity: EncryptedIdentity;
    did: string;
    pnName: string;
    passcode: string;
  };
  driveFolderId?: string;
  acknowledgeDriveFailures?: boolean;
  onProgress?: (label: string, pct: number) => void;
}

export interface MigrationCoreResult {
  migrationId: string;
  plan: Awaited<ReturnType<typeof buildMigrationPlan>>;
  successorEncryptedIdentity: EncryptedIdentity;
  predecessorCustodians: PredecessorCustodian[];
  recoveryThreshold: number;
  recoveryTotalShares: number;
  driveFailures: Array<{ path: string; reason: string }>;
  driveReport: MigrationReport | null;
  driveFilesPendingAck: boolean;
  startDriveFolderId: string | null;
  predMat: IdentityKeyMaterial;
  succMat: IdentityKeyMaterial;
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

async function fetchPredecessorCustodians(
  authToken: string,
  predecessorPn: string
): Promise<PredecessorCustodian[]> {
  const res = await ownerGet(authToken, `/api/recovery/${encodeURIComponent(predecessorPn)}/custodians`);
  if (!res.ok) return [];
  const data = (await res.json()) as { custodians?: PredecessorCustodian[] };
  return (data.custodians || []).filter(
    (c) => c.custodianType !== 'vault' && c.status !== 'vault' && !c.custodianId?.startsWith('vault_share_')
  );
}

export async function runIdentityMigrationCore(ctx: MigrationContext): Promise<MigrationCoreResult> {
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

  const driveFolderId = ctx.driveFolderId || start.driveFolderId;
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
  await loadMlDsaKeypairForZk(succMat.did, ctx.successor.encryptedIdentity);
  const seenZkpIds = new Set(zkpUpdates.map((u) => u.dataPointId));
  try {
    const fromDrive = await fetchZkpsFromDrive(ctx.authToken, plan.migrationId);
    const proofStrings = fromDrive.map((p) => p.zkpProof).filter(Boolean);
    if (proofStrings.length) {
      const reissued = await reissueZkProofsFromEnvelopes(proofStrings, {
        mlDsaSecretKey: succMat.mlDsaSecretKey,
        mlDsaPublicKey: succMat.mlDsaPublicKey,
        publicKey: succMat.publicKey,
      });
      for (const entry of reissued) {
        if (seenZkpIds.has(entry.dataPointId)) continue;
        seenZkpIds.add(entry.dataPointId);
        zkpUpdates.push({ dataPointId: entry.dataPointId, zkpProof: entry.proof });
      }
    }
  } catch {
    /* Drive ZKP reissue is best-effort when sheet missing */
  }
  if (zkpUpdates.length) {
    await batchReissueZkps(ctx.authToken, plan.migrationId, predMat.pnIdentifier, zkpUpdates);
  }
  progress = markStepComplete(progress, 'zkp_reissue');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'zkp_reissue');

  const recoveryConfig = ctx.predecessor.recoveryConfig || { threshold: 2, totalShares: 5 };
  const predecessorCustodians = await fetchPredecessorCustodians(ctx.authToken, predMat.pnIdentifier);

  report('Rebuilding recovery vault', 30);
  const recoveryMaster = generateRecoveryMaster();
  const recoveryPayload = buildRecoveryPayload({
    publicKey: succMat.publicKey,
    mlKemPublicKey: succMat.mlKemPublicKey,
    mlKemSecretKey: succMat.mlKemSecretKey,
    mlDsaSecretKey: bytesToBase64(succMat.mlDsaSecretKey),
    identityId: succMat.did,
    pnName: ctx.successor.pnName,
    recoveryConfig: {
      threshold: recoveryConfig.threshold,
      totalShares: recoveryConfig.totalShares,
      version: 1,
      createdAt: new Date().toISOString(),
    },
  });
  const recoveryEnvelope = await encryptRecoveryEnvelope(recoveryMaster, recoveryPayload);
  const shares = splitSecret(recoveryMaster, recoveryConfig.threshold, recoveryConfig.totalShares);
  const recoverySharesSealed = await sealRecoveryShares(shares, ctx.successor.pnName, ctx.successor.passcode);
  setPendingRecoverySharesBuffer({
    publicKey: succMat.publicKey,
    shares,
    threshold: recoveryConfig.threshold,
  });
  try {
    await initializeRecoveryVaultOnDrive({
      userPnIdentifier: succMat.pnIdentifier,
      authToken: ctx.authToken,
      publicKey: succMat.publicKey,
      shares,
      threshold: recoveryConfig.threshold,
    });
  } catch {
    /* Drive init may retry on custodian step */
  }
  ctx.successor.encryptedIdentity = {
    ...ctx.successor.encryptedIdentity,
    recoveryEnvelope,
    recoverySharesSealed,
  };
  progress = markStepComplete(progress, 'recovery_vault');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'recovery_vault');

  let driveReport: MigrationReport | null = null;
  let driveFailures: Array<{ path: string; reason: string }> = [];
  let driveFilesPendingAck = false;
  if (driveFolderId) {
    const driveBackend = await connectDriveBackendForMigration(ctx.predecessor.did);
    if (driveBackend) {
      try {
        const driveResult = await runFullDriveMigration({
          migrationId: plan.migrationId,
          authToken: ctx.authToken,
          drive: driveBackend,
          driveFolderId,
          predecessor: predMat,
          successor: succMat,
          onProgress: report,
          acknowledgeFailures: ctx.acknowledgeDriveFailures ?? false,
        });
        driveReport = driveResult.report;
        driveFailures = driveResult.failures;
      } catch (e) {
        driveFailures = [{ path: 'drive_files', reason: e instanceof Error ? e.message : 'drive_failed' }];
      }
    }
  }
  if (driveFailures.length > 0 && !ctx.acknowledgeDriveFailures) {
    driveFilesPendingAck = true;
    return {
      migrationId: plan.migrationId,
      plan,
      successorEncryptedIdentity: ctx.successor.encryptedIdentity,
      predecessorCustodians,
      recoveryThreshold: recoveryConfig.threshold,
      recoveryTotalShares: recoveryConfig.totalShares,
      driveFailures,
      driveReport,
      driveFilesPendingAck,
      startDriveFolderId: driveFolderId || null,
      predMat,
      succMat,
    };
  }

  progress = markStepComplete(progress, 'drive_files');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'drive_files');

  report('Handing off messaging verify to browser', 45);
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
  progress = markStepComplete(progress, 'profile_publish');
  await ackMigrationStep(ctx.authToken, plan.migrationId, 'profile_publish');

  localStorage.setItem(
    MIGRATION_STATE_KEY,
    serializeMigrationState({ plan, progress: { ...progress, legacyDmRoots: {} } })
  );

  return {
    migrationId: plan.migrationId,
    plan,
    successorEncryptedIdentity: ctx.successor.encryptedIdentity,
    predecessorCustodians,
    recoveryThreshold: recoveryConfig.threshold,
    recoveryTotalShares: recoveryConfig.totalShares,
    driveFailures,
    driveReport,
    driveFilesPendingAck,
    startDriveFolderId: driveFolderId || null,
    predMat,
    succMat,
  };
}

export async function ackDriveFilesStep(authToken: string, migrationId: string): Promise<void> {
  await ackMigrationStep(authToken, migrationId, 'drive_files');
}

export async function resumeMigrationAfterDriveAck(params: {
  authToken: string;
  migrationId: string;
  predecessor: IdentityKeyMaterial;
  successor: IdentityKeyMaterial;
  onProgress?: (label: string, pct: number) => void;
}): Promise<void> {
  const report = (label: string, pct: number) => params.onProgress?.(label, pct);
  await ackDriveFilesStep(params.authToken, params.migrationId);

  report('Handing off messaging verify to browser', 45);
  sessionStorage.setItem(
    'pn_identity_migration_kem_handoff',
    JSON.stringify({
      migrationId: params.migrationId,
      predecessorMlKemSecretKey: params.predecessor.mlKemSecretKey,
      predecessorMlKemPublicKey: params.predecessor.mlKemPublicKey,
      successorMlKemSecretKey: params.successor.mlKemSecretKey,
      successorMlKemPublicKey: params.successor.mlKemPublicKey,
    })
  );
  await ackMigrationStep(params.authToken, params.migrationId, 'profile_publish');

  const plan = await buildMigrationPlan({
    predecessorPublicKey: params.predecessor.publicKey,
    successorPublicKey: params.successor.publicKey,
    predecessorDid: params.predecessor.did,
    successorDid: params.successor.did,
    migrationId: params.migrationId,
  });
  let progress = createInitialProgress(params.migrationId);
  for (const stepId of ['zkp_reissue', 'recovery_vault', 'drive_files', 'profile_publish']) {
    progress = markStepComplete(progress, stepId);
  }
  localStorage.setItem(
    MIGRATION_STATE_KEY,
    serializeMigrationState({ plan, progress: { ...progress, legacyDmRoots: {} } })
  );
}

export async function finalizeIdentityMigration(params: {
  authToken: string;
  migrationId: string;
  predecessor: IdentityKeyMaterial;
  successor: IdentityKeyMaterial;
  successorEncryptedIdentity: EncryptedIdentity;
  driveFolderId?: string | null;
  onProgress?: (label: string, pct: number) => void;
}): Promise<{ successorEncryptedIdentity: EncryptedIdentity }> {
  const report = (label: string, pct: number) => params.onProgress?.(label, pct);

  await ackMigrationStep(params.authToken, params.migrationId, 'custodian_reinvite');

  report('Signing lineage proofs', 85);
  const { mlDsaSecretKey, mlDsaPublicKey } = await loadMlDsaKeypairForZk(
    params.successor.did,
    params.successorEncryptedIdentity
  );
  const lineage = await issueLineageZkpPair({
    migrationId: params.migrationId,
    predecessor: {
      publicKey: params.predecessor.publicKey,
      pnIdentifier: params.predecessor.pnIdentifier,
      mlDsaSecretKey: params.predecessor.mlDsaSecretKey,
      mlDsaPublicKey: params.predecessor.mlDsaPublicKey,
    },
    successor: {
      publicKey: params.successor.publicKey,
      pnIdentifier: params.successor.pnIdentifier,
      mlDsaSecretKey: params.successor.mlDsaSecretKey,
      mlDsaPublicKey,
    },
  });
  await ackMigrationStep(params.authToken, params.migrationId, 'lineage_zkp');

  report('Syncing owned assets manifest', 90);
  try {
    await republishOwnedAssetsManifest(params.authToken, params.successor.publicKey);
  } catch {
    /* IPFS optional */
  }
  await ackMigrationStep(params.authToken, params.migrationId, 'owned_assets_sync');

  report('Registering succession', 95);
  await completeIdentityMigration(params.authToken, params.migrationId, {
    lineagePredecessorProof: lineage.predecessorProof,
    lineageSuccessorProof: lineage.successorProof,
    driveFolderId: params.driveFolderId || undefined,
    successorPublicKey: params.successor.publicKey,
  });
  await ackMigrationStep(params.authToken, params.migrationId, 'succession_register');

  const oldHash = params.predecessor.publicKey.slice(0, 32);
  const newHash = params.successor.publicKey.slice(0, 32);
  await LicenseManager.transferLicense(oldHash, newHash).catch(() => {});

  report('Complete', 100);
  return { successorEncryptedIdentity: params.successorEncryptedIdentity };
}

/** @deprecated Use runIdentityMigrationCore + finalizeIdentityMigration */
export async function runIdentityMigration(ctx: MigrationContext): Promise<{
  migrationId: string;
  successorEncryptedIdentity: EncryptedIdentity;
}> {
  const core = await runIdentityMigrationCore(ctx);
  const fin = await finalizeIdentityMigration({
    authToken: ctx.authToken,
    migrationId: core.migrationId,
    predecessor: core.predMat,
    successor: core.succMat,
    successorEncryptedIdentity: core.successorEncryptedIdentity,
    driveFolderId: core.startDriveFolderId,
    onProgress: ctx.onProgress,
  });
  return { migrationId: core.migrationId, successorEncryptedIdentity: fin.successorEncryptedIdentity };
}

export {
  reencryptDriveFilePackage,
  parseEncryptedFilePackage,
  rekeyConnectionAsRequester,
  rewrapGroupForOwnerRotation,
  buildMemberMessageRootsFromRekeys,
  migrateOwnerVaultShares,
  reissueZkProofsFromEnvelopes,
};
