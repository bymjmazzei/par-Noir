"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("../../dist/encryption/crypto");
describe('Import Tests', () => {
    it('should import CryptoManager correctly', () => {
        expect(crypto_1.MilitaryGradeCrypto).toBeDefined();
        expect(typeof crypto_1.MilitaryGradeCrypto).toBe('function');
    });
    it('should have static constants', () => {
        expect(crypto_1.MilitaryGradeCrypto.MIN_PASSCODE_LENGTH).toBe(12);
        expect(crypto_1.MilitaryGradeCrypto.MAX_LOGIN_ATTEMPTS).toBe(5);
        expect(crypto_1.MilitaryGradeCrypto.LOCKOUT_DURATION).toBe(15 * 60 * 1000);
    });
    it('should have static methods', () => {
        expect(typeof crypto_1.MilitaryGradeCrypto.validatePasscode).toBe('function');
        expect(typeof crypto_1.MilitaryGradeCrypto.isAccountLocked).toBe('function');
        expect(typeof crypto_1.MilitaryGradeCrypto.recordFailedAttempt).toBe('function');
        expect(typeof crypto_1.MilitaryGradeCrypto.clearFailedAttempts).toBe('function');
    });
});
//# sourceMappingURL=import.test.js.map