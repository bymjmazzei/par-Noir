import { cryptoWorkerManager } from './cryptoWorkerManager';
import { RecoveryKeyData } from '../types/crypto';

export class RecoveryKeyManager {
    /**
     * Generate secure recovery key
     */
    static async generateRecoveryKey(identityId: string, purpose: string): Promise<string> {
        try {
            const keyData: RecoveryKeyData = {
                identityId,
                purpose,
                timestamp: Date.now(),
                random: await cryptoWorkerManager.generateRandom(new Uint8Array(32))
            };
            const keyString = JSON.stringify(keyData);
            const encoder = new TextEncoder();
            const data = encoder.encode(keyString);
            // Generate SHA-256 hash
            const hashBuffer = await cryptoWorkerManager.hash('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return `recovery-${hashHex.substring(0, 32)}`;
        } catch (error) {
            throw new Error(`Failed to generate recovery key: ${error}`);
        }
    }

    /**
     * Generate a set of recovery keys
     * Simple implementation to avoid crypto operation errors
     */
    static async generateRecoveryKeySet(_identityId: string, totalKeys: number = 5): Promise<string[]> {
        try {
            // Console statement removed for production
            const recoveryKeys: string[] = [];
            const purposes = ['personal', 'legal', 'insurance', 'will', 'emergency'];
            
            for (let i = 0; i < totalKeys; i++) {
                // Generate a simple recovery key using random values
                const randomBytes = await cryptoWorkerManager.generateRandom(new Uint8Array(16));
                const keyHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                const recoveryKey = `recovery-${purposes[i] || `backup-${i + 1}`}-${keyHex}`;
                recoveryKeys.push(recoveryKey);
            }
            return recoveryKeys;
        } catch (error) {
            throw new Error(`Failed to generate recovery key set: ${error}`);
        }
    }
}
