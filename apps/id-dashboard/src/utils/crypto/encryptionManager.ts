import { cryptoWorkerManager } from './cryptoWorkerManager';
// Encryption and Decryption Operations
import { EncryptedData, DecryptionParameters } from '../types/crypto';

export class EncryptionManager {
    /**
     * Encrypt data with passcode
     */
    static async encrypt(data: string, passcode: string): Promise<EncryptedData> {
        try {
            const salt = this.generateSalt();
            const key = await this.deriveKey(passcode, salt);
            const iv = this.generateIV();
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            const encryptedBuffer = await cryptoWorkerManager.encrypt({ name: 'AES-GCM', iv }, key, dataBuffer);
            return {
                encrypted: this.arrayBufferToBase64(encryptedBuffer),
                iv: this.arrayBufferToBase64(iv),
                salt
            };
        } catch (error) {
            throw new Error('Failed to encrypt data');
        }
    }

    /**
     * DEPRECATED: Legacy decryption method - SECURITY VULNERABILITY
     * This function tries multiple parameter combinations and can allow wrong credentials to work.
     * DO NOT USE - This was a security flaw that bypassed proper credential validation.
     *
     * @deprecated This method is dangerous and should not be used
     */
    static async legacyDecrypt(encryptedData: EncryptedData, passcode: string): Promise<string> {
        try {
            // Console statement removed for production
            const encoder = new TextEncoder();
            const passcodeBuffer = encoder.encode(passcode);
            const saltBuffer = this.base64ToArrayBuffer(encryptedData.salt);
            const iv = this.base64ToArrayBuffer(encryptedData.iv);
            const data = this.base64ToArrayBuffer(encryptedData.encrypted);
            
            // Try multiple parameter combinations for backward compatibility
            const parameterSets: DecryptionParameters[] = [
                { iterations: 100000, hash: 'SHA-256' },
                { iterations: 10000, hash: 'SHA-256' },
                { iterations: 1000, hash: 'SHA-256' },
                { iterations: 100000, hash: 'SHA-1' },
                { iterations: 10000, hash: 'SHA-1' },
                { iterations: 1000, hash: 'SHA-1' },
                { iterations: 1000000, hash: 'SHA-256' }, // Current standard
                { iterations: 1000000, hash: 'SHA-512' }, // Current standard
            ];
            
            for (const params of parameterSets) {
                try {
                    // Console statement removed for production
                    const keyMaterial = await cryptoWorkerManager.importKey('raw', passcodeBuffer, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
                    const derivedKey = await cryptoWorkerManager.deriveKey({
                        name: 'PBKDF2',
                        salt: saltBuffer,
                        iterations: params.iterations,
                        hash: params.hash,
                    }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                    const decryptedBuffer = await cryptoWorkerManager.decrypt({ name: 'AES-GCM', iv }, derivedKey, data);
                    const decoder = new TextDecoder();
                    const decryptedData = decoder.decode(decryptedBuffer);
                    // Try to parse as JSON to validate it's correct
                    JSON.parse(decryptedData);
                    // Console statement removed for production
                    return decryptedData;
                } catch (paramError) {
                    // Console statement removed for production
                    continue; // Try next parameter set
                }
            }
            throw new Error('All decryption parameter combinations failed');
        } catch (error) {
            throw new Error('Legacy decryption failed');
        }
    }

    /**
     * Decrypt data with passcode
     */
    static async decrypt(encryptedData: EncryptedData, passcode: string): Promise<string> {
        try {
            const key = await this.deriveKey(passcode, encryptedData.salt);
            const iv = this.base64ToArrayBuffer(encryptedData.iv);
            const data = this.base64ToArrayBuffer(encryptedData.encrypted);
            const decryptedBuffer = await cryptoWorkerManager.decrypt({ name: 'AES-GCM', iv }, key, data);
            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            throw new Error('Failed to decrypt data');
        }
    }

    /**
     * Derive encryption key from passcode
     */
    private static async deriveKey(passcode: string, salt: string): Promise<CryptoKey> {
        try {
            const encoder = new TextEncoder();
            const passcodeBuffer = encoder.encode(passcode);
            const saltBuffer = this.base64ToArrayBuffer(salt);
            const keyMaterial = await cryptoWorkerManager.importKey('raw', passcodeBuffer, 'PBKDF2', false, ['deriveBits', 'deriveKey']);
            const derivedKey = await cryptoWorkerManager.deriveKey({
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: 1000000, // Military-grade: 1M iterations
                hash: 'SHA-512', // Military-grade: SHA-512
            }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            return derivedKey;
        } catch (error) {
            throw new Error('Failed to derive encryption key');
        }
    }

    /**
     * Generate salt for encryption
     */
    private static async generateSalt(): Promise<string> {
        const salt = await cryptoWorkerManager.generateRandom(new Uint8Array(16));
        return this.arrayBufferToBase64(salt);
    }

    /**
     * Generate IV for encryption
     */
    private static async generateIV(): Promise<Uint8Array> {
        return await cryptoWorkerManager.generateRandom(new Uint8Array(12));
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    private static arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    private static base64ToArrayBuffer(base64: string): ArrayBuffer {
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (error) {
            throw new Error('Failed to convert base64 to ArrayBuffer');
        }
    }
}
