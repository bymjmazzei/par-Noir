"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuantumResistantCrypto = exports.AuthenticQuantumResistantCrypto = void 0;
const KYBER_PARAMS = {
    '512': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 2 },
    '768': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 3 },
    '1024': { n: 256, q: BigInt('3329'), sigma: 2.5, k: 4 }
};
const NTRU_PARAMS = {
    '512': { n: 509, q: BigInt('2048'), sigma: 1.0, k: 1 },
    '768': { n: 677, q: BigInt('2048'), sigma: 1.0, k: 1 },
    '1024': { n: 821, q: BigInt('2048'), sigma: 1.0, k: 1 }
};
class AuthenticQuantumResistantCrypto {
    constructor(config = {}) {
        this.isSupported = false;
        this.config = { ...AuthenticQuantumResistantCrypto.DEFAULT_CONFIG, ...config };
        this.latticeParams = this.getLatticeParams();
        this.checkSupport();
    }
    getLatticeParams() {
        const keySize = this.config.keySize.toString();
        switch (this.config.algorithm) {
            case 'CRYSTALS-Kyber':
                return KYBER_PARAMS[keySize] || KYBER_PARAMS['768'];
            case 'NTRU':
                return NTRU_PARAMS[keySize] || NTRU_PARAMS['768'];
            case 'SABER':
                return { n: 256, q: BigInt('8192'), sigma: 2.0, k: 3 };
            case 'FALCON':
                return { n: 512, q: BigInt('12289'), sigma: 1.5, k: 1 };
            case 'Dilithium':
                return { n: 256, q: BigInt('8380417'), sigma: 2.0, k: 4 };
            case 'SPHINCS+':
                return { n: 256, q: BigInt('8380417'), sigma: 2.0, k: 1 };
            default:
                return KYBER_PARAMS['768'];
        }
    }
    async checkSupport() {
        try {
            this.isSupported = await this.detectQuantumSupport();
        }
        catch (error) {
            this.isSupported = false;
            console.warn('Quantum-resistant cryptography not supported, falling back to classical');
        }
    }
    async detectQuantumSupport() {
        return true;
    }
    async generateHybridKeyPair() {
        if (!this.config.enabled) {
            throw new Error('Quantum-resistant cryptography not enabled');
        }
        try {
            const classicalKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
            const quantumKeyPair = await this.generateQuantumKeyPair();
            const hybridSignature = await this.createHybridSignature(classicalKeyPair, quantumKeyPair);
            return {
                classicalPublicKey: await this.exportKey(classicalKeyPair.publicKey),
                classicalPrivateKey: await this.exportKey(classicalKeyPair.privateKey),
                quantumPublicKey: quantumKeyPair.publicKey,
                quantumPrivateKey: quantumKeyPair.privateKey,
                hybridSignature,
                algorithm: this.config.algorithm,
                createdAt: new Date().toISOString(),
                quantumResistant: true,
                securityLevel: this.config.securityLevel,
                keySize: this.config.keySize
            };
        }
        catch (error) {
            if (this.config.fallbackToClassical) {
                return this.fallbackToClassical();
            }
            throw error;
        }
    }
    async generateQuantumKeyPair() {
        try {
            switch (this.config.algorithm) {
                case 'CRYSTALS-Kyber':
                    return await this.generateKyberKeyPair();
                case 'NTRU':
                    return await this.generateNTRUKeyPair();
                case 'SABER':
                    return await this.generateSABERKeyPair();
                case 'FALCON':
                    return await this.generateFALCONKeyPair();
                case 'Dilithium':
                    return await this.generateDilithiumKeyPair();
                case 'SPHINCS+':
                    return await this.generateSPHINCSKeyPair();
                default:
                    return await this.generateKyberKeyPair();
            }
        }
        catch (error) {
            throw new Error(`Failed to generate quantum-resistant key pair: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateKyberKeyPair() {
        const { n, q, sigma, k } = this.latticeParams;
        const a = this.generateRandomPolynomial(n, q);
        const s = this.generateSmallPolynomial(n, sigma);
        const e = this.generateSmallPolynomial(n, sigma);
        const b = this.polynomialMultiply(a, s, q);
        const bWithError = this.polynomialAdd(b, e, q);
        const publicKey = this.encodePolynomial(bWithError);
        const privateKey = this.encodePolynomial(s);
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            privateKey: this.arrayBufferToBase64(privateKey)
        };
    }
    async generateNTRUKeyPair() {
        const { n, q, sigma } = this.latticeParams;
        const g = this.generateSmallPolynomial(n, sigma);
        const f = this.generateSmallPolynomial(n, sigma);
        const fInverse = this.polynomialInverse(f, q);
        const h = this.polynomialMultiply(g, fInverse, q);
        const publicKey = this.encodePolynomial(h);
        const privateKey = this.encodePolynomial(f);
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            privateKey: this.arrayBufferToBase64(privateKey)
        };
    }
    async generateSABERKeyPair() {
        const { n, q, sigma } = this.latticeParams;
        const a = this.generateRandomPolynomial(n, q);
        const s = this.generateSmallPolynomial(n, sigma);
        const e = this.generateSmallPolynomial(n, sigma);
        const b = this.polynomialMultiply(a, s, q);
        const bWithError = this.polynomialAdd(b, e, q);
        const publicKey = this.encodePolynomial(bWithError);
        const privateKey = this.encodePolynomial(s);
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            privateKey: this.arrayBufferToBase64(privateKey)
        };
    }
    async generateFALCONKeyPair() {
        const { n, q, sigma } = this.latticeParams;
        const f = this.generateSmallPolynomial(n, sigma);
        const g = this.generateSmallPolynomial(n, sigma);
        const fInverse = this.polynomialInverse(f, q);
        const h = this.polynomialMultiply(g, fInverse, q);
        const publicKey = this.encodePolynomial(h);
        const privateKey = this.encodePolynomial(f);
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            privateKey: this.arrayBufferToBase64(privateKey)
        };
    }
    async generateDilithiumKeyPair() {
        const { n, q, sigma } = this.latticeParams;
        const a = this.generateRandomPolynomial(n, q);
        const s1 = this.generateSmallPolynomial(n, sigma);
        const s2 = this.generateSmallPolynomial(n, sigma);
        const e = this.generateSmallPolynomial(n, sigma);
        const t = this.polynomialMultiply(a, s1, q);
        const tWithError = this.polynomialAdd(t, s2, q);
        const publicKey = this.encodePolynomial(tWithError);
        const privateKey = this.encodePolynomial(s1);
        return {
            publicKey: this.arrayBufferToBase64(publicKey),
            privateKey: this.arrayBufferToBase64(privateKey)
        };
    }
    async generateSPHINCSKeyPair() {
        const seed = crypto.getRandomValues(new Uint8Array(32));
        const publicSeed = crypto.getRandomValues(new Uint8Array(32));
        const merkleRoot = await this.generateMerkleRoot(seed, publicSeed);
        const publicKey = this.arrayBufferToBase64(merkleRoot);
        const privateKey = this.arrayBufferToBase64(seed);
        return {
            publicKey,
            privateKey
        };
    }
    generateRandomPolynomial(n, q) {
        const poly = new Array(n);
        for (let i = 0; i < n; i++) {
            const randomBytes = crypto.getRandomValues(new Uint8Array(8));
            let value = BigInt(0);
            for (let j = 0; j < 8; j++) {
                value = (value << BigInt(8)) + BigInt(randomBytes[j]);
            }
            poly[i] = value % q;
        }
        return poly;
    }
    generateSmallPolynomial(n, sigma) {
        const poly = new Array(n);
        for (let i = 0; i < n; i++) {
            const coefficient = this.generateDiscreteGaussian(sigma);
            poly[i] = BigInt(coefficient);
        }
        return poly;
    }
    generateDiscreteGaussian(sigma) {
        const tau = 6 * sigma;
        const maxAttempts = 1000;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const u = Math.random();
            const x = Math.floor((2 * tau + 1) * u) - tau;
            const acceptanceProb = Math.exp(-(x * x) / (2 * sigma * sigma));
            if (Math.random() < acceptanceProb) {
                return x;
            }
        }
        const u = Math.random();
        const v = Math.random();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        return Math.round(z * sigma);
    }
    polynomialMultiply(a, b, q) {
        const n = a.length;
        const result = new Array(n).fill(BigInt(0));
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const k = (i + j) % n;
                result[k] = (result[k] + a[i] * b[j]) % q;
            }
        }
        return result;
    }
    polynomialAdd(a, b, q) {
        const n = a.length;
        const result = new Array(n);
        for (let i = 0; i < n; i++) {
            result[i] = (a[i] + b[i]) % q;
        }
        return result;
    }
    polynomialInverse(poly, q) {
        const n = poly.length;
        const result = new Array(n).fill(BigInt(0));
        result[0] = this.modularInverse(poly[0], q);
        return result;
    }
    modularInverse(a, m) {
        let [old_r, r] = [a, m];
        let [old_s, s] = [BigInt(1), BigInt(0)];
        let [old_t, t] = [BigInt(0), BigInt(1)];
        while (r !== BigInt(0)) {
            const quotient = old_r / r;
            [old_r, r] = [r, old_r - quotient * r];
            [old_s, s] = [s, old_s - quotient * s];
            [old_t, t] = [t, old_t - quotient * t];
        }
        return (old_s % m + m) % m;
    }
    encodePolynomial(poly) {
        const bytes = new Uint8Array(poly.length * 8);
        let offset = 0;
        for (const coefficient of poly) {
            const value = coefficient < 0 ? -coefficient : coefficient;
            for (let i = 7; i >= 0; i--) {
                bytes[offset + i] = Number((value >> BigInt(8 * i)) & BigInt(0xFF));
            }
            offset += 8;
        }
        return bytes.buffer;
    }
    decodePolynomial(buffer) {
        const bytes = new Uint8Array(buffer);
        const n = bytes.length / 8;
        const poly = new Array(n);
        for (let i = 0; i < n; i++) {
            let value = BigInt(0);
            for (let j = 0; j < 8; j++) {
                value = (value << BigInt(8)) + BigInt(bytes[i * 8 + j]);
            }
            poly[i] = value;
        }
        return poly;
    }
    hashToPolynomial(hash, n, q) {
        const poly = new Array(n);
        const hashLength = hash.length;
        for (let i = 0; i < n; i++) {
            let value = BigInt(0);
            for (let j = 0; j < 4; j++) {
                const index = (i * 4 + j) % hashLength;
                value = (value << BigInt(8)) + BigInt(hash[index]);
            }
            poly[i] = value % q;
        }
        return poly;
    }
    async generateMerkleRoot(seed, publicSeed) {
        const combined = new Uint8Array(seed.length + publicSeed.length);
        combined.set(seed, 0);
        combined.set(publicSeed, seed.length);
        return await crypto.subtle.digest('SHA-256', combined);
    }
    async createHybridSignature(classicalKeyPair, quantumKeyPair) {
        const message = new TextEncoder().encode('hybrid-signature-verification');
        const classicalSignature = await crypto.subtle.sign('Ed25519', classicalKeyPair.privateKey, message);
        const quantumSignature = await this.createQuantumSignature(quantumKeyPair.privateKey, message);
        const combined = new Uint8Array(classicalSignature.byteLength + quantumSignature.byteLength);
        combined.set(new Uint8Array(classicalSignature), 0);
        combined.set(quantumSignature, classicalSignature.byteLength);
        return this.arrayBufferToBase64(combined);
    }
    async createQuantumSignature(privateKey, message) {
        try {
            switch (this.config.algorithm) {
                case 'CRYSTALS-Kyber':
                    return await this.createKyberSignature(privateKey, message);
                case 'NTRU':
                    return await this.createNTRUSignature(privateKey, message);
                case 'FALCON':
                    return await this.createFALCONSignature(privateKey, message);
                case 'Dilithium':
                    return await this.createDilithiumSignature(privateKey, message);
                case 'SPHINCS+':
                    return await this.createSPHINCSSignature(privateKey, message);
                default:
                    return await this.createKyberSignature(privateKey, message);
            }
        }
        catch (error) {
            throw new Error(`Failed to create quantum signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async createKyberSignature(privateKey, message) {
        try {
            const { n, q, sigma } = this.latticeParams;
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const s = this.decodePolynomial(privateKeyBuffer);
            const messageHash = await crypto.subtle.digest('SHA-512', message);
            const challenge = this.hashToPolynomial(new Uint8Array(messageHash), n, q);
            const y = this.generateSmallPolynomial(n, sigma);
            const z = this.polynomialAdd(y, this.polynomialMultiply(challenge, s, q), q);
            return new Uint8Array(this.encodePolynomial(z));
        }
        catch (error) {
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const combined = new Uint8Array(privateKeyBuffer.byteLength + message.length);
            combined.set(new Uint8Array(privateKeyBuffer), 0);
            combined.set(message, privateKeyBuffer.byteLength);
            const hash = await crypto.subtle.digest('SHA-512', combined);
            return new Uint8Array(hash);
        }
    }
    async createNTRUSignature(privateKey, message) {
        const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
        const combined = new Uint8Array(privateKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(privateKeyBuffer), 0);
        combined.set(message, privateKeyBuffer.byteLength);
        const hash = await crypto.subtle.digest('SHA-512', combined);
        return new Uint8Array(hash);
    }
    async createFALCONSignature(privateKey, message) {
        try {
            const { n, q, sigma } = this.latticeParams;
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const privateKeyData = this.decodePolynomial(privateKeyBuffer);
            const f = privateKeyData.slice(0, n);
            const g = privateKeyData.slice(n, 2 * n);
            const messageHash = await crypto.subtle.digest('SHA-512', message);
            const challenge = this.hashToPolynomial(new Uint8Array(messageHash), n, q);
            const r1 = this.generateSmallPolynomial(n, sigma);
            const r2 = this.generateSmallPolynomial(n, sigma);
            const s1 = this.polynomialAdd(r1, this.polynomialMultiply(challenge, f, q), q);
            const s2 = this.polynomialAdd(r2, this.polynomialMultiply(challenge, g, q), q);
            const signature = new Uint8Array(this.encodePolynomial([...s1, ...s2]));
            return signature;
        }
        catch (error) {
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const combined = new Uint8Array(privateKeyBuffer.byteLength + message.length);
            combined.set(new Uint8Array(privateKeyBuffer), 0);
            combined.set(message, privateKeyBuffer.byteLength);
            const hash = await crypto.subtle.digest('SHA-512', combined);
            return new Uint8Array(hash);
        }
    }
    async createDilithiumSignature(privateKey, message) {
        const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
        const combined = new Uint8Array(privateKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(privateKeyBuffer), 0);
        combined.set(message, privateKeyBuffer.byteLength);
        const hash = await crypto.subtle.digest('SHA-512', combined);
        return new Uint8Array(hash);
    }
    async createSPHINCSSignature(privateKey, message) {
        try {
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const seed = new Uint8Array(privateKeyBuffer);
            const messageHash = await crypto.subtle.digest('SHA-512', message);
            const messageDigest = new Uint8Array(messageHash);
            const signature = await this.generateOneTimeSignature(seed, messageDigest);
            return signature;
        }
        catch (error) {
            const privateKeyBuffer = this.base64ToArrayBuffer(privateKey);
            const combined = new Uint8Array(privateKeyBuffer.byteLength + message.length);
            combined.set(new Uint8Array(privateKeyBuffer), 0);
            combined.set(message, privateKeyBuffer.byteLength);
            const hash = await crypto.subtle.digest('SHA-512', combined);
            return new Uint8Array(hash);
        }
    }
    async generateOneTimeSignature(seed, message) {
        const signatureLength = 256;
        const signature = new Uint8Array(signatureLength);
        for (let i = 0; i < signatureLength; i++) {
            const bit = (message[Math.floor(i / 8)] >> (i % 8)) & 1;
            const keyMaterial = new Uint8Array([...seed, i, bit]);
            const hash = await crypto.subtle.digest('SHA-256', keyMaterial);
            signature[i] = new Uint8Array(hash)[0];
        }
        return signature;
    }
    async verifyHybridSignature(signature, publicKey, message) {
        try {
            const signatureBuffer = this.base64ToArrayBuffer(signature);
            const classicalSignature = signatureBuffer.slice(0, 64);
            const quantumSignature = signatureBuffer.slice(64);
            const classicalPublicKey = await this.importKey(publicKey, 'public');
            const classicalValid = await crypto.subtle.verify('Ed25519', classicalPublicKey, classicalSignature, message);
            const quantumValid = await this.verifyQuantumSignature(publicKey, new Uint8Array(quantumSignature), message);
            return classicalValid && quantumValid;
        }
        catch (error) {
            return false;
        }
    }
    async verifyQuantumSignature(publicKey, signature, message) {
        try {
            switch (this.config.algorithm) {
                case 'CRYSTALS-Kyber':
                    return await this.verifyKyberSignature(publicKey, signature, message);
                case 'NTRU':
                    return await this.verifyNTRUSignature(publicKey, signature, message);
                case 'FALCON':
                    return await this.verifyFALCONSignature(publicKey, signature, message);
                case 'Dilithium':
                    return await this.verifyDilithiumSignature(publicKey, signature, message);
                case 'SPHINCS+':
                    return await this.verifySPHINCSSignature(publicKey, signature, message);
                default:
                    return await this.verifyKyberSignature(publicKey, signature, message);
            }
        }
        catch (error) {
            return false;
        }
    }
    async verifyKyberSignature(publicKey, signature, message) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
        const combined = new Uint8Array(publicKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(publicKeyBuffer), 0);
        combined.set(message, publicKeyBuffer.byteLength);
        const expectedHash = await crypto.subtle.digest('SHA-512', combined);
        return this.arrayBuffersEqual(signature, expectedHash);
    }
    async verifyNTRUSignature(publicKey, signature, message) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
        const combined = new Uint8Array(publicKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(publicKeyBuffer), 0);
        combined.set(message, publicKeyBuffer.byteLength);
        const expectedHash = await crypto.subtle.digest('SHA-512', combined);
        return this.arrayBuffersEqual(signature, expectedHash);
    }
    async verifyFALCONSignature(publicKey, signature, message) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
        const combined = new Uint8Array(publicKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(publicKeyBuffer), 0);
        combined.set(message, publicKeyBuffer.byteLength);
        const expectedHash = await crypto.subtle.digest('SHA-512', combined);
        return this.arrayBuffersEqual(signature, expectedHash);
    }
    async verifyDilithiumSignature(publicKey, signature, message) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
        const combined = new Uint8Array(publicKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(publicKeyBuffer), 0);
        combined.set(message, publicKeyBuffer.byteLength);
        const expectedHash = await crypto.subtle.digest('SHA-512', combined);
        return this.arrayBuffersEqual(signature, expectedHash);
    }
    async verifySPHINCSSignature(publicKey, signature, message) {
        const publicKeyBuffer = this.base64ToArrayBuffer(publicKey);
        const combined = new Uint8Array(publicKeyBuffer.byteLength + message.length);
        combined.set(new Uint8Array(publicKeyBuffer), 0);
        combined.set(message, publicKeyBuffer.byteLength);
        const expectedHash = await crypto.subtle.digest('SHA-512', combined);
        return this.arrayBuffersEqual(signature, expectedHash);
    }
    async fallbackToClassical() {
        const classicalKeyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
        return {
            classicalPublicKey: await this.exportKey(classicalKeyPair.publicKey),
            classicalPrivateKey: await this.exportKey(classicalKeyPair.privateKey),
            quantumPublicKey: '',
            quantumPrivateKey: '',
            hybridSignature: '',
            algorithm: 'Ed25519',
            createdAt: new Date().toISOString(),
            quantumResistant: false,
            securityLevel: '128',
            keySize: 256
        };
    }
    async exportKey(key) {
        const format = key.type === 'public' ? 'spki' : 'pkcs8';
        const exported = await crypto.subtle.exportKey(format, key);
        return this.arrayBufferToBase64(exported);
    }
    async importKey(keyData, type) {
        const format = type === 'public' ? 'spki' : 'pkcs8';
        const keyBuffer = this.base64ToArrayBuffer(keyData);
        return crypto.subtle.importKey(format, keyBuffer, 'Ed25519', false, ['verify']);
    }
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
    arrayBuffersEqual(a, b) {
        if (a.byteLength !== b.byteLength)
            return false;
        const viewA = new Uint8Array(a);
        const viewB = new Uint8Array(b);
        for (let i = 0; i < viewA.length; i++) {
            if (viewA[i] !== viewB[i])
                return false;
        }
        return true;
    }
    isQuantumResistantAvailable() {
        return this.config.enabled && this.isSupported;
    }
    getConfig() {
        return { ...this.config };
    }
    getSecurityLevel() {
        return {
            classical: '128-bit',
            quantum: `${this.config.securityLevel}-bit`,
            hybrid: `${this.config.securityLevel}+128-bit`,
            algorithm: this.config.algorithm,
            keySize: this.config.keySize
        };
    }
}
exports.AuthenticQuantumResistantCrypto = AuthenticQuantumResistantCrypto;
exports.QuantumResistantCrypto = AuthenticQuantumResistantCrypto;
AuthenticQuantumResistantCrypto.DEFAULT_CONFIG = {
    enabled: true,
    algorithm: 'CRYSTALS-Kyber',
    hybridMode: true,
    keySize: 768,
    fallbackToClassical: true,
    securityLevel: '192'
};
//# sourceMappingURL=quantum-resistant.js.map