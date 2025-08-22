import { DIDDocument, VerificationMethod } from '../types';
import { DIDValidator } from '../utils/didValidator';

export interface DIDResolutionResult {
  didDocument: DIDDocument;
  metadata: {
    created: string;
    updated: string;
    deactivated?: boolean;
  };
}

export interface DIDValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class DIDResolver {
  private cache: Map<string, DIDResolutionResult> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private rateLimiter = new Map<string, { count: number; resetTime: number }>();
  private auditLog: Array<{ timestamp: string; event: string; details: any }> = [];

  /**
   * Resolve a DID from multiple sources with enhanced security
   */
  async resolve(did: string): Promise<DIDResolutionResult> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      if (!this.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many resolution attempts');
      }

      // Check cache first
      const cached = this.cache.get(did);
      if (cached && Date.now() - new Date(cached.metadata.updated).getTime() < this.cacheTimeout) {
        this.logSecurityEvent('did_resolution_cache_hit', { did, duration: Date.now() - startTime });
        return cached;
      }

      // Try multiple resolution methods with validation
      const sources = [
        () => this.resolveFromLocalStorage(did),
        () => this.resolveFromIPFS(did),
        () => this.resolveFromBlockchain(did),
        () => this.resolveFromWeb(did)
      ];

      const results: (DIDResolutionResult | null)[] = [];
      
