// Biometric authentication utilities using WebAuthn API

export interface BiometricCredential {
  id: string;
  identityId: string;
  credentialId: string;
  publicKey: string;
  createdAt: string;
  lastUsed: string;
  deviceName: string;
  authenticatorType: 'platform' | 'roaming';
}

export interface BiometricAuthResult {
  success: boolean;
  credentialId?: string;
  error?: string;
  fallbackToPasscode?: boolean;
}

export class BiometricAuth {
  private static readonly CREDENTIAL_STORAGE_KEY = 'biometric-credentials';
  
  /**
   * Check if biometric authentication is available on this device
   */
  static async isAvailable(): Promise<boolean> {
    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        return false;
      }

      // Check if platform authenticator (built-in biometrics) is available
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return available;
    } catch (error) {
      // Silently handle biometric availability check in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return false;
    }
  }

  /**
   * Get supported biometric types on this device
   */
  static async getSupportedTypes(): Promise<string[]> {
    const types: string[] = [];
    
    try {
      const available = await this.isAvailable();
      if (!available) return types;

      // Platform authenticator typically supports fingerprint, face, or PIN
      types.push('platform');

      // Check for additional authenticator info if available
      if ('getClientCapabilities' in navigator.credentials) {
        // Future API - not widely supported yet
        types.push('enhanced');
      }
    } catch (error) {
      // Silently handle biometric types retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }

    return types;
  }

  /**
   * Register a new biometric credential for an identity
   */
  static async registerCredential(identityId: string, username: string): Promise<BiometricCredential | null> {
    try {
      if (!(await this.isAvailable())) {
        throw new Error('Biometric authentication not available on this device');
      }

      // Generate credential creation options
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credentialCreationOptions: CredentialCreationOptions = {
        publicKey: {
          challenge,
          rp: {
            name: 'Identity Protocol',
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(identityId),
            name: username,
            displayName: username,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            requireResidentKey: true,
          },
          timeout: 60000,
          attestation: 'direct',
        },
      };

      // Create the credential
      const credential = await navigator.credentials.create(credentialCreationOptions) as PublicKeyCredential;
      
      if (!credential) {
        throw new Error('Failed to create biometric credential');
      }

      // Extract credential data
      const response = credential.response as AuthenticatorAttestationResponse;
      const credentialId = Array.from(new Uint8Array(credential.rawId))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

      // Create biometric credential record
      const biometricCredential: BiometricCredential = {
        id: `biometric_${Date.now()}`,
        identityId,
        credentialId,
        publicKey: Array.from(new Uint8Array(response.getPublicKey() || new ArrayBuffer(0)))
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join(''),
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        deviceName: await this.getDeviceName(),
        authenticatorType: 'platform',
      };

      // Store credential locally
      await this.storeCredential(biometricCredential);

      return biometricCredential;
    } catch (error: any) {
      // Silently handle biometric credential registration errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      
      // Handle specific WebAuthn errors
      if (error.name === 'NotSupportedError') {
        throw new Error('Biometric authentication not supported on this device');
      } else if (error.name === 'SecurityError') {
        throw new Error('Biometric registration blocked by security policy');
      } else if (error.name === 'NotAllowedError') {
        throw new Error('Biometric registration cancelled by user');
      } else if (error.name === 'InvalidStateError') {
        throw new Error('Biometric credential already exists for this account');
      }
      
      throw error;
    }
  }

  /**
   * Authenticate using biometric credential
   */
  static async authenticate(identityId: string): Promise<BiometricAuthResult> {
    try {
      if (!(await this.isAvailable())) {
        return {
          success: false,
          error: 'Biometric authentication not available',
          fallbackToPasscode: true,
        };
      }

      // Get stored credentials for this identity
      const credentials = await this.getCredentials(identityId);
      if (credentials.length === 0) {
        return {
          success: false,
          error: 'No biometric credentials found for this identity',
          fallbackToPasscode: true,
        };
      }

      // Generate authentication challenge
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Convert credential IDs to proper format
      const allowCredentials = credentials.map(cred => ({
        id: new Uint8Array(cred.credentialId.match(/.{2}/g)?.map(byte => parseInt(byte, 16)) || []),
        type: 'public-key' as const,
        transports: ['internal'] as AuthenticatorTransport[],
      }));

      const credentialRequestOptions: CredentialRequestOptions = {
        publicKey: {
          challenge,
          allowCredentials,
          userVerification: 'required',
          timeout: 60000,
        },
      };

      // Authenticate with biometric
      const assertion = await navigator.credentials.get(credentialRequestOptions) as PublicKeyCredential;
      
      if (!assertion) {
        return {
          success: false,
          error: 'Biometric authentication failed',
          fallbackToPasscode: true,
        };
      }

      // Find matching credential
      const assertionCredentialId = Array.from(new Uint8Array(assertion.rawId))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

      const matchingCredential = credentials.find(cred => cred.credentialId === assertionCredentialId);
      
      if (!matchingCredential) {
        return {
          success: false,
          error: 'Credential not recognized',
          fallbackToPasscode: true,
        };
      }

      // Update last used timestamp
      matchingCredential.lastUsed = new Date().toISOString();
      await this.updateCredential(matchingCredential);

      return {
        success: true,
        credentialId: matchingCredential.credentialId,
      };

    } catch (error: any) {
      // Silently handle biometric authentication errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      
      // Handle specific WebAuthn errors
      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          error: 'Biometric authentication cancelled',
          fallbackToPasscode: true,
        };
      } else if (error.name === 'SecurityError') {
        return {
          success: false,
          error: 'Biometric authentication blocked by security policy',
          fallbackToPasscode: true,
        };
      } else if (error.name === 'UnknownError') {
        return {
          success: false,
          error: 'Biometric sensor not available or failed',
          fallbackToPasscode: true,
        };
      }

      return {
        success: false,
        error: error.message || 'Biometric authentication failed',
        fallbackToPasscode: true,
      };
    }
  }

  /**
   * Get all biometric credentials for an identity
   */
  static async getCredentials(identityId: string): Promise<BiometricCredential[]> {
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      if (!stored) return [];

      const allCredentials: BiometricCredential[] = JSON.parse(stored);
      return allCredentials.filter(cred => cred.identityId === identityId);
    } catch (error) {
      // Silently handle biometric credentials retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return [];
    }
  }

  /**
   * Store a biometric credential
   */
  private static async storeCredential(credential: BiometricCredential): Promise<void> {
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      const credentials: BiometricCredential[] = stored ? JSON.parse(stored) : [];
      
      credentials.push(credential);
      localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
    } catch (error) {
      // Silently handle biometric credential storage errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      throw error;
    }
  }

  /**
   * Update a biometric credential
   */
  private static async updateCredential(credential: BiometricCredential): Promise<void> {
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      if (!stored) return;

      const credentials: BiometricCredential[] = JSON.parse(stored);
      const index = credentials.findIndex(cred => cred.id === credential.id);
      
      if (index !== -1) {
        credentials[index] = credential;
        localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(credentials));
      }
    } catch (error) {
      // Silently handle biometric credential update errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Remove biometric credentials for an identity
   */
  static async removeCredentials(identityId: string): Promise<void> {
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      if (!stored) return;

      const credentials: BiometricCredential[] = JSON.parse(stored);
      const filtered = credentials.filter(cred => cred.identityId !== identityId);
      
      localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      // Silently handle biometric credentials removal errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Remove a specific biometric credential
   */
  static async removeCredential(credentialId: string): Promise<void> {
    try {
      const stored = localStorage.getItem(this.CREDENTIAL_STORAGE_KEY);
      if (!stored) return;

      const credentials: BiometricCredential[] = JSON.parse(stored);
      const filtered = credentials.filter(cred => cred.id !== credentialId);
      
      localStorage.setItem(this.CREDENTIAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      // Silently handle biometric credential removal errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Get device name for credential identification
   */
  private static async getDeviceName(): Promise<string> {
    try {
      // Try to get device info from user agent
      const ua = navigator.userAgent;
      
      if (ua.includes('iPhone')) return 'iPhone';
      if (ua.includes('iPad')) return 'iPad';
      if (ua.includes('Android')) return 'Android Device';
      if (ua.includes('Mac')) return 'Mac';
      if (ua.includes('Windows')) return 'Windows PC';
      if (ua.includes('Linux')) return 'Linux Device';
      
      return 'Unknown Device';
    } catch (error) {
      // Silently handle device name retrieval errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      return 'Device';
    }
  }

  /**
   * Get biometric capability info for display
   */
  static async getCapabilityInfo(): Promise<{
    available: boolean;
    types: string[];
    deviceName: string;
    supportedFeatures: string[];
  }> {
    const available = await this.isAvailable();
    const types = await this.getSupportedTypes();
    const deviceName = await this.getDeviceName();
    
    const supportedFeatures: string[] = [];
    if (available) {
      supportedFeatures.push('Platform Authenticator');
      if (types.includes('platform')) {
        supportedFeatures.push('Built-in Biometrics');
      }
    }

    return {
      available,
      types,
      deviceName,
      supportedFeatures,
    };
  }
}