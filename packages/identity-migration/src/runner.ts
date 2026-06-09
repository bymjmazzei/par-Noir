import { allRequiredStepsComplete } from './catalog';
import type { MigrationPlan, MigrationProgress, MigrationStepKind } from './types';

export interface MigrationRunnerState {
  plan: MigrationPlan;
  progress: MigrationProgress;
}

export function createInitialProgress(migrationId: string): MigrationProgress {
  return {
    migrationId,
    completedStepIds: [],
    legacyDmRoots: {},
    updatedAt: new Date().toISOString(),
  };
}

export function markStepComplete(
  progress: MigrationProgress,
  stepId: string,
  legacyDmRoots?: Record<string, string>
): MigrationProgress {
  const completed = new Set(progress.completedStepIds);
  completed.add(stepId);
  return {
    ...progress,
    completedStepIds: [...completed],
    legacyDmRoots: legacyDmRoots
      ? { ...progress.legacyDmRoots, ...legacyDmRoots }
      : progress.legacyDmRoots,
    updatedAt: new Date().toISOString(),
  };
}

export function isMigrationReadyToComplete(state: MigrationRunnerState): boolean {
  return allRequiredStepsComplete(state.plan, state.progress.completedStepIds);
}

export function nextPendingStep(state: MigrationRunnerState): MigrationStepKind | null {
  for (const step of state.plan.steps) {
    if (!state.progress.completedStepIds.includes(step.id)) {
      return step.kind;
    }
  }
  return null;
}

export function serializeMigrationState(state: MigrationRunnerState): string {
  return JSON.stringify(state);
}

export function parseMigrationState(json: string): MigrationRunnerState | null {
  try {
    const parsed = JSON.parse(json) as MigrationRunnerState;
    if (!parsed.plan?.migrationId || !parsed.progress?.migrationId) return null;
    return parsed;
  } catch {
    return null;
  }
}
