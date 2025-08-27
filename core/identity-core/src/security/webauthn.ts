/**
 * WebAuthn Integration - Hardware Security Key Support
 * Implements FIDO2/WebAuthn for hardware-based authentication
 */

import { IdentityError, IdentityErrorCodes } from '../types';

export interface WebAuthnCredential {
  id: string;
  type: 'public-key';
  transports: AuthenticatorTransport[];
  attestationObject: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  publicKey: ArrayBuffer;
  signCount: number;
  backupEligible: boolean;
  backupState: boolean;
  createdAt: string;
  lastUsed: string;
}

export interface WebAuthnAuthenticationResult {
  success: boolean;
  credentialId: string;
  signature: ArrayBuffer;
  authenticatorData: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  userHandle: ArrayBuffer;
  signCount: number;
}

export interface WebAuthnRegistrationResult {
  success: boolean;
  credentialId: string;
  publicKey: ArrayBuffer;
  attestationObject: ArrayBuffer;
  clientDataJSON: ArrayBuffer;
  transports: string[];
}

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  userID: string;
  userName: string;
  userDisplayName: string;
  challenge: Uint8Array;
  timeout: number;
  attestation: 'direct' | 'indirect' | 'none';
  authenticatorSelection: {
    authenticatorAttachment: 'platform' | 'cross-platform';
    userVerification: 'required' | 'preferred' | 'discouraged';
    requireResidentKey: boolean;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  excludeCredentials: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports: AuthenticatorTransport[];
  }>;
}

export class WebAuthnManager {
  private config: WebAuthnConfig;
  private credentials: Map<string, WebAuthnCredential> = new Map();