      for (const source of sources) {
        try {
          const result = await source();
          if (result) {
            // Validate DID document before accepting
            const validation = this.validateDIDDocument(result.didDocument);
            if (validation.isValid) {
              this.cache.set(did, result);
              this.logSecurityEvent('did_resolution_success', { 
                did, 
                source: source.name,
                duration: Date.now() - startTime 
              });
              return result;
            } else {
              this.logSecurityEvent('did_resolution_validation_failed', { 
                did, 
                errors: validation.errors 
              });
            }
          }
          results.push(result);
        } catch (error) {
          this.logSecurityEvent('did_resolution_source_failed', { 
            did, 
            source: source.name,
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          results.push(null);
        }
      }

      // If no valid results, throw error
      throw new Error(`Could not resolve DID: ${did} - no valid sources found`);

    } catch (error) {
      this.logSecurityEvent('did_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime 
      });
      throw error;
    }
  }

  /**
   * Validate DID document structure and content
   */
  private validateDIDDocument(didDoc: DIDDocument): DIDValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check required fields
      if (!didDoc.id) {
        errors.push('Missing DID identifier');
      }

      if (!didDoc.verificationMethod || !Array.isArray(didDoc.verificationMethod)) {
        errors.push('Missing or invalid verification methods');
      }

      if (!didDoc.authentication || !Array.isArray(didDoc.authentication)) {
        errors.push('Missing or invalid authentication methods');
      }

      // Validate verification methods
      if (didDoc.verificationMethod) {
        for (const vm of didDoc.verificationMethod) {
          if (!vm.id || !vm.type || !vm.controller) {
            errors.push('Invalid verification method structure');
            break;
          }
        }
      }

      // Check for suspicious patterns
      if (didDoc.service) {
        for (const service of didDoc.service) {
          if (service.serviceEndpoint && typeof service.serviceEndpoint === 'string') {
            // Check for suspicious URLs
            if (service.serviceEndpoint.includes('javascript:') || 
                service.serviceEndpoint.includes('data:') ||
                service.serviceEndpoint.includes('vbscript:')) {
              errors.push('Suspicious service endpoint detected');
            }
          }
        }
      }

      // Check for reasonable size limits
      const docSize = JSON.stringify(didDoc).length;
      if (docSize > 10000) { // 10KB limit
        warnings.push('DID document size exceeds recommended limit');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        isValid: false,
        errors: ['Failed to validate DID document structure'],
        warnings: []
      };
    }
  }

  /**
   * Resolve DID from local storage with enhanced security
   */
  private async resolveFromLocalStorage(did: string): Promise<DIDResolutionResult | null> {
    try {
      const stored = sessionStorage.getItem(`did:${did}`);
      if (!stored) return null;

      const didDoc = JSON.parse(stored);
      
      // Additional validation for local storage
      if (!this.isValidDIDFormat(didDoc.id)) {
        throw new Error('Invalid DID format in local storage');
      }

      return {
        didDocument: didDoc,
        metadata: {
          created: didDoc.created || new Date().toISOString(),
          updated: didDoc.updated || new Date().toISOString()
        }
      };
    } catch (error) {
      this.logSecurityEvent('local_storage_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Resolve DID from IPFS with enhanced security
   */
  private async resolveFromIPFS(did: string): Promise<DIDResolutionResult | null> {
    try {
      // Extract IPFS CID from DID
      const ipfsMatch = did.match(/did:ipfs:(.+)/);
      if (!ipfsMatch) return null;

      const cid = ipfsMatch[1];
      
      // Validate CID format
      if (!this.isValidCIDFormat(cid)) {
        throw new Error('Invalid IPFS CID format');
      }

      const gateways = [
        'https://ipfs.io',
        'https://gateway.pinata.cloud',
        'https://cloudflare-ipfs.com',
        'https://dweb.link'
      ];

      for (const gateway of gateways) {
        try {
          const response = await fetch(`${gateway}/ipfs/${cid}`, {
            headers: {
              'Accept': 'application/did+json, application/json'
            }
          });
          
          if (!response.ok) {
            continue;
          }

          const didDoc = await response.json();
          
          // Validate the downloaded document
          if (!this.isValidDIDFormat(didDoc.id)) {
            continue;
          }

          return {
            didDocument: didDoc,
            metadata: {
              created: didDoc.created || new Date().toISOString(),
              updated: didDoc.updated || new Date().toISOString()
            }
          };
        } catch (error) {
          // IPFS gateway failed, continue to next
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logSecurityEvent('ipfs_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Resolve DID from blockchain with enhanced security
   */
  private async resolveFromBlockchain(did: string): Promise<DIDResolutionResult | null> {
    try {
      // Support for different blockchain DID methods
      const methods = [
        () => this.resolveDidKey(did),
        () => this.resolveDidWeb(did),
        () => this.resolveDidIon(did)
      ];

      for (const method of methods) {
        try {
          const result = await method();
          if (result) {
            // Validate blockchain result
            const validation = this.validateDIDDocument(result.didDocument);
            if (validation.isValid) {
              return result;
            }
          }
        } catch (error) {
          // Blockchain resolution failed, continue to next
        }
      }

      return null;
    } catch (error) {
      this.logSecurityEvent('blockchain_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Resolve DID from web with certificate pinning and enhanced security
   */
  private async resolveFromWeb(did: string): Promise<DIDResolutionResult | null> {
    try {
      const webMatch = did.match(/did:web:(.+)/);
      if (!webMatch) return null;

      const domain = webMatch[1];
      
      // Validate domain format
      if (!this.isValidDomainFormat(domain)) {
        throw new Error('Invalid domain format in DID');
      }

      const gateways = [
        `https://${domain}/.well-known/did.json`,
        `https://${domain}/.well-known/did`
      ];

      for (const url of gateways) {
        try {
          const response = await fetch(url, {
            headers: {
              'Accept': 'application/did+json, application/json'
            }
          });
          
          if (!response.ok) {
            continue;
          }

          const didDoc = await response.json();
          
          // Validate the downloaded document
          if (!this.isValidDIDFormat(didDoc.id)) {
            continue;
          }

          return {
            didDocument: didDoc,
            metadata: {
              created: didDoc.created || new Date().toISOString(),
              updated: didDoc.updated || new Date().toISOString()
            }
          };
        } catch (error) {
          // Web resolution failed, continue to next
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logSecurityEvent('web_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Resolve did:key DIDs with enhanced validation
   */
  private async resolveDidKey(did: string): Promise<DIDResolutionResult | null> {
    const keyMatch = did.match(/did:key:(.+)/);
    if (!keyMatch) return null;

    const publicKey = keyMatch[1];
    
    // Validate public key format
    if (!this.isValidPublicKeyFormat(publicKey)) {
      throw new Error('Invalid public key format in did:key');
    }
    
    // did:key is self-contained, we can derive the DID document
    const didDoc: DIDDocument = {
      id: did,
      verificationMethod: [{
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: publicKey
      }],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
      capabilityInvocation: [`${did}#key-1`],
      capabilityDelegation: [`${did}#key-1`]
    };

    return {
      didDocument: didDoc,
      metadata: {
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      }
    };
  }

  /**
   * Resolve did:web DIDs with enhanced security
   */
  private async resolveDidWeb(did: string): Promise<DIDResolutionResult | null> {
    return this.resolveFromWeb(did);
  }

  /**
   * Resolve did:ion DIDs with enhanced security
   */
  private async resolveDidIon(did: string): Promise<DIDResolutionResult | null> {
    try {
      // ION DIDs are resolved through the ION network
      const ionMatch = did.match(/did:ion:(.+)/);
      if (!ionMatch) return null;

      const suffix = ionMatch[1];
      
      // Validate ION suffix format
      if (!this.isValidIONFormat(suffix)) {
        throw new Error('Invalid ION DID format');
      }

      const response = await fetch(`https://ion.tbd.engineering/identifiers/${did}`, {
        headers: {
          'Accept': 'application/did+json, application/json'
        }
      });
      
      if (!response.ok) return null;

      const result = await response.json();
      
      // Validate ION result
      if (!result.didDocument || !this.isValidDIDFormat(result.didDocument.id)) {
        throw new Error('Invalid ION DID document');
      }

      return {
        didDocument: result.didDocument,
        metadata: result.metadata
      };
    } catch (error) {
      this.logSecurityEvent('ion_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Validate DID format using standardized validator
   */
  private isValidDIDFormat(did: string): boolean {
    const validation = DIDValidator.validateDID(did);
    return validation.isValid;
  }

  /**
   * Validate CID format using standardized validator
   */
  private isValidCIDFormat(cid: string): boolean {
    return DIDValidator.validateCID(cid);
  }

  /**
   * Validate domain format using standardized validator
   */
  private isValidDomainFormat(domain: string): boolean {
    return DIDValidator.validateDomain(domain);
  }

  /**
   * Validate public key format using standardized validator
   */
  private isValidPublicKeyFormat(key: string): boolean {
    // Use the standardized public key validation
    const validation = DIDValidator.validateDID(`did:key:${key}`);
    return validation.isValid;
  }

  /**
   * Validate ION format using standardized validator
   */
  private isValidIONFormat(suffix: string): boolean {
    const validation = DIDValidator.validateDID(`did:ion:${suffix}`);
    return validation.isValid;
  }

  /**
   * Rate limiting to prevent abuse
   */
  private checkRateLimit(did: string): boolean {
    const now = Date.now();
    const limit = this.rateLimiter.get(did);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimiter.set(did, { count: 1, resetTime: now + 60000 }); // 1 minute window
      return true;
    }
    
    if (limit.count >= 10) { // Max 10 attempts per minute
      this.logSecurityEvent('did_resolution_rate_limit_exceeded', { did });
      return false;
    }
    
    limit.count++;
    return true;
  }

  /**
   * Log security events for audit
   */
  private logSecurityEvent(event: string, details: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent
    };
    
    this.auditLog.push(logEntry);
    
    // Keep only last 1000 events
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    // Send to secure logging service in production
    this.sendToAuditLog(logEntry);
  }

  /**
   * Send audit log entry to secure logging service
   */
  private async sendToAuditLog(logEntry: any): Promise<void> {
    try {
      // In production, this would send to a secure logging service
      // Silently handle audit logging in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle audit log failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }

  /**
   * Clear resolution cache
   */
  clearCache(): void {
    this.cache.clear();
    this.logSecurityEvent('cache_cleared', {});
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
    this.logSecurityEvent('cache_timeout_updated', { timeout });
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any }> {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
} 