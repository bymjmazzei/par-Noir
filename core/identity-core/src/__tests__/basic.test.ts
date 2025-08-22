import { MilitaryGradeCrypto as CryptoManager } from '../../dist/encryption/crypto';

describe('Basic Crypto Tests', () => {
  describe('validatePasscode', () => {
    it('should validate strong passcodes', () => {
      const strongPasscode = 'MySecurePass123!@#';
      const result = CryptoManager.validatePasscode(strongPasscode);
      expect(result.isValid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should reject weak passcodes', () => {
      const weakPasscode = '123456';
      const result = CryptoManager.validatePasscode(weakPasscode);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require minimum length', () => {
      const shortPasscode = 'Abc1!';
      const result = CryptoManager.validatePasscode(shortPasscode);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Passcode must be at least 12 characters long');
    });
  });

  describe('Constants', () => {
    it('should have correct minimum passcode length', () => {
      expect(CryptoManager.MIN_PASSCODE_LENGTH).toBe(12);
    });

    it('should have correct max login attempts', () => {
      expect(CryptoManager.MAX_LOGIN_ATTEMPTS).toBe(5);
    });

    it('should have correct lockout duration', () => {
      expect(CryptoManager.LOCKOUT_DURATION).toBe(15 * 60 * 1000); // 15 minutes
    });
  });

  describe('Account Lockout', () => {
    beforeEach(() => {
      // Clear any existing failed attempts
      CryptoManager.clearFailedAttempts('testuser');
    });

    it('should track failed attempts', () => {
      expect(CryptoManager.isAccountLocked('testuser')).toBe(false);
      
      CryptoManager.recordFailedAttempt('testuser');
      expect(CryptoManager.isAccountLocked('testuser')).toBe(false);
      
      // Record multiple failed attempts
      for (let i = 0; i < 5; i++) {
        CryptoManager.recordFailedAttempt('testuser');
      }
      
      expect(CryptoManager.isAccountLocked('testuser')).toBe(true);
    });

    it('should clear failed attempts', () => {
      CryptoManager.recordFailedAttempt('testuser');
      CryptoManager.clearFailedAttempts('testuser');
      expect(CryptoManager.isAccountLocked('testuser')).toBe(false);
    });
  });
});
