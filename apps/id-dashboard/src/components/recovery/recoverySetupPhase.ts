/**
 * Pure phase resolver for the Shamir recovery journey UI.
 */

export type RecoverySetupPhase =
  | 'auth_required'
  | 'needs_custodians'
  | 'managing'
  | 'ready';

export interface RecoverySetupPhaseInput {
  recoveryAuthUnlocked: boolean;
  vaultRecoveryReady: boolean;
  invitedCount: number;
  acceptedCount: number;
}

export function resolveRecoverySetupPhase(input: RecoverySetupPhaseInput): RecoverySetupPhase {
  if (!input.recoveryAuthUnlocked) {
    return 'auth_required';
  }
  if (input.vaultRecoveryReady) {
    return 'ready';
  }
  if (input.invitedCount === 0 && input.acceptedCount === 0) {
    return 'needs_custodians';
  }
  return 'managing';
}
