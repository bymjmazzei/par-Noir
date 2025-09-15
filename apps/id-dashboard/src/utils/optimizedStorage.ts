// Optimized Storage Manager for better performance
// Uses Map for O(1) lookups, caching, and batch operations

import { DIDInfo } from '../types/identity';

interface StorageCache<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface BatchOperation<T> {
  type: 'set' | 'delete' | 'update';
  key: string;
  value?: T;
  updates?: Partial<T>;
}

export class OptimizedIdentityStorage {
  private identities = new Map<string, DIDInfo>();
  private byPNName = new Map<string, string>(); // pnName -> id mapping
  private byEmail = new Map<string, string[]>(); // email -> id[] mapping
  private byStatus = new Map<string, string[]>(); // status -> id[] mapping
  private cache = new Map<string, StorageCache<any>>();
  private batchQueue: BatchOperation<DIDInfo>[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private maxCacheSize = 1000;
  private defaultTTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.startBatchProcessor();
  }

  // Add identity with optimized indexing
  add(identity: DIDInfo): void {
    const id = identity.id;
    
    // Store main identity
    this.identities.set(id, identity);
    
    // Update indexes
    this.byPNName.set(identity.pnName, id);
    
    if (identity.email) {
      const existingIds = this.byEmail.get(identity.email) || [];
      if (!existingIds.includes(id)) {
        this.byEmail.set(identity.email, [...existingIds, id]);
      }
    }
    
    const existingStatusIds = this.byStatus.get(identity.status) || [];
    if (!existingStatusIds.includes(id)) {
      this.byStatus.set(identity.status, [...existingStatusIds, id]);
    }
    
    // Invalidate related caches
    this.invalidateCache(`identity_${id}`);
    this.invalidateCache(`pnname_${identity.pnName}`);
    if (identity.email) {
      this.invalidateCache(`email_${identity.email}`);
    }
    this.invalidateCache(`status_${identity.status}`);
  }

  // Get by ID with caching
  getById(id: string): DIDInfo | undefined {
    const cacheKey = `identity_${id}`;
    const cached = this.getFromCache<DIDInfo>(cacheKey);
    if (cached) return cached;
    
    const identity = this.identities.get(id);
    if (identity) {
      this.setCache(cacheKey, identity);
    }
    return identity;
  }

  // Get by pN Name with caching
  getByPNName(pnName: string): DIDInfo | undefined {
    const cacheKey = `pnname_${pnName}`;
    const cached = this.getFromCache<DIDInfo>(cacheKey);
    if (cached) return cached;
    
    const id = this.byPNName.get(pnName);
    if (id) {
      const identity = this.identities.get(id);
      if (identity) {
        this.setCache(cacheKey, identity);
        return identity;
      }
    }
    return undefined;
  }

  // Get by email with caching
  getByEmail(email: string): DIDInfo[] {
    const cacheKey = `email_${email}`;
    const cached = this.getFromCache<DIDInfo[]>(cacheKey);
    if (cached) return cached;
    
    const ids = this.byEmail.get(email) || [];
    const identities = ids.map(id => this.identities.get(id)).filter(Boolean) as DIDInfo[];
    
    this.setCache(cacheKey, identities);
    return identities;
  }

  // Get by status with caching
  getByStatus(status: string): DIDInfo[] {
    const cacheKey = `status_${status}`;
    const cached = this.getFromCache<DIDInfo[]>(cacheKey);
    if (cached) return cached;
    
    const ids = this.byStatus.get(status) || [];
    const identities = ids.map(id => this.identities.get(id)).filter(Boolean) as DIDInfo[];
    
    this.setCache(cacheKey, identities);
    return identities;
  }

  // Get all identities with pagination
  getAll(page = 1, pageSize = 20, filters?: {
    status?: string;
    search?: string;
    sortBy?: keyof DIDInfo;
    sortOrder?: 'asc' | 'c';
  }): { identities: DIDInfo[]; total: number; page: number; totalPages: number } {
    let filtered = Array.from(this.identities.values());
    
    // Apply filters
    if (filters?.status) {
      filtered = filtered.filter(id => id.status === filters.status);
    }
    
    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(id => 
        id.pnName.toLowerCase().includes(searchTerm) ||
        (id.displayName && id.displayName.toLowerCase().includes(searchTerm)) ||
        (id.email && id.email.toLowerCase().includes(searchTerm))
      );
    }
    
