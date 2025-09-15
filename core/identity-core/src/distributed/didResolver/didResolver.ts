// Main DIDResolver Class - Maintains backward compatibility while using modular components
import { DIDDocument } from '../../types';
import { DIDResolutionResult, DIDValidationResult } from '../types/didResolver';
import { DIDDocumentValidator } from './documentValidator';
import { FormatValidator } from './formatValidator';
import { ResolutionSources } from './resolutionSources';
import { DIDMethodResolvers } from './didMethodResolvers';
import { SecurityManager } from './securityManager';
import { CacheManager } from './cacheManager';

export class DIDResolver {
  private securityManager: SecurityManager;
  private cacheManager: CacheManager;

  constructor() {
    this.securityManager = new SecurityManager();
    this.cacheManager = new CacheManager();
  }

  /**
   * Resolve a DID from multiple sources with enhanced security
   */
  async resolve(did: string): Promise<DIDResolutionResult> {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      if (!this.securityManager.checkRateLimit(did)) {
        throw new Error('Rate limit exceeded - too many resolution attempts');
      }

      // Check cache first
      const cached = this.cacheManager.get(did);
      if (cached) {
        this.securityManager.logSecurityEvent('did_resolution_cache_hit', { did, duration: Date.now() - startTime });
        return cached;
      }

      // Try multiple resolution methods with validation
      const sources = [
        () => ResolutionSources.resolveFromLocalStorage(did),
        () => ResolutionSources.resolveFromIPFS(did),
        () => DIDMethodResolvers.resolveFromBlockchain(did),
        () => ResolutionSources.resolveFromWeb(did)
      ];

      const results: (DIDResolutionResult | null)[] = [];
      
      for (const source of sources) {
        try {
          const result = await source();
          if (result) {
            // Validate DID document before accepting
            const validation = DIDDocumentValidator.validateDIDDocument(result.didDocument);
            if (validation.isValid) {
              this.cacheManager.set(did, result);
              this.securityManager.logSecurityEvent('did_resolution_success', { 
                did, 
                source: source.name,
                duration: Date.now() - startTime 
              });
              return result;
            } else {
              this.securityManager.logSecurityEvent('did_resolution_validation_failed', { 
                did, 
                errors: validation.errors 
              });
            }
          }
          results.push(result);
        } catch (error) {
          this.securityManager.logSecurityEvent('did_resolution_source_failed', { 
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
      this.securityManager.logSecurityEvent('did_resolution_failed', { 
        did, 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime 
      });
      throw error;
    }
  }

  /**
   * Clear resolution cache
   */
  clearCache(): void {
    this.cacheManager.clear();
    this.securityManager.logSecurityEvent('cache_cleared', {});
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(timeout: number): void {
    this.cacheManager.setTimeout(timeout);
    this.securityManager.logSecurityEvent('cache_timeout_updated', { timeout });
  }

  /**
   * Get audit log for security monitoring
   */
  getAuditLog(): Array<{ timestamp: string; event: string; details: any }> {
    return this.securityManager.getAuditLog();
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.securityManager.clearAuditLog();
  }
}
