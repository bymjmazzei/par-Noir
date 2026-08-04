/**
 * Pure phase resolver for the Shamir recovery journey UI.
 */

export type RecoverySetupPhase =
  | 'auth_required'
  | 'needs_seed'
  | 'needs_custodians'
  | 'managing'
  | 'ready';

export interface RecoverySetupPhaseInput {
  recoveryAuthUnlocked: boolean;
  vaultRecoveryReady: boolean;
  /** Unassigned shares in the Drive pending pool (after seed). */
  pendingShareCount: number;
  invitedCount: number;
  acceptedCount: number;
  /** True when .pn has sealed shares and vault can be seeded. */
  canSeedFromMaterial?: boolean;
}

export function resolveRecoverySetupPhase(input: RecoverySetupPhaseInput): RecoverySetupPhase {
  if (!input.recoveryAuthUnlocked) {
    return 'auth_required';
  }
  if (input.vaultRecoveryReady) {
    return 'ready';
  }
  const seeded =
    input.pendingShareCount > 0 || input.invitedCount > 0 || input.acceptedCount > 0;
  if (!seeded) {
    return 'needs_seed';
  }
  if (input.invitedCount === 0 && input.acceptedCount === 0) {
    return 'needs_custodians';
  }
  return 'managing';
}
