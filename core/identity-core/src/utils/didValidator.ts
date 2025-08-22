/**
 * Standardized DID Validation Utility
 * Provides consistent DID format validation across the Identity Protocol
 */

export interface DIDValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  didType?: 'key' | 'web' | 'ion' | 'unknown';
  method?: string;
  identifier?: string;
}

export interface DIDComponents {
  scheme: string;
  method: string;
  identifier: string;
  fragment?: string;
  query?: string;
  path?: string;
}

export class DIDValidator {
  // Standard DID format patterns
  private static readonly DID_SCHEME_PATTERN = /^did$/;
  private static readonly DID_METHOD_PATTERN = /^[a-z0-9]+$/;
  private static readonly DID_IDENTIFIER_PATTERN = /^[a-zA-Z0-9._-]+$/;
  
  // Specific DID method patterns
  private static readonly DID_KEY_PATTERN = /^did:key:[a-zA-Z0-9]{32,}$/;
  private static readonly DID_WEB_PATTERN = /^did:web:[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  private static readonly DID_ION_PATTERN = /^did:ion:[a-zA-Z0-9._-]+$/;
  
  // Public key patterns for did:key
  private static readonly PUBLIC_KEY_PATTERNS = {
    'Ed25519': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'X25519': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-256': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-384': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'P-521': /^z[1-9A-HJ-NP-Za-km-z]{44}$/,
    'RSA': /^z[1-9A-HJ-NP-Za-km-z]{44,}$/
  };

  // CID patterns for IPFS
  private static readonly CID_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;

  // Domain patterns for did:web
  private static readonly DOMAIN_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  /**
   * Validate DID format comprehensively
   */
  static validateDID(did: string): DIDValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!did || typeof did !== 'string') {
      errors.push('DID must be a non-empty string');
      return { isValid: false, errors, warnings };
    }

    // Check length limits
    if (did.length > 100) {
      errors.push('DID length exceeds maximum limit of 100 characters');
    }

    if (did.length < 10) {
      errors.push('DID appears to be too short');
    }

    // Parse DID components
    const components = this.parseDID(did);
    if (!components) {
      errors.push('Invalid DID format');
      return { isValid: false, errors, warnings };
    }

    // Validate scheme
    if (components.scheme !== 'did') {
      errors.push('DID must start with "did:"');
    }

    // Validate method
    if (!this.DID_METHOD_PATTERN.test(components.method)) {
      errors.push('Invalid DID method format');
    }

    // Validate identifier
    if (!this.DID_IDENTIFIER_PATTERN.test(components.identifier)) {
      errors.push('Invalid DID identifier format');
    }

    // Method-specific validation
    const methodValidation = this.validateMethodSpecific(did, components);
    errors.push(...methodValidation.errors);
    warnings.push(...methodValidation.warnings);

