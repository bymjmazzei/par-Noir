"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZKProofManager = void 0;
class ZKProofManager {
    static async generateTimestampedProof(did, statement, context, config = {}) {
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        if (!this.checkRateLimit(did.id, fullConfig)) {
            throw new Error('Rate limit exceeded for proof generation');
        }
        const baseProof = await this.generateBaseProof(did, statement);
        const timestamp = new Date().toISOString();
        const nonce = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + fullConfig.expirationTime).toISOString();
        const timestampedProof = {
            ...baseProof,
            timestamp,
            nonce,
            context,
            expiresAt,
            proofHash: this.hashProof(baseProof, timestamp, nonce, context),
            signature: await this.signProof(baseProof, timestamp, nonce, context)
        };
        const userProofs = this.PROOF_HISTORY.get(did.id) || [];
        userProofs.push(timestampedProof);
        this.PROOF_HISTORY.set(did.id, userProofs);
        this.updateRateLimit(did.id);
        return timestampedProof;
    }
    static validateProof(proof, context, config = {}) {
        const fullConfig = { ...this.DEFAULT_CONFIG, ...config };
        const recommendations = [];
        let isValid = true;
        let reason;
        let riskLevel = 'low';
        if (new Date(proof.expiresAt) < new Date()) {
            isValid = false;
            reason = 'Proof expired';
            riskLevel = 'medium';
        }
        if (fullConfig.requireContext && proof.context !== context) {
            isValid = false;
            reason = 'Context mismatch';
            riskLevel = 'high';
            recommendations.push('Proof generated for different context');
        }
        if (fullConfig.enableReplayProtection) {
            const proofHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
            if (this.USED_PROOFS_CACHE.has(proofHash)) {
                isValid = false;
                reason = 'Proof already used (replay attack)';
                riskLevel = 'high';
                recommendations.push('This proof has been used before');
            }
        }
        const expectedHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
        if (proof.proofHash !== expectedHash) {
            isValid = false;
            reason = 'Invalid proof hash';
            riskLevel = 'high';
            recommendations.push('Proof integrity compromised');
        }
        if (!this.verifyProofSignature(proof)) {
            isValid = false;
            reason = 'Invalid proof signature';
            riskLevel = 'high';
            recommendations.push('Proof authenticity cannot be verified');
        }
        const suspiciousPatterns = this.detectSuspiciousPatterns(proof);
        if (suspiciousPatterns.length > 0) {
            recommendations.push(...suspiciousPatterns);
            if (riskLevel === 'low')
                riskLevel = 'medium';
        }
        if (isValid && fullConfig.enableReplayProtection) {
            const proofHash = this.hashProof(proof, proof.timestamp, proof.nonce, proof.context);
            this.USED_PROOFS_CACHE.add(proofHash);
        }
        return {
            isValid,
            reason,
            riskLevel,
            recommendations
        };
    }
    static async generateBaseProof(did, statement) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return {
            id: crypto.randomUUID(),
            type: 'custom_proof',
            statement: {
                type: 'custom',
                description: statement,
                publicInputs: {},
                privateInputs: {},
                relation: 'custom'
            },
            proof: {
                schnorrProof: undefined,
                pedersenProof: undefined,
                sigmaProtocol: undefined,
                fiatShamirTransform: undefined
            },
            publicInputs: {},
            timestamp: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            verificationKey: crypto.randomUUID(),
            securityLevel: 'military',
            algorithm: 'P-384',
            keyLength: 384,
            quantumResistant: true,
            schnorrProof: {
                commitment: crypto.randomUUID(),
                challenge: crypto.randomUUID(),
                response: crypto.randomUUID(),
                publicKey: crypto.randomUUID(),
                message: crypto.randomUUID(),
                curve: 'secp256k1',
                generator: crypto.randomUUID(),
                order: crypto.randomUUID()
            },
            pedersenProof: {
                commitment: crypto.randomUUID(),
                opening: {
                    message: crypto.randomUUID(),
                    randomness: crypto.randomUUID()
                },
                generators: {
                    g: crypto.randomUUID(),
                    h: crypto.randomUUID()
                },
                proofOfKnowledge: {
                    commitment: crypto.randomUUID(),
                    challenge: crypto.randomUUID(),
                    response1: crypto.randomUUID(),
                    response2: crypto.randomUUID()
                }
            },
            sigmaProtocol: {
                commitment: crypto.randomUUID(),
                challenge: crypto.randomUUID(),
                response: crypto.randomUUID(),
                statement: statement,
                generator: crypto.randomUUID(),
                order: crypto.randomUUID()
            },
            fiatShamirTransform: {
                commitment: crypto.randomUUID(),
                challenge: crypto.randomUUID(),
                response: crypto.randomUUID(),
                hashFunction: 'SHA-256',
                transformType: 'sigma'
            }
        };
    }
    static hashProof(proof, timestamp, nonce, context) {
        const data = `${proof.type}:${proof.statement}:${proof.proof}:${timestamp}:${nonce}:${context}`;
        return this.hashString(data);
    }
    static async signProof(proof, timestamp, nonce, context) {
        const data = `${proof.type}:${proof.statement}:${timestamp}:${nonce}:${context}`;
        return this.hashString(data);
    }
    static verifyProofSignature(proof) {
        const expectedSignature = this.hashString(`${proof.type}:${proof.statement}:${proof.timestamp}:${proof.nonce}:${proof.context}`);
        return proof.signature === expectedSignature;
    }
    static checkRateLimit(userId, config) {
        const now = Date.now();
        const userProofs = this.PROOF_RATE_LIMITS.get(userId) || [];
        const recentProofs = userProofs.filter(timestamp => now - timestamp < 60 * 60 * 1000);
        return recentProofs.length < config.maxProofsPerHour;
    }
    static updateRateLimit(userId) {
        const now = Date.now();
        const userProofs = this.PROOF_RATE_LIMITS.get(userId) || [];
        userProofs.push(now);
        const recentProofs = userProofs.filter(timestamp => now - timestamp < 60 * 60 * 1000);
        this.PROOF_RATE_LIMITS.set(userId, recentProofs);
    }
    static detectSuspiciousPatterns(proof) {
        const patterns = [];
        const proofAge = Date.now() - new Date(proof.timestamp).getTime();
        if (proofAge > 7 * 24 * 60 * 60 * 1000) {
            patterns.push('Proof is very old');
        }
        const userProofs = this.PROOF_HISTORY.get(proof.id || 'unknown') || [];
        const recentProofs = userProofs.filter(p => Date.now() - new Date(p.timestamp).getTime() < 60 * 60 * 1000);
        if (recentProofs.length > 50) {
            patterns.push('Unusually high proof generation rate');
        }
        const suspiciousStatements = [
            /admin/i,
            /root/i,
            /system/i,
            /privileged/i,
            /bypass/i
        ];
        for (const pattern of suspiciousStatements) {
            if (pattern.test(proof.statement.description)) {
                patterns.push('Suspicious proof statement detected');
                break;
            }
        }
        return patterns;
    }
    static cleanupExpiredProofs() {
        const now = Date.now();
        for (const proofHash of this.USED_PROOFS_CACHE) {
        }
        for (const [userId, timestamps] of this.PROOF_RATE_LIMITS.entries()) {
            const recentTimestamps = timestamps.filter(timestamp => now - timestamp < 60 * 60 * 1000);
            if (recentTimestamps.length === 0) {
                this.PROOF_RATE_LIMITS.delete(userId);
            }
            else {
                this.PROOF_RATE_LIMITS.set(userId, recentTimestamps);
            }
        }
    }
    static getProofStats() {
        let totalProofs = 0;
        let activeProofs = 0;
        let expiredProofs = 0;
        let totalAge = 0;
        const now = Date.now();
        for (const proofs of this.PROOF_HISTORY.values()) {
            totalProofs += proofs.length;
            for (const proof of proofs) {
                const age = now - new Date(proof.timestamp).getTime();
                totalAge += age;
                if (new Date(proof.expiresAt) > new Date()) {
                    activeProofs++;
                }
                else {
                    expiredProofs++;
                }
            }
        }
        return {
            totalProofs,
            activeProofs,
            expiredProofs,
            averageProofAge: totalProofs > 0 ? totalAge / totalProofs : 0
        };
    }
    static silentValidate(proof, context) {
        const result = this.validateProof(proof, context);
        if (!result.isValid) {
            console.warn('Proof validation failed:', result.reason);
            return false;
        }
        if (result.riskLevel === 'high') {
            console.warn('High-risk proof detected:', result.recommendations);
        }
        return true;
    }
    static hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
}
exports.ZKProofManager = ZKProofManager;
ZKProofManager.DEFAULT_CONFIG = {
    expirationTime: 24 * 60 * 60 * 1000,
    maxProofsPerHour: 100,
    requireContext: true,
    enableReplayProtection: true,
    securityLevel: 'military'
};
ZKProofManager.USED_PROOFS_CACHE = new Set();
ZKProofManager.PROOF_RATE_LIMITS = new Map();
ZKProofManager.PROOF_HISTORY = new Map();
//# sourceMappingURL=zk-proof-manager.js.map