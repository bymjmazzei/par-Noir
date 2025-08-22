// Test to verify imports work correctly
import { MilitaryGradeCrypto as CryptoManager } from '../../dist/encryption/crypto';

describe('Import Tests', () => {
  it('should import CryptoManager correctly', () => {
    expect(CryptoManager).toBeDefined();
    expect(typeof CryptoManager).toBe('function');
  });

  it('should have static constants', () => {
    expect(CryptoManager.MIN_PASSCODE_LENGTH).toBe(12);
    expect(CryptoManager.MAX_LOGIN_ATTEMPTS).toBe(5);
    expect(CryptoManager.LOCKOUT_DURATION).toBe(15 * 60 * 1000);
  });

  it('should have static methods', () => {
    expect(typeof CryptoManager.validatePasscode).toBe('function');
    expect(typeof CryptoManager.isAccountLocked).toBe('function');
    expect(typeof CryptoManager.recordFailedAttempt).toBe('function');
    expect(typeof CryptoManager.clearFailedAttempts).toBe('function');
  });
});