    // Check for suspicious patterns
    if (this.containsSuspiciousPatterns(did)) {
      errors.push('DID contains potentially malicious patterns');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      didType: methodValidation.didType,
      method: components.method,
      identifier: components.identifier
    };
  }

  /**
   * Parse DID into components
   */
  private static parseDID(did: string): DIDComponents | null {
    try {
      // Basic DID format: did:method:identifier
      const parts = did.split(':');
      if (parts.length < 3) {
        return null;
      }

      const scheme = parts[0];
      const method = parts[1];
      const identifier = parts.slice(2).join(':');

      return {
        scheme,
        method,
        identifier
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate method-specific DID formats
   */
  private static validateMethodSpecific(did: string, components: DIDComponents): DIDValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let didType: 'key' | 'web' | 'ion' | 'unknown' = 'unknown';

    switch (components.method) {
      case 'key':
        didType = 'key';
        if (!this.DID_KEY_PATTERN.test(did)) {
          errors.push('Invalid did:key format');
        } else {
          // Validate the public key part
          const keyPart = components.identifier;
          if (!this.isValidPublicKey(keyPart)) {
            errors.push('Invalid public key format in did:key');
          }
        }
        break;

      case 'web':
        didType = 'web';
        if (!this.DID_WEB_PATTERN.test(did)) {
          errors.push('Invalid did:web format');
        } else {
          // Validate domain format
          const domain = components.identifier;
          if (!this.DOMAIN_PATTERN.test(domain)) {
            errors.push('Invalid domain format in did:web');
          }
        }
        break;

      case 'ion':
        didType = 'ion';
        if (!this.DID_ION_PATTERN.test(did)) {
          errors.push('Invalid did:ion format');
        }
        break;

      default:
        warnings.push(`Unknown DID method: ${components.method}`);
        break;
    }

    return { isValid: errors.length === 0, errors, warnings, didType };
  }

  /**
   * Validate public key format
   */
  private static isValidPublicKey(key: string): boolean {
    // Check if it matches any of the known public key patterns
    return Object.values(this.PUBLIC_KEY_PATTERNS).some(pattern => pattern.test(key));
  }

  /**
   * Check for suspicious patterns in DID
   */
  private static containsSuspiciousPatterns(did: string): boolean {
    const suspiciousPatterns = [
      /javascript:/gi,
      /vbscript:/gi,
      /data:/gi,
      /<script/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /on\w+\s*=/gi,
      /\.\.\//g,
      /\.\.\\/g
    ];

    return suspiciousPatterns.some(pattern => pattern.test(did));
  }

  /**
   * Validate DID document structure
   */
  static validateDIDDocument(didDoc: any): DIDValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!didDoc || typeof didDoc !== 'object') {
      errors.push('DID document must be a valid object');
      return { isValid: false, errors, warnings };
    }

    // Check required fields
    if (!didDoc.id) {
      errors.push('Missing DID identifier');
    } else {
      const didValidation = this.validateDID(didDoc.id);
      if (!didValidation.isValid) {
        errors.push(...didValidation.errors.map(err => `DID validation: ${err}`));
      }
    }

    if (!didDoc.verificationMethod || !Array.isArray(didDoc.verificationMethod)) {
      errors.push('Missing or invalid verification methods');
    } else {
      // Validate verification methods
      for (const vm of didDoc.verificationMethod) {
        if (!vm.id || !vm.type || !vm.controller) {
          errors.push('Invalid verification method structure');
          break;
        }
      }
    }

    if (!didDoc.authentication || !Array.isArray(didDoc.authentication)) {
      errors.push('Missing or invalid authentication methods');
    }

    // Check for suspicious service endpoints
    if (didDoc.service && Array.isArray(didDoc.service)) {
      for (const service of didDoc.service) {
        if (service.serviceEndpoint && typeof service.serviceEndpoint === 'string') {
          if (this.containsSuspiciousPatterns(service.serviceEndpoint)) {
            errors.push('Suspicious service endpoint detected');
          }
        }
      }
    }

    // Check document size
    const docSize = JSON.stringify(didDoc).length;
    if (docSize > 10000) { // 10KB limit
      warnings.push('DID document size exceeds recommended limit');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate CID format
   */
  static validateCID(cid: string): boolean {
    if (!cid || typeof cid !== 'string') {
      return false;
    }
    return this.CID_PATTERN.test(cid);
  }

  /**
   * Validate domain format
   */
  static validateDomain(domain: string): boolean {
    if (!domain || typeof domain !== 'string') {
      return false;
    }
    return this.DOMAIN_PATTERN.test(domain);
  }

  /**
   * Validate signature format
   */
  static validateSignature(signature: string): boolean {
    if (!signature || typeof signature !== 'string') {
      return false;
    }
    
    // Basic signature format validation
    const signaturePattern = /^[A-Za-z0-9+/]{50,}$/;
    return signaturePattern.test(signature);
  }

  /**
   * Validate challenge format
   */
  static validateChallenge(challenge: string): boolean {
    if (!challenge || typeof challenge !== 'string') {
      return false;
    }
    
    // Basic challenge format validation
    const challengePattern = /^[A-Za-z0-9+/]{20,}$/;
    return challengePattern.test(challenge);
  }

  /**
   * Get DID method from DID string
   */
  static getDIDMethod(did: string): string | null {
    const components = this.parseDID(did);
    return components ? components.method : null;
  }

  /**
   * Get DID identifier from DID string
   */
  static getDIDIdentifier(did: string): string | null {
    const components = this.parseDID(did);
    return components ? components.identifier : null;
  }

  /**
   * Check if DID is a specific method
   */
  static isDIDMethod(did: string, method: string): boolean {
    const didMethod = this.getDIDMethod(did);
    return didMethod === method;
  }

  /**
   * Normalize DID (remove whitespace, convert to lowercase method)
   */
  static normalizeDID(did: string): string {
    if (!did) return did;
    
    const normalized = did.trim();
    const components = this.parseDID(normalized);
    
    if (!components) return normalized;
    
    return `did:${components.method.toLowerCase()}:${components.identifier}`;
  }

  /**
   * Generate a valid did:key from public key
   */
  static generateDIDKey(publicKey: string): string | null {
    if (!this.isValidPublicKey(publicKey)) {
      return null;
    }
    
    return `did:key:${publicKey}`;
  }

  /**
   * Extract public key from did:key
   */
  static extractPublicKeyFromDIDKey(didKey: string): string | null {
    if (!this.isDIDMethod(didKey, 'key')) {
      return null;
    }
    
    const identifier = this.getDIDIdentifier(didKey);
    if (!identifier || !this.isValidPublicKey(identifier)) {
      return null;
    }
    
    return identifier;
  }
}