  constructor(config: Partial<WebAuthnConfig> = {}) {
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
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
        { type: 'public-key', alg: -37 }, // PS256
        { type: 'public-key', alg: -8 }, // EdDSA
      ],
      excludeCredentials: [],
      ...config
    };
  }

  /**
   * Check if WebAuthn is supported
   */
  static isSupported(): boolean {
    return window.PublicKeyCredential !== undefined;
  }

  /**
   * Check if platform authenticator is available
   */
  static async isPlatformAuthenticatorAvailable(): Promise<boolean> {
    if (!WebAuthnManager.isSupported()) {
      return false;
    }

    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if conditional mediation is supported
   */
  static isConditionalMediationSupported(): boolean {
    if (!WebAuthnManager.isSupported()) {
      return false;
    }

    return PublicKeyCredential.isConditionalMediationAvailable !== undefined;
  }

  /**
   * Register a new WebAuthn credential
   */
  async registerCredential(): Promise<WebAuthnRegistrationResult> {
    try {
      if (!WebAuthnManager.isSupported()) {
        throw new IdentityError(
          'WebAuthn is not supported in this browser',
          IdentityErrorCodes.SECURITY_ERROR
        );
      }

      // Generate challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      // Create registration options
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
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
        excludeCredentials: this.config.excludeCredentials as PublicKeyCredentialDescriptor[]
      };

      // Create credential
      const credential = await navigator.credentials.create({
        publicKey: publicKeyOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new IdentityError(
          'Failed to create WebAuthn credential',
          IdentityErrorCodes.SECURITY_ERROR
        );
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Store credential
      const webAuthnCredential: WebAuthnCredential = {
        id: credential.id,
        type: credential.type as 'public-key',
        transports: (response.getTransports?.() || []) as AuthenticatorTransport[],
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

    } catch (error) {
      throw new IdentityError(
        'WebAuthn registration failed',
        IdentityErrorCodes.SECURITY_ERROR,
        error
      );
    }
  }

  /**
   * Authenticate with WebAuthn credential
   */
  async authenticateCredential(credentialId?: string): Promise<WebAuthnAuthenticationResult> {
    try {
      if (!WebAuthnManager.isSupported()) {
        throw new IdentityError(
          'WebAuthn is not supported in this browser',
          IdentityErrorCodes.SECURITY_ERROR
        );
      }

      // Generate challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      // Get allowed credentials
      const allowCredentials: PublicKeyCredentialDescriptor[] = [];
      
      if (credentialId) {
        // Specific credential
        const credential = this.credentials.get(credentialId);
        if (credential) {
          allowCredentials.push({
            type: 'public-key',
            id: this.base64ToArrayBuffer(credentialId),
            transports: credential.transports
          });
        }
      } else {
        // All registered credentials
        for (const [id, credential] of this.credentials) {
          allowCredentials.push({
            type: 'public-key',
            id: this.base64ToArrayBuffer(id),
            transports: credential.transports
          });
        }
      }

      // Create authentication options
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        rpId: this.config.rpID,
        allowCredentials,
        timeout: this.config.timeout,
        userVerification: this.config.authenticatorSelection.userVerification
      };

      // Get credential
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyOptions
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new IdentityError(
          'WebAuthn authentication failed',
          IdentityErrorCodes.SECURITY_ERROR
        );
      }

      const response = assertion.response as AuthenticatorAssertionResponse;

      // Update credential usage
      const credential = this.credentials.get(assertion.id);
      if (credential) {
        credential.lastUsed = new Date().toISOString();
        credential.signCount = (response as any).signCount || 0;
      }

      return {
        success: true,
        credentialId: assertion.id,
        signature: response.signature,
        authenticatorData: response.authenticatorData,
        clientDataJSON: response.clientDataJSON,
        userHandle: response.userHandle || new ArrayBuffer(0),
        signCount: (response as any).signCount || 0
      };

    } catch (error) {
      throw new IdentityError(
        'WebAuthn authentication failed',
        IdentityErrorCodes.SECURITY_ERROR,
        error
      );
    }
  }

  /**
   * Authenticate with conditional mediation (auto-fill)
   */
  async authenticateWithConditionalMediation(): Promise<WebAuthnAuthenticationResult | null> {
    try {
      if (!WebAuthnManager.isConditionalMediationSupported()) {
        return null;
      }

      // Generate challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      // Get all registered credentials
      const allowCredentials: PublicKeyCredentialDescriptor[] = [];
      for (const [id, credential] of this.credentials) {
        allowCredentials.push({
          type: 'public-key',
          id: this.base64ToArrayBuffer(id),
          transports: credential.transports
        });
      }

      // Create authentication options with conditional mediation
      const publicKeyOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        rpId: this.config.rpID,
        allowCredentials,
        timeout: this.config.timeout,
        userVerification: this.config.authenticatorSelection.userVerification
      };

      // Get credential with conditional mediation
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyOptions,
        mediation: 'conditional'
      }) as PublicKeyCredential | null;

      if (!assertion) {
        return null;
      }

      const response = assertion.response as AuthenticatorAssertionResponse;

      // Update credential usage
      const credential = this.credentials.get(assertion.id);
      if (credential) {
        credential.lastUsed = new Date().toISOString();
        credential.signCount = (response as any).signCount || 0;
      }

      return {
        success: true,
        credentialId: assertion.id,
        signature: response.signature,
        authenticatorData: response.authenticatorData,
        clientDataJSON: response.clientDataJSON,
        userHandle: response.userHandle || new ArrayBuffer(0),
        signCount: (response as any).signCount || 0
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Remove a WebAuthn credential
   */
  async removeCredential(credentialId: string): Promise<boolean> {
    try {
      const credential = this.credentials.get(credentialId);
      if (!credential) {
        return false;
      }

      // Remove from storage
      this.credentials.delete(credentialId);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all registered credentials
   */
  getCredentials(): WebAuthnCredential[] {
    return Array.from(this.credentials.values());
  }

  /**
   * Get a specific credential
   */
  getCredential(credentialId: string): WebAuthnCredential | undefined {
    return this.credentials.get(credentialId);
  }

  /**
   * Check if user has registered credentials
   */
  hasCredentials(): boolean {
    return this.credentials.size > 0;
  }

  /**
   * Convert string to ArrayBuffer
   */
  private stringToArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Extract public key from attestation object
   */
  private extractPublicKey(attestationObject: ArrayBuffer): ArrayBuffer {
    // This is a simplified extraction - in production, you'd properly parse the CBOR
    // For now, we'll return a placeholder
    return new ArrayBuffer(32);
  }

  /**
   * Verify WebAuthn signature
   */
  async verifySignature(
    signature: ArrayBuffer,
    authenticatorData: ArrayBuffer,
    clientDataJSON: ArrayBuffer,
    publicKey: ArrayBuffer,
    challenge: ArrayBuffer
  ): Promise<boolean> {
    try {
      // This is a simplified verification - in production, you'd implement proper verification
      // 1. Verify client data hash matches challenge
      // 2. Verify authenticator data
      // 3. Verify signature using public key
      
      return true; // Placeholder
    } catch (error) {
      return false;
    }
  }
}
