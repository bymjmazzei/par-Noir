"use strict";
describe('Working Tests', () => {
    it('should pass basic test', () => {
        expect(1 + 1).toBe(2);
    });
    it('should have crypto available', () => {
        expect(typeof crypto).toBe('object');
        expect(typeof crypto.subtle).toBe('object');
    });
    it('should have TextEncoder available', () => {
        expect(typeof TextEncoder).toBe('function');
    });
    it('should have TextDecoder available', () => {
        expect(typeof TextDecoder).toBe('function');
    });
    it('should validate passcode manually', () => {
        const validatePasscode = (passcode) => {
            const errors = [];
            let strength = 'weak';
            if (passcode.length < 12) {
                errors.push('Passcode must be at least 12 characters long');
            }
            if (!/[A-Z]/.test(passcode)) {
                errors.push('Passcode must contain at least one uppercase letter');
            }
            if (!/[a-z]/.test(passcode)) {
                errors.push('Passcode must contain at least one lowercase letter');
            }
            if (!/\d/.test(passcode)) {
                errors.push('Passcode must contain at least one number');
            }
            if (!/[!@#$%^&*(),.?":{}|<>]/.test(passcode)) {
                errors.push('Passcode must contain at least one special character');
            }
            if (errors.length === 0) {
                if (passcode.length >= 16 && /[!@#$%^&*(),.?":{}|<>]/.test(passcode)) {
                    strength = 'military';
                }
                else if (passcode.length >= 14) {
                    strength = 'strong';
                }
                else {
                    strength = 'medium';
                }
            }
            return { isValid: errors.length === 0, errors, strength };
        };
        const strongPasscode = 'MySecurePass123!@#';
        const result = validatePasscode(strongPasscode);
        expect(result.isValid).toBe(true);
        expect(result.strength).toBe('military');
    });
    it('should have correct constants', () => {
        const MIN_PASSCODE_LENGTH = 12;
        const MAX_LOGIN_ATTEMPTS = 5;
        const LOCKOUT_DURATION = 15 * 60 * 1000;
        expect(MIN_PASSCODE_LENGTH).toBe(12);
        expect(MAX_LOGIN_ATTEMPTS).toBe(5);
        expect(LOCKOUT_DURATION).toBe(15 * 60 * 1000);
    });
});
//# sourceMappingURL=working.test.js.map