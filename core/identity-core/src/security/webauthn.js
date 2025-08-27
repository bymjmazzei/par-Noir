"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebAuthnManager = void 0;
const types_1 = require("../types");
class WebAuthnManager {
    constructor(config = {}) {
        this.credentials = new Map();
        this.config = {
            rpName: 'Identity Protocol',
            rpID: window.location.hostname,
            userID: crypto.randomUUID(),
            userName: 'user@identityprotocol.com',
            userDisplayName: 'Identity Protocol User',
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                requireResidentKey: true
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -257 },
                { type: 'public-key', alg: -37 },
                { type: 'public-key', alg: -8 },
            ],
            excludeCredentials: [],
            ...config
        };
    }
    static isSupported() {
        return window.PublicKeyCredential !== undefined;
    }
    static async isPlatformAuthenticatorAvailable() {
        if (!WebAuthnManager.isSupported()) {
            return false;
        }
        try {
            return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        }
        catch (error) {
            return false;
        }
    }
    static isConditionalMediationSupported() {
        if (!WebAuthnManager.isSupported()) {
            return false;
        }
        return PublicKeyCredential.isConditionalMediationAvailable !== undefined;
    }
    async registerCredential() {
        try {
            if (!WebAuthnManager.isSupported()) {
                throw new types_1.IdentityError('WebAuthn is not supported in this browser', types_1.IdentityErrorCodes.SECURITY_ERROR);
            }
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const publicKeyOptions = {
                challenge,
                rp: {
                    name: this.config.rpName,
                    id: this.config.rpID
                },
                user: {
                    id: this.stringToArrayBuffer(this.config.userID),
                    name: this.config.userName,
                    displayName: this.config.userDisplayName
                },
                pubKeyCredParams: this.config.pubKeyCredParams,
                timeout: this.config.timeout,
                attestation: this.config.attestation,
                authenticatorSelection: this.config.authenticatorSelection,
                excludeCredentials: this.config.excludeCredentials
            };
            const credential = await navigator.credentials.create({
                publicKey: publicKeyOptions
            });
            if (!credential) {
                throw new types_1.IdentityError('Failed to create WebAuthn credential', types_1.IdentityErrorCodes.SECURITY_ERROR);
            }
            const response = credential.response;
            const webAuthnCredential = {
                id: credential.id,
                type: credential.type,
                transports: (response.getTransports?.() || []),
                attestationObject: response.attestationObject,
                clientDataJSON: response.clientDataJSON,
                publicKey: this.extractPublicKey(response.attestationObject),
                signCount: 0,
                backupEligible: response.attestationObject ? true : false,
                backupState: false,
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString()
            };
            this.credentials.set(credential.id, webAuthnCredential);
            return {
                success: true,
                credentialId: credential.id,
                publicKey: webAuthnCredential.publicKey,
                attestationObject: response.attestationObject,
                clientDataJSON: response.clientDataJSON,
                transports: webAuthnCredential.transports
            };
        }
        catch (error) {
            throw new types_1.IdentityError('WebAuthn registration failed', types_1.IdentityErrorCodes.SECURITY_ERROR, error);
        }
    }
    async authenticateCredential(credentialId) {
        try {
            if (!WebAuthnManager.isSupported()) {
                throw new types_1.IdentityError('WebAuthn is not supported in this browser', types_1.IdentityErrorCodes.SECURITY_ERROR);
            }
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const allowCredentials = [];
            if (credentialId) {
                const credential = this.credentials.get(credentialId);
                if (credential) {
                    allowCredentials.push({
                        type: 'public-key',
                        id: this.base64ToArrayBuffer(credentialId),
                        transports: credential.transports
                    });
                }
            }
            else {
                for (const [id, credential] of this.credentials) {
                    allowCredentials.push({
                        type: 'public-key',
                        id: this.base64ToArrayBuffer(id),
                        transports: credential.transports
                    });
                }
            }
            const publicKeyOptions = {
                challenge,
                rpId: this.config.rpID,
                allowCredentials,
                timeout: this.config.timeout,
                userVerification: this.config.authenticatorSelection.userVerification
            };
            const assertion = await navigator.credentials.get({
                publicKey: publicKeyOptions
            });
            if (!assertion) {
                throw new types_1.IdentityError('WebAuthn authentication failed', types_1.IdentityErrorCodes.SECURITY_ERROR);
            }
            const response = assertion.response;
            const credential = this.credentials.get(assertion.id);
            if (credential) {
                credential.lastUsed = new Date().toISOString();
                credential.signCount = response.signCount || 0;
            }
            return {
                success: true,
                credentialId: assertion.id,
                signature: response.signature,
                authenticatorData: response.authenticatorData,
                clientDataJSON: response.clientDataJSON,
                userHandle: response.userHandle || new ArrayBuffer(0),
                signCount: response.signCount || 0
            };
        }
        catch (error) {
            throw new types_1.IdentityError('WebAuthn authentication failed', types_1.IdentityErrorCodes.SECURITY_ERROR, error);
        }
    }
    async authenticateWithConditionalMediation() {
        try {
            if (!WebAuthnManager.isConditionalMediationSupported()) {
                return null;
            }
            const challenge = crypto.getRandomValues(new Uint8Array(32));
            const allowCredentials = [];
            for (const [id, credential] of this.credentials) {
                allowCredentials.push({
                    type: 'public-key',
                    id: this.base64ToArrayBuffer(id),
                    transports: credential.transports
                });
            }
            const publicKeyOptions = {
                challenge,
                rpId: this.config.rpID,
                allowCredentials,
                timeout: this.config.timeout,
                userVerification: this.config.authenticatorSelection.userVerification
            };
            const assertion = await navigator.credentials.get({
                publicKey: publicKeyOptions,
                mediation: 'conditional'
            });
            if (!assertion) {
                return null;
            }
            const response = assertion.response;
            const credential = this.credentials.get(assertion.id);
            if (credential) {
                credential.lastUsed = new Date().toISOString();
                credential.signCount = response.signCount || 0;
            }
            return {
                success: true,
                credentialId: assertion.id,
                signature: response.signature,
                authenticatorData: response.authenticatorData,
                clientDataJSON: response.clientDataJSON,
                userHandle: response.userHandle || new ArrayBuffer(0),
                signCount: response.signCount || 0
            };
        }
        catch (error) {
            return null;
        }
    }
    async removeCredential(credentialId) {
        try {
            const credential = this.credentials.get(credentialId);
            if (!credential) {
                return false;
            }
            this.credentials.delete(credentialId);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    getCredentials() {
        return Array.from(this.credentials.values());
    }
    getCredential(credentialId) {
        return this.credentials.get(credentialId);
    }
    hasCredentials() {
        return this.credentials.size > 0;
    }
    stringToArrayBuffer(str) {
        const encoder = new TextEncoder();
        return encoder.encode(str).buffer;
    }
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    extractPublicKey(attestationObject) {
        return new ArrayBuffer(32);
    }
    async verifySignature(signature, authenticatorData, clientDataJSON, publicKey, challenge) {
        try {
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
exports.WebAuthnManager = WebAuthnManager;
//# sourceMappingURL=webauthn.js.map