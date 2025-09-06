import { cryptoWorkerManager } from './cryptoWorkerManager';
// Authentication Token Management
import { TokenHeader, TokenPayload } from '../types/crypto';

export class TokenManager {
    private static readonly TOKEN_EXPIRY = 3600; // 1 hour

    /**
     * Generate authentication token
     */
    static async generateAuthToken(did: string, username: string): Promise<string> {
        try {
            const header: TokenHeader = {
                alg: 'HS256',
                typ: 'JWT'
            };
            const payload: TokenPayload = {
                did,
                username,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + this.TOKEN_EXPIRY
            };
            const headerB64 = btoa(JSON.stringify(header));
            const payloadB64 = btoa(JSON.stringify(payload));
            // In a real implementation, this would be signed with a secret key
            const signature = await this.generateSignature(headerB64 + '.' + payloadB64);
            return `${headerB64}.${payloadB64}.${signature}`;
        } catch (error) {
            throw new Error('Failed to generate authentication token');
        }
    }

    /**
     * Verify authentication token
     */
    static async verifyAuthToken(token: string, expectedDID: string): Promise<boolean> {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length !== 3) {
                return false;
            }
            
            const [headerB64, payloadB64, signature] = tokenParts;
            
            // Verify signature
            const expectedSignature = await this.generateSignature(headerB64 + '.' + payloadB64);
            if (signature !== expectedSignature) {
                return false;
            }
            
            // Verify payload
            const payload = JSON.parse(atob(payloadB64));
            const now = Math.floor(Date.now() / 1000);
            
            return payload.did === expectedDID && payload.exp > now;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate signature for token
     */
    private static async generateSignature(data: string): Promise<string> {
        try {
            const encoder = new TextEncoder();
            const dataBuffer = encoder.encode(data);
            // Use a simple hash for demo - in production, use proper HMAC
            const hashBuffer = await cryptoWorkerManager.hash('SHA-256', dataBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
        } catch (error) {
            throw new Error('Failed to generate cryptographic signature');
        }
    }

    /**
     * Get token expiry time
     */
    static async getTokenExpiry(): Promise<number> {
        return this.TOKEN_EXPIRY;
    }
}
