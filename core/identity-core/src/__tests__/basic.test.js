"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("../../dist/encryption/crypto");
describe('Basic Crypto Tests', () => {
    describe('validatePasscode', () => {
        it('should validate strong passcodes', () => {
            const strongPasscode = 'MySecurePass123!@#';
            const result = crypto_1.MilitaryGradeCrypto.validatePasscode(strongPasscode);
            expect(result.isValid).toBe(true);
            expect(result.strength).toBe('strong');
        });
        it('should reject weak passcodes', () => {
            const weakPasscode = '123456';
            const result = crypto_1.MilitaryGradeCrypto.validatePasscode(weakPasscode);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
        it('should require minimum length', () => {
            const shortPasscode = 'Abc1!';
            const result = crypto_1.MilitaryGradeCrypto.validatePasscode(shortPasscode);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Passcode must be at least 12 characters long');
        });
    });
    describe('Constants', () => {
        it('should have correct minimum passcode length', () => {
            expect(crypto_1.MilitaryGradeCrypto.MIN_PASSCODE_LENGTH).toBe(12);
        });
        it('should have correct max login attempts', () => {
            expect(crypto_1.MilitaryGradeCrypto.MAX_LOGIN_ATTEMPTS).toBe(5);
        });
        it('should have correct lockout duration', () => {
            expect(crypto_1.MilitaryGradeCrypto.LOCKOUT_DURATION).toBe(15 * 60 * 1000);
        });
    });
    describe('Account Lockout', () => {
        beforeEach(() => {
            crypto_1.MilitaryGradeCrypto.clearFailedAttempts('testuser');
        });
        it('should track failed attempts', () => {
            expect(crypto_1.MilitaryGradeCrypto.isAccountLocked('testuser')).toBe(false);
            crypto_1.MilitaryGradeCrypto.recordFailedAttempt('testuser');
            expect(crypto_1.MilitaryGradeCrypto.isAccountLocked('testuser')).toBe(false);
            for (let i = 0; i < 5; i++) {
                crypto_1.MilitaryGradeCrypto.recordFailedAttempt('testuser');
            }
            expect(crypto_1.MilitaryGradeCrypto.isAccountLocked('testuser')).toBe(true);
        });
        it('should clear failed attempts', () => {
            crypto_1.MilitaryGradeCrypto.recordFailedAttempt('testuser');
            crypto_1.MilitaryGradeCrypto.clearFailedAttempts('testuser');
            expect(crypto_1.MilitaryGradeCrypto.isAccountLocked('testuser')).toBe(false);
        });
    });
});
//# sourceMappingURL=basic.test.js.map