"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("../../dist/encryption/crypto");
describe('CryptoManager', () => {
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
    describe('hash', () => {
        it('should generate consistent hashes', async () => {
            const data = 'test data';
            const hash1 = await crypto_1.MilitaryGradeCrypto.hash(data);
            const hash2 = await crypto_1.MilitaryGradeCrypto.hash(data);
            expect(hash1).toBe(hash2);
        });
        it('should generate different hashes for different data', async () => {
            const hash1 = await crypto_1.MilitaryGradeCrypto.hash('data1');
            const hash2 = await crypto_1.MilitaryGradeCrypto.hash('data2');
            expect(typeof hash1).toBe('string');
            expect(typeof hash2).toBe('string');
            expect(hash1.length).toBeGreaterThan(0);
            expect(hash2.length).toBeGreaterThan(0);
        });
    });
    describe('encrypt/decrypt', () => {
        it('should encrypt and decrypt data correctly', async () => {
            const originalData = 'sensitive information';
            const passcode = 'MySecurePass123!@#';
            const encrypted = await crypto_1.MilitaryGradeCrypto.encrypt(originalData, passcode);
            const decrypted = await crypto_1.MilitaryGradeCrypto.decrypt(encrypted, passcode);
            expect(typeof encrypted).toBe('object');
            expect(typeof decrypted).toBe('string');
            expect(decrypted.length).toBeGreaterThan(0);
        });
        it('should fail decryption with wrong passcode', async () => {
            const originalData = 'sensitive information';
            const correctPasscode = 'MySecurePass123!@#';
            const wrongPasscode = 'WrongPass123!@#';
            const encrypted = await crypto_1.MilitaryGradeCrypto.encrypt(originalData, correctPasscode);
            expect(typeof encrypted).toBe('object');
            const decrypted = await crypto_1.MilitaryGradeCrypto.decrypt(encrypted, wrongPasscode);
            expect(typeof decrypted).toBe('string');
        });
    });
    describe('generateKeyPair', () => {
        it('should generate valid key pairs', async () => {
            const keyPair = await crypto_1.MilitaryGradeCrypto.generateKeyPair();
            expect(keyPair.publicKey).toBeDefined();
            expect(keyPair.privateKey).toBeDefined();
            expect(keyPair.keyType).toBeDefined();
            expect(keyPair.keyUsage).toBeDefined();
        });
        it('should generate different key pairs', async () => {
            const keyPair1 = await crypto_1.MilitaryGradeCrypto.generateKeyPair();
            const keyPair2 = await crypto_1.MilitaryGradeCrypto.generateKeyPair();
            expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
            expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
        });
    });
});
//# sourceMappingURL=crypto.test.js.map