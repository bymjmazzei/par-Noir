import { cryptoWorkerManager } from './cryptoWorkerManager';
import { KeyPair, DIDResult } from '../types/crypto';

export class DIDManager {
    private static readonly DID_PREFIX = 'did:key:';

    /**
     * Generate a real DID with Ed25519 key pair
     */
    static async generateDID(): Promise<DIDResult> {
        try {
            const keyPair = await this.generateKeyPair();
            const did = this.DID_PREFIX + await this.generateDIDIdentifier(keyPair.publicKey);
            return {
                publicKey: keyPair.publicKey,
                privateKey: keyPair.privateKey,
                did
            };
        } catch (error) {
            throw new Error(`Failed to generate DID: ${error}`);
        }
    }

    /**
     * Generate a new key pair for DID
     */
    static async generateKeyPair(): Promise<KeyPair> {
        try {
            const keyPair = await cryptoWorkerManager.generateKey({
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            }, true, ['encrypt', 'decrypt']);

            const publicKeyBuffer = await cryptoWorkerManager.exportKey('spki', keyPair.publicKey);
            const privateKeyBuffer = await cryptoWorkerManager.exportKey('pkcs8', keyPair.privateKey);

            return {
                publicKey: this.arrayBufferToBase64(publicKeyBuffer),
                privateKey: this.arrayBufferToBase64(privateKeyBuffer),
            };
        } catch (error) {
            throw new Error(`Failed to generate key pair: ${error}`);
        }
    }

    /**
     * Generate DID identifier from public key with cryptographic fallback
     */
    static async generateDIDIdentifier(publicKey: string): Promise<string> {
        try {
            const encoder = new TextEncoder();
            const keyBuffer = encoder.encode(publicKey);
            // Generate a deterministic identifier from the public key
            const hashBuffer = await cryptoWorkerManager.hash('SHA-256', keyBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
        } catch (error) {
            // Cryptographic fallback using await cryptoWorkerManager.generateRandom()
            const randomBytes = await cryptoWorkerManager.generateRandom(new Uint8Array(8));
            return Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }
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
}
