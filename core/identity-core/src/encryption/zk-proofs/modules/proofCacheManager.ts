import { ZKProof, ZKProofCacheEntry, ZKProofStats, ZKProofAuditEntry } from '../types/zkProofs';

export class ProofCacheManager {
  private proofCache: Map<string, ZKProofCacheEntry> = new Map();
  private auditLog: ZKProofAuditEntry[] = [];
  private maxCacheSize: number;
  private enableAuditLogging: boolean;

  constructor(maxCacheSize: number = 1000, enableAuditLogging: boolean = true) {
    this.maxCacheSize = maxCacheSize;
    this.enableAuditLogging = enableAuditLogging;
  }

  /**
   * Store a proof in the cache
   */
  storeProof(proof: ZKProof): void {
    try {
      const cacheEntry: ZKProofCacheEntry = {
        proof,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0
      };

      // Check if cache is full
      if (this.proofCache.size >= this.maxCacheSize) {
        this.evictOltEntry();
      }

      this.proofCache.set(proof.id, cacheEntry);
      
      if (this.enableAuditLogging) {
        this.logAuditEvent('PROOF_STORED', proof.id, { proofType: proof.type });
      }
    } catch (error) {
      // Console statement removed for production
    }
  }

  /**
   * Retrieve a proof from the cache
   */
  getProof(proofId: string): ZKProof | null {
    try {
      const cacheEntry = this.proofCache.get(proofId);
      if (!cacheEntry) {
        return null;
      }

      // Update access statistics
      cacheEntry.lastAccessed = Date.now();
      cacheEntry.accessCount++;

      if (this.enableAuditLogging) {
        this.logAuditEvent('PROOF_ACCESSED', proofId, { accessCount: cacheEntry.accessCount });
      }

      return cacheEntry.proof;
    } catch (error) {
      // Console statement removed for production
      return null;
    }
  }

  /**
   * Remove a proof from the cache
   */
  removeProof(proofId: string): boolean {
    try {
      const removed = this.proofCache.delete(proofId);
      
      if (removed && this.enableAuditLogging) {
        this.logAuditEvent('PROOF_REMOVED', proofId, {});
      }

      return removed;
    } catch (error) {
      // Console statement removed for production
      return false;
    }
  }

  /**
   * Check if a proof exists in the cache
   */
  hasProof(proofId: string): boolean {
    return this.proofCache.has(proofId);
  }