    // Apply sorting
    if (filters?.sortBy) {
      filtered.sort((a, b) => {
        const aValue = a[filters.sortBy!];
        const bValue = b[filters.sortBy!];
        
        if (aValue === bValue) return 0;
        
        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        }
        
        return filters.sortOrder === 'c' ? -comparison : comparison;
      });
    }
    
    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const identities = filtered.slice(startIndex, endIndex);
    
    return { identities, total, page, totalPages };
  }

  // Update identity with batch processing
  update(id: string, updates: Partial<DIDInfo>): void {
    const identity = this.identities.get(id);
    if (!identity) return;
    
    // Add to batch queue
    this.batchQueue.push({
      type: 'update',
      key: id,
      updates
    });
    
    // Schedule batch processing
    this.scheduleBatch();
  }

  // Delete identity with cleanup
  delete(id: string): void {
    const identity = this.identities.get(id);
    if (!identity) return;
    
    // Remove from main storage
    this.identities.delete(id);
    
    // Clean up indexes
    this.byPNName.delete(identity.pnName);
    
    if (identity.email) {
      const emailIds = this.byEmail.get(identity.email) || [];
      this.byEmail.set(identity.email, emailIds.filter(emailId => emailId !== id));
      if (this.byEmail.get(identity.email)?.length === 0) {
        this.byEmail.delete(identity.email);
      }
    }
    
    const statusIds = this.byStatus.get(identity.status) || [];
    this.byStatus.set(identity.status, statusIds.filter(statusId => statusId !== id));
    if (this.byStatus.get(identity.status)?.length === 0) {
      this.byStatus.delete(identity.status);
    }
    
    // Invalidate caches
    this.invalidateCache(`identity_${id}`);
    this.invalidateCache(`pnname_${identity.pnName}`);
    if (identity.email) {
      this.invalidateCache(`email_${identity.email}`);
    }
    this.invalidateCache(`status_${identity.status}`);
  }

  // Batch operations for better performance
  private startBatchProcessor(): void {
    // Process batches every 100ms
    setInterval(() => {
      this.processBatch();
    }, 100);
  }

  private scheduleBatch(): void {
    if (this.batchTimer) return;
    
    this.batchTimer = setTimeout(() => {
      this.processBatch();
      this.batchTimer = null;
    }, 50); // Process batch within 50ms
  }

  private processBatch(): void {
    if (this.batchQueue.length === 0) return;
    
    const operations = this.batchQueue.splice(0);
    
    operations.forEach(operation => {
      switch (operation.type) {
        case 'update':
          if (operation.updates) {
            const identity = this.identities.get(operation.key);
            if (identity) {
              const updated = { ...identity, ...operation.updates };
              this.identities.set(operation.key, updated);
              
              // Update indexes if relevant fields changed
              if (operation.updates.email && operation.updates.email !== identity.email) {
                // Remove from old email index
                if (identity.email) {
                  const oldEmailIds = this.byEmail.get(identity.email) || [];
                  this.byEmail.set(identity.email, oldEmailIds.filter(id => id !== operation.key));
                  if (this.byEmail.get(identity.email)?.length === 0) {
                    this.byEmail.delete(identity.email);
                  }
                }
                
                // Add to new email index
                const newEmailIds = this.byEmail.get(operation.updates.email) || [];
                if (!newEmailIds.includes(operation.key)) {
                  this.byEmail.set(operation.updates.email, [...newEmailIds, operation.key]);
                }
              }
              
              if (operation.updates.status && operation.updates.status !== identity.status) {
                // Remove from old status index
                const oldStatusIds = this.byStatus.get(identity.status) || [];
                this.byStatus.set(identity.status, oldStatusIds.filter(id => id !== operation.key));
                if (this.byStatus.get(identity.status)?.length === 0) {
                  this.byStatus.delete(identity.status);
                }
                
                // Add to new status index
                const newStatusIds = this.byStatus.get(operation.updates.status) || [];
                if (!newStatusIds.includes(operation.key)) {
                  this.byStatus.set(operation.updates.status, [...newStatusIds, operation.key]);
                }
              }
            }
          }
          break;
      }
    });
  }

  // Cache management
  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  private setCache<T>(key: string, data: T, ttl = this.defaultTTL): void {
    // Clean up old cache entries if we're at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oltKey = this.cache.keys().next().value;
      this.cache.delete(oltKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  private invalidateCache(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // Clear all data
  clear(): void {
    this.identities.clear();
    this.byPNName.clear();
    this.byEmail.clear();
    this.byStatus.clear();
    this.cache.clear();
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // Get statistics
  getStats(): {
    totalIdentities: number;
    cacheSize: number;
    batchQueueSize: number;
    indexSizes: { pnName: number; email: number; status: number };
  } {
    return {
      totalIdentities: this.identities.size,
      cacheSize: this.cache.size,
      batchQueueSize: this.batchQueue.length,
      indexSizes: {
        pnName: this.byPNName.size,
        email: this.byEmail.size,
        status: this.byStatus.size
      }
    };
  }

  // Export data for backup
  export(): DIDInfo[] {
    return Array.from(this.identities.values());
  }

  // Import data from backup
  import(identities: DIDInfo[]): void {
    this.clear();
    identities.forEach(identity => this.add(identity));
  }
}

// Export singleton instance
export const optimizedIdentityStorage = new OptimizedIdentityStorage();
