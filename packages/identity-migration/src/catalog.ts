import { VolumeIdGenerator } from '@par-noir/aggregator-domain';
import type { MigrationPlan, MigrationStep } from './types';

export function createMigrationId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `mig_${hex}`;
}

export function defaultMigrationSteps(): MigrationStep[] {
  return [
    { id: 'drive_files', kind: 'drive_files', label: 'Re-encrypt Drive files', required: true },
    { id: 'zkp_reissue', kind: 'zkp_reissue', label: 'Re-issue ZK proofs', required: true },
    { id: 'recovery_vault', kind: 'recovery_vault', label: 'Rebuild recovery vault', required: true },
    { id: 'dm_rekey', kind: 'dm_rekey', label: 'Re-key direct messages', required: true },
    { id: 'group_rewrap', kind: 'group_rewrap', label: 'Re-wrap group chat keys', required: true },
    { id: 'profile_publish', kind: 'profile_publish', label: 'Publish new messaging keys', required: true },
    { id: 'lineage_zkp', kind: 'lineage_zkp', label: 'Sign identity succession proofs', required: true },
    { id: 'succession_register', kind: 'succession_register', label: 'Register network succession', required: true },
  ];
}

export async function buildMigrationPlan(params: {
  predecessorPublicKey: string;
  successorPublicKey: string;
  predecessorDid: string;
  successorDid: string;
  migrationId?: string;
}): Promise<MigrationPlan> {
  const migrationId = params.migrationId ?? createMigrationId();
  const predecessorPnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(
    params.predecessorPublicKey
  );
  const successorPnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(
    params.successorPublicKey
  );
  return {
    migrationId,
    predecessorPnIdentifier,
    successorPnIdentifier,
    predecessorDid: params.predecessorDid,
    successorDid: params.successorDid,
    steps: defaultMigrationSteps(),
    createdAt: new Date().toISOString(),
  };
}

export function allRequiredStepsComplete(plan: MigrationPlan, completedStepIds: string[]): boolean {
  const required = plan.steps.filter((s) => s.required).map((s) => s.id);
  return required.every((id) => completedStepIds.includes(id));
}