  /**
   * Get all cached proofs
   */
  getAllProofs(): ZKProof[] {
    return Array.from(this.proofCache.values()).map(entry => entry.proof);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ZKProofStats {
    try {
      const now = Date.now();
      let totalAge = 0;
      let activeProofs = 0;
      let expiredProofs = 0;
      let quantumResistantCount = 0;
      const securityLevels: Record<string, number> = {};
      const proofTypes: Record<string, number> = {};

      for (const [proofId, entry] of this.proofCache) {
        const age = now - entry.createdAt;
        totalAge += age;

        // Check if proof is expired
        const expiresAt = new Date(entry.proof.expiresAt).getTime();
        if (now > expiresAt) {
          expiredProofs++;
        } else {
          activeProofs++;
        }

        // Count security levels
        const securityLevel = entry.proof.securityLevel;
        securityLevels[securityLevel] = (securityLevels[securityLevel] || 0) + 1;

        // Count quantum resistant proofs
        if (entry.proof.quantumResistant) {
          quantumResistantCount++;
        }

        // Count proof types
        const proofType = entry.proof.type;
        proofTypes[proofType] = (proofTypes[proofType] || 0) + 1;
      }

      const totalProofs = this.proofCache.size;
      const validProofs = Array.from(this.proofCache.values()).filter(entry => 
        entry && entry.createdAt && (Date.now() - entry.createdAt) < (24 * 60 * 60 * 1000) // 24 hours
      ).length;
      const complianceRate = totalProofs > 0 ? Math.round((validProofs / totalProofs) * 100) : 0;
      const averageProofAge = totalProofs > 0 ? totalAge / totalProofs : 0;

      const securityCompliance = {
        standard: securityLevels['standard'] || 0,
        military: securityLevels['military'] || 0,
        topSecret: securityLevels['top-secret'] || 0
      };

      return {
        totalProofs,
        activeProofs,
        expiredProofs,
        securityLevels,
        complianceRate,
        quantumResistantCount,
        averageProofAge,
        proofTypes,
        securityCompliance
      };
    } catch (error) {
      // Console statement removed for production
      return {
        totalProofs: 0,
        activeProofs: 0,
        expiredProofs: 0,
        securityLevels: {},
        complianceRate: 0,
        quantumResistantCount: 0,
        averageProofAge: 0,
        proofTypes: {},
        securityCompliance: {
          standard: 0,
          military: 0,
          topSecret: 0
        }
      };
    }
  }

  /**
   * Clean up expired proofs
   */
  cleanupExpiredProofs(): number {
    try {
      const now = Date.now();
      let removedCount = 0;
      const expiredProofIds: string[] = [];

      // Find expired proofs
      for (const [proofId, entry] of this.proofCache) {
        const expiresAt = new Date(entry.proof.expiresAt).getTime();
        if (now > expiresAt) {
          expiredProofIds.push(proofId);
        }
      }

      // Remove expired proofs
      for (const proofId of expiredProofIds) {
        if (this.removeProof(proofId)) {
          removedCount++;
        }
      }

      if (this.enableAuditLogging && removedCount > 0) {
        this.logAuditEvent('EXPIRED_PROOFS_CLEANED', 'SYSTEM', { removedCount });
      }

      return removedCount;
    } catch (error) {
      // Console statement removed for production
      return 0;
    }
  }

  /**
   * Clear all proofs from cache
   */
  clearCache(): void {
    try {
      const cacheSize = this.proofCache.size;
      this.proofCache.clear();
      
      if (this.enableAuditLogging) {
        this.logAuditEvent('CACHE_CLEARED', 'SYSTEM', { clearedCount: cacheSize });
      }
    } catch (error) {
      // Console statement removed for production
    }
  }

  /**
   * Export cache data for backup
   */
  exportCacheData(): string {
    try {
      const cacheData = {
        timestamp: new Date().toISOString(),
        cacheSize: this.proofCache.size,
        proofs: Array.from(this.proofCache.entries()).map(([id, entry]) => ({
          id,
          proof: entry.proof,
          createdAt: entry.createdAt,
          lastAccessed: entry.lastAccessed,
          accessCount: entry.accessCount
        }))
      };

      return JSON.stringify(cacheData, null, 2);
    } catch (error) {
      // Console statement removed for production
      return '{}';
    }
  }

  /**
   * Import cache data from backup
   */
  importCacheData(cacheData: string): boolean {
    try {
      const parsed = JSON.parse(cacheData);
      
      if (!parsed.proofs || !Array.isArray(parsed.proofs)) {
        throw new Error('Invalid cache data format');
      }

      // Clear existing cache
      this.clearCache();

      // Import proofs
      for (const proofEntry of parsed.proofs) {
        if (proofEntry.proof && proofEntry.id) {
          const cacheEntry: ZKProofCacheEntry = {
            proof: proofEntry.proof,
            createdAt: proofEntry.createdAt || Date.now(),
            lastAccessed: proofEntry.lastAccessed || Date.now(),
            accessCount: proofEntry.accessCount || 0
          };
          this.proofCache.set(proofEntry.id, cacheEntry);
        }
      }

      if (this.enableAuditLogging) {
        this.logAuditEvent('CACHE_IMPORTED', 'SYSTEM', { importedCount: parsed.proofs.length });
      }

      return true;
    } catch (error) {
      // Console statement removed for production
      return false;
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(limit: number = 100): ZKProofAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Update cache configuration
   */
  updateConfig(maxCacheSize?: number, enableAuditLogging?: boolean): void {
    if (maxCacheSize !== undefined) {
      this.maxCacheSize = maxCacheSize;
    }
    
    if (enableAuditLogging !== undefined) {
      this.enableAuditLogging = enableAuditLogging;
    }

    // If cache size was reduced, evict excess entries
    while (this.proofCache.size > this.maxCacheSize) {
      this.evictOltEntry();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): { maxCacheSize: number; enableAuditLogging: boolean } {
    return {
      maxCacheSize: this.maxCacheSize,
      enableAuditLogging: this.enableAuditLogging
    };
  }

  /**
   * Evict the olt cache entry
   */
  private evictOltEntry(): void {
    try {
      let oltId: string | null = null;
      let oltTime = Date.now();

      for (const [proofId, entry] of this.proofCache) {
        if (entry.createdAt < oltTime) {
          oltTime = entry.createdAt;
          oltId = proofId;
        }
      }

      if (oltId) {
        this.removeProof(oltId);
      }
    } catch (error) {
      // Console statement removed for production
    }
  }

  /**
   * Log audit event
   */
  private logAuditEvent(event: string, proofId: string, details: any): void {
    try {
      const auditEntry: ZKProofAuditEntry = {
        timestamp: new Date().toISOString(),
        event,
        proofId,
        details,
        userAgent: navigator.userAgent,
        ipAddress: '127.0.0.1' // In production, get from request context
      };

      this.auditLog.push(auditEntry);

      // Keep audit log size manageable
      if (this.auditLog.length > 10000) {
        this.auditLog = this.auditLog.slice(-5000);
      }
    } catch (error) {
      // Console statement removed for production
    }
  }
}
