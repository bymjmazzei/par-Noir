/**
 * @jest-environment jsdom
 */
import { resolveRecoverySetupPhase } from '../components/recovery/recoverySetupPhase';

describe('resolveRecoverySetupPhase', () => {
  it('requires recovery auth first', () => {
    expect(
      resolveRecoverySetupPhase({
        recoveryAuthUnlocked: false,
        vaultRecoveryReady: false,
        pendingShareCount: 5,
        invitedCount: 0,
        acceptedCount: 0,
      })
    ).toBe('auth_required');
  });

  it('asks to seed when unlocked and vault empty', () => {
    expect(
      resolveRecoverySetupPhase({
        recoveryAuthUnlocked: true,
        vaultRecoveryReady: false,
        pendingShareCount: 0,
        invitedCount: 0,
        acceptedCount: 0,
      })
    ).toBe('needs_seed');
  });

  it('asks for custodians after seed with no invites', () => {
    expect(
      resolveRecoverySetupPhase({
        recoveryAuthUnlocked: true,
        vaultRecoveryReady: false,
        pendingShareCount: 5,
        invitedCount: 0,
        acceptedCount: 0,
      })
    ).toBe('needs_custodians');
  });

  it('manages when invites or accepts exist but not ready', () => {
    expect(
      resolveRecoverySetupPhase({
        recoveryAuthUnlocked: true,
        vaultRecoveryReady: false,
        pendingShareCount: 3,
        invitedCount: 2,
        acceptedCount: 0,
      })
    ).toBe('managing');
  });

  it('ready when vaultRecoveryReady', () => {
    expect(
      resolveRecoverySetupPhase({
        recoveryAuthUnlocked: true,
        vaultRecoveryReady: true,
        pendingShareCount: 0,
        invitedCount: 0,
        acceptedCount: 3,
      })
    ).toBe('ready');
  });
});
